import { BadGatewayException, BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Difficulty, InterviewStatus, Speaker, UserRole } from '@prisma/client';
import { AiGatewayService } from '../ai/ai-gateway.service';
import { PrismaService } from '../../prisma/prisma.service';

const MAX_CANDIDATE_ANSWERS = 5;
const MIN_CANDIDATE_ANSWERS_FOR_REPORT = 2;

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
      system: '你是一个严格但支持性的 AI 岗位中文面试官。问题要贴近真实 AI 应用层岗位。',
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
      include: { roleProfile: true, report: true, turns: { take: 1, orderBy: { createdAt: 'desc' } } },
      orderBy: { createdAt: 'desc' }
    });
  }

  async get(userId: string, role: UserRole, sessionId: string) {
    const session = await this.prisma.interviewSession.findUnique({
      where: { id: sessionId },
      include: { roleProfile: { include: { skills: true } }, turns: { orderBy: { createdAt: 'asc' } }, report: true }
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
      system: '你是 AI 岗位面试评分官。必须输出 JSON，字段包括 overallScore、dimensionScores、summary、recommendations。',
      input: transcript
    });
    const parsed = this.parseReport(rawReport);

    const report = await this.prisma.assessmentReport.upsert({
      where: { sessionId },
      create: {
        sessionId,
        overallScore: parsed.overallScore,
        dimensionScores: parsed.dimensionScores,
        summary: parsed.summary,
        recommendations: parsed.recommendations
      },
      update: {
        overallScore: parsed.overallScore,
        dimensionScores: parsed.dimensionScores,
        summary: parsed.summary,
        recommendations: parsed.recommendations
      }
    });

    await this.prisma.improvementPlan.upsert({
      where: { reportId: report.id },
      create: {
        userId: session.userId,
        reportId: report.id,
        items: this.buildImprovementItems(parsed.recommendations)
      },
      update: {
        userId: session.userId,
        items: this.buildImprovementItems(parsed.recommendations)
      }
    });

    await this.prisma.interviewSession.update({
      where: { id: sessionId },
      data: { status: InterviewStatus.COMPLETED, endedAt: new Date() }
    });

    return this.get(userId, role, sessionId);
  }

  report(userId: string, role: UserRole, sessionId: string) {
    return this.get(userId, role, sessionId).then((session) => session.report);
  }

  private parseReport(raw: string) {
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

  private buildImprovementItems(recommendations: string[]) {
    return recommendations.map((title: string, index: number) => ({
      title,
      priority: index + 1,
      status: 'TODO'
    }));
  }

  private isValidReport(value: unknown): value is {
    overallScore: number;
    dimensionScores: Record<string, number>;
    summary: string;
    recommendations: string[];
  } {
    if (!value || typeof value !== 'object') return false;
    const report = value as Record<string, unknown>;
    if (!this.isScore(report.overallScore)) return false;
    if (!this.isScoreRecord(report.dimensionScores)) return false;
    if (typeof report.summary !== 'string' || !report.summary.trim()) return false;
    if (!Array.isArray(report.recommendations)) return false;
    return report.recommendations.every((recommendation) => typeof recommendation === 'string' && Boolean(recommendation.trim()));
  }

  private isScoreRecord(value: unknown): value is Record<string, number> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const entries = Object.entries(value);
    return entries.length > 0 && entries.every(([key, score]) => Boolean(key.trim()) && this.isScore(score));
  }

  private isScore(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100;
  }

  private countCandidateAnswers(turns: Array<{ speaker: Speaker }>) {
    return turns.filter((turn) => turn.speaker === Speaker.CANDIDATE).length;
  }
}
