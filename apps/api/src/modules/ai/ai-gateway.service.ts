import { BadGatewayException, Inject, Injectable, Optional } from '@nestjs/common';
import { AiRunStatus } from '@prisma/client';
import { loadAppConfig } from '../../common/app-config';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';

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
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional() @Inject(SettingsService) private readonly settings?: SettingsService
  ) {}

  async run(request: AiRequest) {
    const started = Date.now();
    const config = await this.resolveAiConfig();
    const provider = config.provider;
    const model = config.defaultModel;

    if (config.mockMode) {
      const output = this.mockResponse(request);
      await this.logRun(request, provider, model, Date.now() - started, AiRunStatus.MOCKED, output);
      return output;
    }

    if (!config.apiKey) {
      const message = 'AI_API_KEY is required when AI_MOCK_MODE is disabled';
      await this.logRun(request, provider, model, Date.now() - started, AiRunStatus.FAILED, undefined, message);
      throw new BadGatewayException(message);
    }

    try {
      const output = await this.callOpenAiCompatible(request, config);
      await this.logRun(request, provider, model, Date.now() - started, AiRunStatus.SUCCESS, output);
      return output;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.logRun(request, provider, model, Date.now() - started, AiRunStatus.FAILED, undefined, message);
      throw error instanceof BadGatewayException ? error : new BadGatewayException(message);
    }
  }

  private async callOpenAiCompatible(request: AiRequest, config: Awaited<ReturnType<AiGatewayService['resolveAiConfig']>>) {
    const baseUrl = config.baseUrl;
    const response = await fetch(`${baseUrl}/responses`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: config.defaultModel,
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

  private async resolveAiConfig() {
    if (this.settings) return this.settings.aiConfig();
    const config = loadAppConfig();
    return {
      mockMode: config.aiMockMode,
      provider: process.env.AI_PROVIDER ?? 'openai-compatible',
      baseUrl: process.env.AI_BASE_URL ?? 'https://api.openai.com/v1',
      apiKey: process.env.AI_API_KEY ?? '',
      defaultModel: process.env.AI_DEFAULT_MODEL ?? 'gpt-5.4-mini'
    };
  }

  private mockResponse(request: AiRequest) {
    if (request.taskType === 'interviewer_turn') {
      return '请结合一个真实项目，说明你如何判断 AI Agent 方案是否真的比传统工作流更合适？我会继续追问你的评估指标、落地风险和用户价值。';
    }

    if (request.taskType === 'assessment_report') {
      return JSON.stringify({
        overallScore: 78,
        dimensionScores: [
          { dimensionKey: 'ai_llm_foundation', dimensionName: 'AI / LLM 基础理解', score: 82, rationale: '能够说明 LLM 应用价值和限制，但边界条件还可以更明确。' },
          { dimensionKey: 'agent_rag_tooling_depth', dimensionName: 'Agent / RAG / 工具调用技术深度', score: 76, rationale: '了解 Agent 和工具调用，但对评估、记忆和失败恢复描述不足。' },
          { dimensionKey: 'system_architecture_engineering', dimensionName: '系统架构与工程实现能力', score: 74, rationale: '能描述主链路，但缺少部署、观测和权限设计细节。' },
          { dimensionKey: 'application_solution_design', dimensionName: '应用方案设计能力', score: 80, rationale: '方案目标较清晰，能围绕用户场景拆解能力闭环。' },
          { dimensionKey: 'business_product_decomposition', dimensionName: '业务 / 产品拆解能力', score: 78, rationale: '能把业务问题转为产品目标，但用户分层和优先级还不够具体。' },
          { dimensionKey: 'evaluation_metrics_risk', dimensionName: '评估、指标与风险控制', score: 72, rationale: '提到指标意识，但缺少离线评测、线上监控和风险处置闭环。' },
          { dimensionKey: 'structured_communication', dimensionName: '表达结构与沟通能力', score: 84, rationale: '回答结构清晰，能够按背景、方案、风险和结果展开。' }
        ],
        summary: '回答具备较好的 AI 应用意识和结构化表达，但对技术实现、评估指标和上线后的反馈闭环还可以更具体。',
        strengths: [
          { dimensionKey: 'structured_communication', content: '表达有层次，能把问题、方案和结果串起来。' },
          { dimensionKey: 'application_solution_design', content: '能够围绕真实业务场景设计 AI 应用方案。' }
        ],
        weaknesses: [
          { dimensionKey: 'evaluation_metrics_risk', content: '评估指标、风险控制和上线后监控描述偏泛。' },
          { dimensionKey: 'system_architecture_engineering', content: '工程实现细节不足，缺少权限、部署、观测和失败恢复设计。' }
        ],
        improvementPlan: [
          {
            dimensionKey: 'evaluation_metrics_risk',
            title: '补充 Agent 评估指标框架',
            weakness: '缺少离线评测、线上监控和风险处置闭环。',
            practiceMethod: '用一个真实 Agent 场景写出 5 个离线指标、3 个线上指标和对应报警阈值。',
            priority: 1,
            estimatedMinutes: 45
          },
          {
            dimensionKey: 'system_architecture_engineering',
            title: '补齐端到端工程架构表达',
            weakness: '工程实现细节不足。',
            practiceMethod: '画出从用户请求、工具调用、权限校验、日志观测到失败重试的链路，并用面试语言讲一遍。',
            priority: 2,
            estimatedMinutes: 60
          }
        ],
        nextPractice: '下一轮建议围绕 Agent 评估体系和生产级部署进行专项追问。'
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
