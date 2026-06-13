import { BadGatewayException, BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AssessmentFindingType, Difficulty, InterviewStatus, Prisma, RecordStatus, Speaker, UserRole } from '@prisma/client';
import { AiGatewayService } from '../ai/ai-gateway.service';
import { PrismaService } from '../../prisma/prisma.service';

const MAX_CANDIDATE_ANSWERS = 5;
const MIN_CANDIDATE_ANSWERS_FOR_REPORT = 2;
const ASSESSMENT_SCHEMA_VERSION = 2;
const MAX_RECOMMENDED_RESOURCES_PER_PLAN_ITEM = 3;
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
    @Inject(AiGatewayService) private readonly ai: AiGatewayService
  ) {}

  async create(userId: string, input: { roleProfileId: string; difficulty?: Difficulty; topic?: string }) {
    const role = await this.prisma.roleProfile.findUniqueOrThrow({
      where: { id: input.roleProfileId },
      include: { skills: true }
    });

    const firstQuestion = await this.ai.run({
      taskType: 'interviewer_turn',
      userId,
      system: '你是一名严格但支持性的 AI 岗位中文面试官。问题要贴近真实 AI 应用层岗位。',
      input: `岗位：${role.name}\n主题：${input.topic ?? '综合能力'}\n技能：${role.skills.map((skill) => skill.name).join('、')}`
    });

    const session = await this.prisma.interviewSession.create({
      data: {
        userId,
        roleProfileId: role.id,
        difficulty: input.difficulty ?? Difficulty.MID,
        topic: input.topic,
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

  list(userId: string, role: UserRole) {
    return this.prisma.interviewSession.findMany({
      where: role === UserRole.ADMIN ? undefined : { userId },
      include: { roleProfile: true, report: this.reportInclude(userId), turns: { take: 1, orderBy: { createdAt: 'desc' } } },
      orderBy: { createdAt: 'desc' }
    });
  }

  async get(userId: string, role: UserRole, sessionId: string) {
    const session = await this.prisma.interviewSession.findUnique({
      where: { id: sessionId },
      include: { roleProfile: { include: { skills: true } }, turns: { orderBy: { createdAt: 'asc' } }, report: this.reportInclude(userId) }
    });
    if (!session) throw new NotFoundException('Interview session not found');
    if (role !== UserRole.ADMIN && session.userId !== userId) throw new ForbiddenException('Cannot access this session');
    return session;
  }

  async addTurn(userId: string, role: UserRole, sessionId: string, content: string) {
    const session = await this.get(userId, role, sessionId);
    if (session.status !== InterviewStatus.IN_PROGRESS) throw new ForbiddenException('Session is not in progress');
    const candidateAnswerCount = this.countCandidateAnswers(session.turns);
    if (candidateAnswerCount >= MAX_CANDIDATE_ANSWERS) {
      throw new ForbiddenException('Interview has reached the maximum answer rounds');
    }

    if (candidateAnswerCount + 1 >= MAX_CANDIDATE_ANSWERS) {
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
    const session = await this.get(userId, role, sessionId);
    if (session.status === InterviewStatus.COMPLETED && session.report) {
      return session;
    }
    if (this.countCandidateAnswers(session.turns) < MIN_CANDIDATE_ANSWERS_FOR_REPORT) {
      throw new BadRequestException('At least 2 candidate answers are required before generating a report');
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
    const matches = new Map<number, string[]>();

    for (const [index, item] of items.entries()) {
      const ids: string[] = [];
      await this.collectLearningItemMatches(ids, {
        status: RecordStatus.ACTIVE,
        dimensionKeys: { has: item.dimensionKey },
        ...(item.skillId ? { roleProfileId, skillId: item.skillId } : { id: '__skip__' })
      });
      await this.collectLearningItemMatches(ids, {
        status: RecordStatus.ACTIVE,
        roleProfileId,
        dimensionKeys: { has: item.dimensionKey }
      });
      await this.collectLearningItemMatches(ids, {
        status: RecordStatus.ACTIVE,
        dimensionKeys: { has: item.dimensionKey },
        skill: { roleProfileId }
      });
      await this.collectLearningItemMatches(ids, {
        status: RecordStatus.ACTIVE,
        roleProfileId: null,
        skillId: null,
        dimensionKeys: { has: item.dimensionKey }
      });

      matches.set(index, ids.slice(0, MAX_RECOMMENDED_RESOURCES_PER_PLAN_ITEM));
    }

    return matches;
  }

  private async collectLearningItemMatches(target: string[], where: Prisma.LearningItemWhereInput) {
    if (target.length >= MAX_RECOMMENDED_RESOURCES_PER_PLAN_ITEM) return;
    const items = await this.prisma.learningItem.findMany({
      where,
      orderBy: [{ estimatedMinutes: 'asc' }, { createdAt: 'desc' }],
      take: MAX_RECOMMENDED_RESOURCES_PER_PLAN_ITEM
    });

    for (const item of items) {
      if (target.length >= MAX_RECOMMENDED_RESOURCES_PER_PLAN_ITEM) return;
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

  private countCandidateAnswers(turns: Array<{ speaker: Speaker }>) {
    return turns.filter((turn) => turn.speaker === Speaker.CANDIDATE).length;
  }
}
