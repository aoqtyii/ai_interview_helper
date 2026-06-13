import { BadGatewayException, BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { AssessmentFindingType, Difficulty, InterviewStatus, Prisma, RecordStatus, Speaker, UserRole } from '@prisma/client';
import { AiGatewayService } from '../ai/ai-gateway.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';

const DEFAULT_MAX_CANDIDATE_ANSWERS = 5;
const DEFAULT_MIN_CANDIDATE_ANSWERS_FOR_REPORT = 2;
const ASSESSMENT_SCHEMA_VERSION = 2;
const DEFAULT_RECOMMENDED_RESOURCES_PER_PLAN_ITEM = 3;
const DEFAULT_INTERVIEW_TOPIC = 'AI Agent 应用落地';
const ASSESSMENT_DIMENSIONS = [
  { key: 'ai_llm_foundation', name: 'AI / LLM 基础理解' },
  { key: 'agent_rag_tooling_depth', name: 'Agent / RAG / 工具调用技术深度' },
  { key: 'system_architecture_engineering', name: '系统架构与工程实现能力' },
  { key: 'application_solution_design', name: '应用方案设计能力' },
  { key: 'business_product_decomposition', name: '业务 / 产品拆解能力' },
  { key: 'evaluation_metrics_risk', name: '评估、指标与风险控制' },
  { key: 'structured_communication', name: '表达结构与沟通能力' }
] as const;

type AssessmentDimensionKey = (typeof ASSESSMENT_DIMENSIONS)[number]['key'];

type AssessmentDimensionScorePayload = {
  dimensionKey: AssessmentDimensionKey;
  dimensionName: string;
  score: number;
  rationale: string;
};

type AssessmentFindingPayload = {
  dimensionKey: AssessmentDimensionKey;
  content: string;
};

type ImprovementPlanItemPayload = {
  dimensionKey: AssessmentDimensionKey;
  title: string;
  weakness: string;
  practiceMethod: string;
  priority: number;
  estimatedMinutes: number;
  skillId?: string;
  learningItemId?: string;
};

type AssessmentReportPayload = {
  overallScore: number;
  dimensionScores: AssessmentDimensionScorePayload[];
  summary: string;
  strengths: AssessmentFindingPayload[];
  weaknesses: AssessmentFindingPayload[];
  improvementPlan: ImprovementPlanItemPayload[];
  nextPractice: string;
};

@Injectable()
export class InterviewsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AiGatewayService) private readonly ai: AiGatewayService,
    @Optional() @Inject(SettingsService) private readonly settings?: SettingsService
  ) {}

  async create(userId: string, input: { roleProfileId: string; difficulty?: Difficulty; topic?: string }) {
    const interviewConfig = await this.resolveInterviewConfig();
    const role = await this.prisma.roleProfile.findUniqueOrThrow({
      where: { id: input.roleProfileId },
      include: { skills: true }
    });
    const topic = input.topic?.trim() || interviewConfig.defaultTopic;

    const firstQuestion = await this.ai.run({
      taskType: 'interviewer_turn',
      userId,
      system: '你是一名严格但支持性的 AI 岗位中文面试官。问题要贴近真实 AI 应用层岗位。',
      input: `岗位：${role.name}\n主题：${topic}\n技能：${role.skills.map((skill) => skill.name).join('、')}`
    });

    const session = await this.prisma.interviewSession.create({
      data: {
        userId,
        roleProfileId: role.id,
        difficulty: input.difficulty ?? Difficulty.MID,
        topic,
        status: InterviewStatus.IN_PROGRESS,
        startedAt: new Date(),
        turns: {
          create: {
            speaker: Speaker.INTERVIEWER,
            content: firstQuestion
          }
        }
      }
    });

    return this.get(userId, UserRole.USER, session.id);
  }

  async list(userId: string, role: UserRole) {
    const sessions = await this.prisma.interviewSession.findMany({
      where: role === UserRole.ADMIN ? undefined : { userId },
      include: { roleProfile: true, report: this.reportInclude(userId), turns: { take: 1, orderBy: { createdAt: 'desc' } } },
      orderBy: { createdAt: 'desc' }
    });
    return sessions.map((session) => this.withRecommendationReasons(session));
  }

  async get(userId: string, role: UserRole, sessionId: string) {
    const session = await this.prisma.interviewSession.findUnique({
      where: { id: sessionId },
      include: { roleProfile: { include: { skills: true } }, turns: { orderBy: { createdAt: 'asc' } }, report: this.reportInclude(userId) }
    });
    if (!session) throw new NotFoundException('Interview session not found');
    if (role !== UserRole.ADMIN && session.userId !== userId) throw new ForbiddenException('Cannot access this session');
    return this.withRecommendationReasons(session);
  }

  async clientConfig() {
    return this.resolveInterviewConfig();
  }

  async createFocusedSession(userId: string, role: UserRole, reportId: string) {
    const interviewConfig = await this.resolveInterviewConfig();
    if (!interviewConfig.focusedPracticeEnabled) throw new BadRequestException('Focused practice is disabled');
    const report = await this.prisma.assessmentReport.findUnique({
      where: { id: reportId },
      include: {
        session: {
          include: {
            roleProfile: { include: { skills: true } }
          }
        },
        findings: { orderBy: { position: 'asc' } },
        improvementPlans: {
          include: {
            planItems: { orderBy: { priority: 'asc' }, include: { skill: true } }
          }
        }
      }
    });

    if (!report) throw new NotFoundException('Assessment report not found');
    if (role !== UserRole.ADMIN && report.session.userId !== userId) throw new ForbiddenException('Cannot access this report');

    const focus = this.buildFocusedPracticeContext(report);
    if (!focus) throw new BadRequestException('This report does not have enough weakness context for focused practice');

    const firstQuestion = await this.ai.run({
      taskType: 'interviewer_turn',
      userId,
      system:
        '你是一名严格但支持性的 AI 岗位中文面试官。现在要基于候选人上一轮面试报告做专项训练。只提出一个高价值开场问题，问题必须聚焦短板，不要给答案。',
      input: [
        `岗位：${report.session.roleProfile.name}`,
        `原面试主题：${report.session.topic ?? '综合能力'}`,
        `专项训练主题：${focus.topic}`,
        `主要短板：${focus.weaknesses.join('；')}`,
        `建议练习方式：${focus.practiceMethods.join('；')}`,
        `岗位技能：${report.session.roleProfile.skills.map((skill) => skill.name).join('、')}`
      ].join('\n')
    });

    const session = await this.prisma.interviewSession.create({
      data: {
        userId: report.session.userId,
        roleProfileId: report.session.roleProfileId,
        difficulty: report.session.difficulty,
        topic: focus.topic,
        status: InterviewStatus.IN_PROGRESS,
        startedAt: new Date(),
        turns: {
          create: {
            speaker: Speaker.INTERVIEWER,
            content: firstQuestion
          }
        }
      }
    });

    return this.get(userId, role, session.id);
  }

  async addTurn(userId: string, role: UserRole, sessionId: string, content: string) {
    const interviewConfig = await this.resolveInterviewConfig();
    const session = await this.get(userId, role, sessionId);
    if (session.status !== InterviewStatus.IN_PROGRESS) throw new ForbiddenException('Session is not in progress');
    const candidateAnswerCount = this.countCandidateAnswers(session.turns);
    if (candidateAnswerCount >= interviewConfig.maxTurns) {
      throw new ForbiddenException('Interview has reached the maximum answer rounds');
    }

    if (candidateAnswerCount + 1 >= interviewConfig.maxTurns) {
      await this.prisma.interviewTurn.create({
        data: { sessionId, speaker: Speaker.CANDIDATE, content }
      });

      return this.get(userId, role, sessionId);
    }

    const transcript = [...session.turns, { speaker: Speaker.CANDIDATE, content }]
      .map((turn) => `${turn.speaker}: ${turn.content}`)
      .join('\n');

    const nextQuestion = await this.ai.run({
      taskType: 'interviewer_turn',
      userId,
      system: '你是 AI 岗位中文面试官。根据候选人回答追问一个高价值问题，避免重复。',
      input: transcript
    });

    await this.prisma.$transaction([
      this.prisma.interviewTurn.create({
        data: { sessionId, speaker: Speaker.CANDIDATE, content }
      }),
      this.prisma.interviewTurn.create({
        data: { sessionId, speaker: Speaker.INTERVIEWER, content: nextQuestion }
      })
    ]);

    return this.get(userId, role, sessionId);
  }

  async finish(userId: string, role: UserRole, sessionId: string) {
    const interviewConfig = await this.resolveInterviewConfig();
    const session = await this.get(userId, role, sessionId);
    if (session.status === InterviewStatus.COMPLETED && session.report) {
      return session;
    }
    if (this.countCandidateAnswers(session.turns) < interviewConfig.minAnswersForReport) {
      throw new BadRequestException(`At least ${interviewConfig.minAnswersForReport} candidate answers are required before generating a report`);
    }

    const transcript = session.turns.map((turn) => `${turn.speaker}: ${turn.content}`).join('\n');
    const rawReport = await this.ai.run({
      taskType: 'assessment_report',
      userId,
      system:
        '你是 AI 岗位面试评分官。必须只输出 JSON。评分维度固定为：AI / LLM 基础理解、Agent / RAG / 工具调用技术深度、系统架构与工程实现能力、应用方案设计能力、业务 / 产品拆解能力、评估、指标与风险控制、表达结构与沟通能力。根据目标岗位差异调整评语侧重点，但不要改变 schema。',
      input: `岗位：${session.roleProfile.name}\n难度：${session.difficulty}\n主题：${session.topic ?? '综合能力'}\n\n请输出 JSON，字段：overallScore(number), dimensionScores([{dimensionKey,dimensionName,score,rationale}]), summary(string), strengths([{dimensionKey,content}]), weaknesses([{dimensionKey,content}]), improvementPlan([{dimensionKey,title,weakness,practiceMethod,priority,estimatedMinutes,skillId?,learningItemId?}]), nextPractice(string)。首版不要填写 skillId 和 learningItemId，课程资源关联由系统后续匹配。\n\n转写：\n${transcript}`
    });
    const parsed = this.parseReport(rawReport);
    const matchedLearningItems = await this.matchLearningItems(session.roleProfileId, parsed.improvementPlan);

    await this.prisma.$transaction(async (tx) => {
      const report = await tx.assessmentReport.upsert({
        where: { sessionId },
        create: {
          sessionId,
          overallScore: parsed.overallScore,
          dimensionScores: this.legacyDimensionScores(parsed),
          summary: parsed.summary,
          recommendations: this.legacyRecommendations(parsed),
          schemaVersion: ASSESSMENT_SCHEMA_VERSION,
          nextPractice: parsed.nextPractice
        },
        update: {
          overallScore: parsed.overallScore,
          dimensionScores: this.legacyDimensionScores(parsed),
          summary: parsed.summary,
          recommendations: this.legacyRecommendations(parsed),
          schemaVersion: ASSESSMENT_SCHEMA_VERSION,
          nextPractice: parsed.nextPractice
        }
      });

      await tx.assessmentDimensionScore.deleteMany({ where: { reportId: report.id } });
      await tx.assessmentDimensionScore.createMany({
        data: parsed.dimensionScores.map((dimension, index) => ({
          reportId: report.id,
          dimensionKey: dimension.dimensionKey,
          dimensionName: dimension.dimensionName,
          score: dimension.score,
          rationale: dimension.rationale,
          position: index + 1
        }))
      });

      await tx.assessmentFinding.deleteMany({ where: { reportId: report.id } });
      await tx.assessmentFinding.createMany({
        data: [
          ...parsed.strengths.map((finding, index) => ({
            reportId: report.id,
            type: AssessmentFindingType.STRENGTH,
            dimensionKey: finding.dimensionKey,
            content: finding.content,
            position: index + 1
          })),
          ...parsed.weaknesses.map((finding, index) => ({
            reportId: report.id,
            type: AssessmentFindingType.WEAKNESS,
            dimensionKey: finding.dimensionKey,
            content: finding.content,
            position: index + 1
          }))
        ]
      });

      const plan = await tx.improvementPlan.upsert({
        where: { reportId: report.id },
        create: {
          userId: session.userId,
          reportId: report.id,
          items: this.buildImprovementItems(parsed)
        },
        update: {
          userId: session.userId,
          items: this.buildImprovementItems(parsed)
        }
      });

      await tx.improvementPlanItem.deleteMany({ where: { planId: plan.id } });
      for (const [index, item] of parsed.improvementPlan.entries()) {
        const learningItemIds = matchedLearningItems.get(index) ?? [];
        await tx.improvementPlanItem.create({
          data: {
            planId: plan.id,
            dimensionKey: item.dimensionKey,
            title: item.title,
            weakness: item.weakness,
            practiceMethod: item.practiceMethod,
            priority: item.priority,
            estimatedMinutes: item.estimatedMinutes,
            learningItemId: learningItemIds[0],
            recommendedResources: {
              create: learningItemIds.map((learningItemId, resourceIndex) => ({
                learningItemId,
                position: resourceIndex + 1
              }))
            }
          }
        });
      }

      await tx.interviewSession.update({
        where: { id: sessionId },
        data: { status: InterviewStatus.COMPLETED, endedAt: new Date() }
      });
    });

    return this.get(userId, role, sessionId);
  }

  report(userId: string, role: UserRole, sessionId: string) {
    return this.get(userId, role, sessionId).then((session) => session.report);
  }

  private reportInclude(userId: string) {
    return {
      include: {
        dimensionScoreRows: { orderBy: { position: 'asc' as const } },
        findings: { orderBy: { position: 'asc' as const } },
        improvementPlans: {
          include: {
            planItems: {
              orderBy: { priority: 'asc' as const },
              include: {
                skill: true,
                learningItem: { include: { roleProfile: true, skill: true, progress: { where: { userId } } } },
                recommendedResources: {
                  orderBy: { position: 'asc' as const },
                  include: { learningItem: { include: { roleProfile: true, skill: true, progress: { where: { userId } } } } }
                }
              }
            }
          }
        }
      }
    };
  }

  private buildFocusedPracticeContext(report: {
    nextPractice: string;
    findings: Array<{ type: AssessmentFindingType; content: string }>;
    improvementPlans: Array<{
      planItems: Array<{ title: string; weakness: string; practiceMethod: string; dimensionKey: string; skill?: { name: string } | null }>;
    }>;
  }) {
    const weaknessFindings = report.findings.filter((finding) => finding.type === AssessmentFindingType.WEAKNESS).map((finding) => finding.content.trim()).filter(Boolean);
    const planItems = report.improvementPlans.flatMap((plan) => plan.planItems).filter((item) => item.title.trim() || item.weakness.trim() || item.practiceMethod.trim());
    const primaryPlan = planItems[0];

    if (!weaknessFindings.length && !primaryPlan) return null;

    const focusTitle = primaryPlan?.skill?.name ?? primaryPlan?.title ?? weaknessFindings[0] ?? report.nextPractice;
    return {
      topic: this.compactTopic(`专项训练：${focusTitle}`),
      weaknesses: [
        ...(primaryPlan?.weakness ? [primaryPlan.weakness] : []),
        ...weaknessFindings
      ].slice(0, 3),
      practiceMethods: [
        ...(primaryPlan?.practiceMethod ? [primaryPlan.practiceMethod] : []),
        ...(report.nextPractice ? [report.nextPractice] : [])
      ].slice(0, 3)
    };
  }

  private compactTopic(topic: string) {
    return topic.replace(/\s+/g, ' ').trim().slice(0, 200);
  }

  private withRecommendationReasons<T extends { roleProfile?: { id?: string; name?: string } | null; report?: unknown }>(session: T): T {
    const report = session.report as
      | {
          improvementPlans?: Array<{
            planItems?: Array<{
              dimensionKey?: string;
              skillId?: string | null;
              skill?: { id?: string; name?: string } | null;
              recommendedResources?: Array<{ learningItem?: Record<string, unknown>; reason?: string }>;
            }>;
          }>;
        }
      | null
      | undefined;

    if (!report?.improvementPlans?.length) return session;

    return {
      ...session,
      report: {
        ...report,
        improvementPlans: report.improvementPlans.map((plan) => ({
          ...plan,
          planItems: plan.planItems?.map((item) => ({
            ...item,
            recommendedResources: item.recommendedResources?.map((resource) => ({
              ...resource,
              reason: this.reportRecommendationReason(session.roleProfile, item, resource.learningItem)
            }))
          }))
        }))
      }
    };
  }

  private reportRecommendationReason(
    roleProfile: { id?: string; name?: string } | null | undefined,
    planItem: { dimensionKey?: string; skillId?: string | null; skill?: { id?: string; name?: string } | null },
    learningItem?: Record<string, unknown>
  ) {
    const reasons: string[] = [];
    const dimensionKeys = Array.isArray(learningItem?.dimensionKeys) ? learningItem.dimensionKeys : [];
    const itemSkill = learningItem?.skill as { id?: string; name?: string } | null | undefined;
    const itemRole = learningItem?.roleProfile as { id?: string; name?: string } | null | undefined;
    const itemRoleId = typeof learningItem?.roleProfileId === 'string' ? learningItem.roleProfileId : itemRole?.id;
    const itemSkillId = typeof learningItem?.skillId === 'string' ? learningItem.skillId : itemSkill?.id;

    if (planItem.dimensionKey && dimensionKeys.includes(planItem.dimensionKey)) reasons.push('匹配本次短板维度');
    if ((planItem.skillId && itemSkillId === planItem.skillId) || (!planItem.skillId && itemSkill?.name)) {
      reasons.push(`匹配技能：${itemSkill?.name ?? '当前短板技能'}`);
    }
    if (roleProfile?.id && itemRoleId === roleProfile.id) reasons.push(`匹配岗位：${roleProfile.name ?? '当前岗位'}`);
    if (!itemRoleId && !itemSkillId) reasons.push('通用补弱资源');

    return Array.from(new Set(reasons)).slice(0, 3).join('，') || '根据本次面试短板推荐';
  }

  private parseReport(raw: string): AssessmentReportPayload {
    let parsed: unknown;

    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new BadGatewayException('AI assessment report is not valid JSON');
    }

    if (!this.isValidReport(parsed)) {
      throw new BadGatewayException('AI assessment report schema is invalid');
    }

    return parsed;
  }

  private buildImprovementItems(report: AssessmentReportPayload) {
    return report.improvementPlan.map((item) => ({
      title: item.title,
      dimensionKey: item.dimensionKey,
      weakness: item.weakness,
      practiceMethod: item.practiceMethod,
      priority: item.priority,
      estimatedMinutes: item.estimatedMinutes,
      status: 'TODO'
    }));
  }

  private legacyDimensionScores(report: AssessmentReportPayload) {
    return Object.fromEntries(report.dimensionScores.map((dimension) => [dimension.dimensionName, dimension.score]));
  }

  private legacyRecommendations(report: AssessmentReportPayload) {
    return report.improvementPlan.map((item) => item.title);
  }

  private async matchLearningItems(roleProfileId: string, items: ImprovementPlanItemPayload[]) {
    const learningConfig = await this.resolveLearningConfig();
    const matches = new Map<number, string[]>();

    for (const [index, item] of items.entries()) {
      const ids: string[] = [];
      await this.collectLearningItemMatches(ids, learningConfig.recommendationLimit, {
        status: RecordStatus.ACTIVE,
        dimensionKeys: { has: item.dimensionKey },
        ...(item.skillId ? { roleProfileId, skillId: item.skillId } : { id: '__skip__' })
      });
      await this.collectLearningItemMatches(ids, learningConfig.recommendationLimit, {
        status: RecordStatus.ACTIVE,
        roleProfileId,
        dimensionKeys: { has: item.dimensionKey }
      });
      await this.collectLearningItemMatches(ids, learningConfig.recommendationLimit, {
        status: RecordStatus.ACTIVE,
        dimensionKeys: { has: item.dimensionKey },
        skill: { roleProfileId }
      });
      await this.collectLearningItemMatches(ids, learningConfig.recommendationLimit, {
        status: RecordStatus.ACTIVE,
        roleProfileId: null,
        skillId: null,
        dimensionKeys: { has: item.dimensionKey }
      });

      matches.set(index, ids.slice(0, learningConfig.recommendationLimit));
    }

    return matches;
  }

  private async collectLearningItemMatches(target: string[], limit: number, where: Prisma.LearningItemWhereInput) {
    if (target.length >= limit) return;
    const items = await this.prisma.learningItem.findMany({
      where,
      orderBy: [{ estimatedMinutes: 'asc' }, { createdAt: 'desc' }],
      take: limit
    });

    for (const item of items) {
      if (target.length >= limit) return;
      if (!target.includes(item.id)) target.push(item.id);
    }
  }

  private isValidReport(value: unknown): value is AssessmentReportPayload {
    if (!value || typeof value !== 'object') return false;
    const report = value as Record<string, unknown>;
    if (!this.isScore(report.overallScore)) return false;
    if (!Array.isArray(report.dimensionScores) || !this.hasRequiredDimensions(report.dimensionScores)) return false;
    if (typeof report.summary !== 'string' || !report.summary.trim()) return false;
    if (!Array.isArray(report.strengths) || !this.isValidFindings(report.strengths)) return false;
    if (!Array.isArray(report.weaknesses) || !this.isValidFindings(report.weaknesses)) return false;
    if (!Array.isArray(report.improvementPlan) || !this.isValidImprovementPlan(report.improvementPlan)) return false;
    if (typeof report.nextPractice !== 'string' || !report.nextPractice.trim()) return false;
    return true;
  }

  private hasRequiredDimensions(value: unknown[]): value is AssessmentDimensionScorePayload[] {
    if (value.length !== ASSESSMENT_DIMENSIONS.length) return false;
    const seen = new Set<string>();
    return value.every((item) => {
      if (!item || typeof item !== 'object') return false;
      const dimension = item as Record<string, unknown>;
      if (!this.isKnownDimensionKey(dimension.dimensionKey)) return false;
      if (seen.has(dimension.dimensionKey)) return false;
      seen.add(dimension.dimensionKey);
      const expectedName = ASSESSMENT_DIMENSIONS.find((entry) => entry.key === dimension.dimensionKey)?.name;
      return (
        dimension.dimensionName === expectedName &&
        this.isScore(dimension.score) &&
        typeof dimension.rationale === 'string' &&
        Boolean(dimension.rationale.trim())
      );
    });
  }

  private isValidFindings(value: unknown[]): value is AssessmentFindingPayload[] {
    return (
      value.length > 0 &&
      value.every((item) => {
        if (!item || typeof item !== 'object') return false;
        const finding = item as Record<string, unknown>;
        return this.isKnownDimensionKey(finding.dimensionKey) && typeof finding.content === 'string' && Boolean(finding.content.trim());
      })
    );
  }

  private isValidImprovementPlan(value: unknown[]): value is ImprovementPlanItemPayload[] {
    return (
      value.length > 0 &&
      value.every((item) => {
        if (!item || typeof item !== 'object') return false;
        const planItem = item as Record<string, unknown>;
        return (
          this.isKnownDimensionKey(planItem.dimensionKey) &&
          typeof planItem.title === 'string' &&
          Boolean(planItem.title.trim()) &&
          typeof planItem.weakness === 'string' &&
          Boolean(planItem.weakness.trim()) &&
          typeof planItem.practiceMethod === 'string' &&
          Boolean(planItem.practiceMethod.trim()) &&
          typeof planItem.priority === 'number' &&
          Number.isInteger(planItem.priority) &&
          planItem.priority > 0 &&
          typeof planItem.estimatedMinutes === 'number' &&
          Number.isInteger(planItem.estimatedMinutes) &&
          planItem.estimatedMinutes > 0 &&
          this.isOptionalId(planItem.skillId) &&
          this.isOptionalId(planItem.learningItemId)
        );
      })
    );
  }

  private isKnownDimensionKey(value: unknown): value is AssessmentDimensionKey {
    return typeof value === 'string' && ASSESSMENT_DIMENSIONS.some((dimension) => dimension.key === value);
  }

  private isOptionalId(value: unknown) {
    return value === undefined || value === null || (typeof value === 'string' && Boolean(value.trim()));
  }

  private isScore(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100;
  }

  private async resolveInterviewConfig() {
    return (
      (await this.settings?.interviewConfig()) ?? {
        maxTurns: DEFAULT_MAX_CANDIDATE_ANSWERS,
        minAnswersForReport: DEFAULT_MIN_CANDIDATE_ANSWERS_FOR_REPORT,
        defaultTopic: DEFAULT_INTERVIEW_TOPIC,
        focusedPracticeEnabled: true
      }
    );
  }

  private async resolveLearningConfig() {
    return (
      (await this.settings?.learningConfig()) ?? {
        recommendationLimit: DEFAULT_RECOMMENDED_RESOURCES_PER_PLAN_ITEM,
        pendingLimit: 6
      }
    );
  }

  private countCandidateAnswers(turns: Array<{ speaker: Speaker }>) {
    return turns.filter((turn) => turn.speaker === Speaker.CANDIDATE).length;
  }
}
