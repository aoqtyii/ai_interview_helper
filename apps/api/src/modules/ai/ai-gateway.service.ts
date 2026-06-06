import { BadGatewayException, Inject, Injectable } from '@nestjs/common';
import { AiRunStatus } from '@prisma/client';
import { loadAppConfig } from '../../common/app-config';
import { PrismaService } from '../../prisma/prisma.service';

type AiTaskType = 'interviewer_turn' | 'assessment_report' | 'learning_coach' | 'article_digest';

type AiRequest = {
  taskType: AiTaskType;
  userId?: string;
  system: string;
  input: string;
  schema?: unknown;
};

@Injectable()
export class AiGatewayService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async run(request: AiRequest) {
    const started = Date.now();
    const config = loadAppConfig();
    const provider = process.env.AI_PROVIDER ?? 'openai-compatible';
    const model = process.env.AI_DEFAULT_MODEL ?? 'gpt-5.4-mini';

    if (config.aiMockMode) {
      const output = this.mockResponse(request);
      await this.logRun(request, provider, model, Date.now() - started, AiRunStatus.MOCKED, output);
      return output;
    }

    if (!process.env.AI_API_KEY) {
      const message = 'AI_API_KEY is required when AI_MOCK_MODE is disabled';
      await this.logRun(request, provider, model, Date.now() - started, AiRunStatus.FAILED, undefined, message);
      throw new BadGatewayException(message);
    }

    try {
      const output = await this.callOpenAiCompatible(request, model);
      await this.logRun(request, provider, model, Date.now() - started, AiRunStatus.SUCCESS, output);
      return output;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.logRun(request, provider, model, Date.now() - started, AiRunStatus.FAILED, undefined, message);
      throw error instanceof BadGatewayException ? error : new BadGatewayException(message);
    }
  }

  private async callOpenAiCompatible(request: AiRequest, model: string) {
    const baseUrl = process.env.AI_BASE_URL ?? 'https://api.openai.com/v1';
    const response = await fetch(`${baseUrl}/responses`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.AI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        input: [
          { role: 'system', content: request.system },
          { role: 'user', content: request.input }
        ]
      })
    });

    if (!response.ok) throw new Error(`AI provider failed: ${response.status} ${await response.text()}`);
    const json = (await response.json()) as { output_text?: string };
    return json.output_text ?? JSON.stringify(json);
  }

  private mockResponse(request: AiRequest) {
    if (request.taskType === 'interviewer_turn') {
      return '请结合一个真实项目，说明你如何判断 AI Agent 方案是否真的比传统工作流更合适？我会继续追问你的评估指标、落地风险和用户价值。';
    }

    if (request.taskType === 'assessment_report') {
      return JSON.stringify({
        overallScore: 78,
        dimensionScores: {
          domainUnderstanding: 82,
          aiApplicationDepth: 76,
          structuredCommunication: 80,
          executionJudgment: 74
        },
        summary: '回答具备较好的 AI 应用意识和结构化表达，但对评估指标、工程边界和上线后的反馈闭环还可以更具体。',
        recommendations: [
          '补充 AI Agent 适用场景与不适用场景的判断框架',
          '练习用指标描述方案价值，例如转化率、节省工时、错误率和用户满意度',
          '准备一个端到端项目案例，覆盖需求、架构、评估和迭代'
        ]
      });
    }

    if (request.taskType === 'article_digest') {
      return JSON.stringify({
        summary: '该资讯与 AI 应用层岗位相关，建议关注其技术方案、落地约束和可复用模式。',
        tags: ['AI Agent', 'LLM 应用', '工程落地'],
        relevanceScores: {
          aiProductManager: 78,
          aiAgentDeveloper: 86,
          fde: 72
        }
      });
    }

    return '建议优先围绕岗位能力图谱中的薄弱技能完成一次小项目练习，并在下一轮面试中复盘表达。';
  }

  private async logRun(
    request: AiRequest,
    provider: string,
    model: string,
    latencyMs: number,
    status: AiRunStatus,
    output?: string,
    error?: string
  ) {
    await this.prisma.aiRunLog.create({
      data: {
        userId: request.userId,
        taskType: request.taskType,
        provider,
        model,
        latencyMs,
        tokenUsage: {},
        status,
        error,
        outputPreview: output?.slice(0, 500)
      }
    });
  }
}
