import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Difficulty, InterviewStatus, Speaker, UserRole } from '@prisma/client';
import { AiGatewayService } from '../ai/ai-gateway.service';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class InterviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiGatewayService
  ) {}

  async create(userId: string, input: { roleProfileId: string; difficulty?: Difficulty; topic?: string }) {
    const role = await this.prisma.roleProfile.findUniqueOrThrow({
      where: { id: input.roleProfileId },
      include: { skills: true }
    });

    const session = await this.prisma.interviewSession.create({
      data: {
        userId,
        roleProfileId: role.id,
        difficulty: input.difficulty ?? Difficulty.MID,
        topic: input.topic,
        status: InterviewStatus.IN_PROGRESS,
        startedAt: new Date()
      }
    });

    const firstQuestion = await this.ai.run({
      taskType: 'interviewer_turn',
      userId,
      system: '你是一个严格但支持性的 AI 岗位中文面试官。问题要贴近真实 AI 应用层岗位。',
      input: `岗位：${role.name}\n主题：${input.topic ?? '综合能力'}\n技能：${role.skills.map((skill) => skill.name).join('、')}`
    });

    await this.prisma.interviewTurn.create({
      data: {
        sessionId: session.id,
        speaker: Speaker.INTERVIEWER,
        content: firstQuestion
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

    await this.prisma.interviewTurn.create({
      data: { sessionId, speaker: Speaker.CANDIDATE, content }
    });

    const transcript = [...session.turns, { speaker: Speaker.CANDIDATE, content }]
      .map((turn) => `${turn.speaker}: ${turn.content}`)
      .join('\n');

    const nextQuestion = await this.ai.run({
      taskType: 'interviewer_turn',
      userId,
      system: '你是 AI 岗位中文面试官。根据候选人回答追问一个高价值问题，避免重复。',
      input: transcript
    });

    await this.prisma.interviewTurn.create({
      data: { sessionId, speaker: Speaker.INTERVIEWER, content: nextQuestion }
    });

    return this.get(userId, role, sessionId);
  }

  async finish(userId: string, role: UserRole, sessionId: string) {
    const session = await this.get(userId, role, sessionId);
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

    await this.prisma.improvementPlan.create({
      data: {
        userId: session.userId,
        reportId: report.id,
        items: parsed.recommendations.map((title: string, index: number) => ({
          title,
          priority: index + 1,
          status: 'TODO'
        }))
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
    try {
      const parsed = JSON.parse(raw) as {
        overallScore: number;
        dimensionScores: Record<string, number>;
        summary: string;
        recommendations: string[];
      };
      return parsed;
    } catch {
      return {
        overallScore: 70,
        dimensionScores: { structuredCommunication: 70 },
        summary: raw.slice(0, 800),
        recommendations: ['复盘回答结构', '补充项目指标', '准备 AI 应用落地案例']
      };
    }
  }
}
