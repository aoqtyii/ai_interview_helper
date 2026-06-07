import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { Difficulty, FeedType, LearningType, PrismaClient, RecordStatus, UserRole } from '@prisma/client';

const prisma = new PrismaClient();
const PASSWORD_ITERATIONS = 120_000;
const PASSWORD_KEY_LENGTH = 32;
const PASSWORD_DIGEST = 'sha256';

function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const hash = pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, PASSWORD_KEY_LENGTH, PASSWORD_DIGEST).toString('hex');
  return `${PASSWORD_ITERATIONS}.${salt}.${hash}`;
}

async function main() {
  const aiPm = await upsertRole('AI 产品经理', 'ai-product-manager', '负责 AI 产品发现、方案设计、指标验证和跨团队落地。');
  const agentDev = await upsertRole('AI Agent 开发', 'ai-agent-developer', '负责 Agent 架构、工具调用、RAG、评测和部署。');
  const fde = await upsertRole('Forward Deployed Engineer', 'fde', '面向客户场景快速交付 AI 解决方案，连接业务、工程和模型能力。');

  const roles = [
    {
      role: aiPm,
      skills: [
        { id: 'ai-pm-discovery', name: '需求发现', category: 'Product', description: '从业务目标、用户场景和工作流中识别 AI 机会。', dimensionKey: 'business_product_decomposition' },
        { id: 'ai-pm-solution', name: 'AI 方案判断', category: 'AI', description: '判断 LLM、Agent、RAG、传统规则等方案的适用边界。', dimensionKey: 'application_solution_design' },
        { id: 'ai-pm-metrics', name: '指标设计', category: 'Execution', description: '设计上线前后验证指标和实验方案。', dimensionKey: 'evaluation_metrics_risk' }
      ]
    },
    {
      role: agentDev,
      skills: [
        { id: 'agent-dev-architecture', name: 'Agent 架构', category: 'Engineering', description: '规划 planner、tools、memory、guardrails 与 evaluator。', dimensionKey: 'agent_rag_tooling_depth' },
        { id: 'agent-dev-rag', name: 'RAG 与检索', category: 'Engineering', description: '设计知识切分、向量检索、重排和引用策略。', dimensionKey: 'agent_rag_tooling_depth' },
        { id: 'agent-dev-eval', name: '评测与观测', category: 'Quality', description: '构建离线评测、线上日志和失败分析闭环。', dimensionKey: 'evaluation_metrics_risk' }
      ]
    },
    {
      role: fde,
      skills: [
        { id: 'fde-problem-framing', name: '客户问题拆解', category: 'Field', description: '把复杂客户问题拆成可交付的 AI 方案。', dimensionKey: 'business_product_decomposition' },
        { id: 'fde-prototype', name: '快速原型', category: 'Engineering', description: '用最小闭环验证价值、风险和集成路径。', dimensionKey: 'system_architecture_engineering' },
        { id: 'fde-rollout', name: '上线协作', category: 'Execution', description: '处理权限、数据、部署、培训和变更管理。', dimensionKey: 'structured_communication' }
      ]
    }
  ];

  for (const entry of roles) {
    for (const skillInput of entry.skills) {
      const skill = await prisma.skill.upsert({
        where: { id: skillInput.id },
        update: {
          roleProfileId: entry.role.id,
          name: skillInput.name,
          category: skillInput.category,
          description: skillInput.description,
          level: Difficulty.MID
        },
        create: {
          id: skillInput.id,
          roleProfileId: entry.role.id,
          name: skillInput.name,
          category: skillInput.category,
          description: skillInput.description,
          level: Difficulty.MID
        }
      });

      await prisma.interviewQuestion.upsert({
        where: { id: `${skill.id}-question-mid` },
        update: {
          roleProfileId: entry.role.id,
          skillId: skill.id,
          difficulty: Difficulty.MID,
          question: `请结合项目经历说明你如何体现「${skill.name}」能力？`,
          rubric: {
            dimensions: ['结构化表达', 'AI 应用深度', '指标意识', '落地判断'],
            passing: '能给出具体场景、方案取舍、指标和复盘。'
          }
        },
        create: {
          id: `${skill.id}-question-mid`,
          roleProfileId: entry.role.id,
          skillId: skill.id,
          difficulty: Difficulty.MID,
          question: `请结合项目经历说明你如何体现「${skill.name}」能力？`,
          rubric: {
            dimensions: ['结构化表达', 'AI 应用深度', '指标意识', '落地判断'],
            passing: '能给出具体场景、方案取舍、指标和复盘。'
          }
        }
      });

      await prisma.learningItem.upsert({
        where: { id: `${skill.id}-learning-task` },
        update: buildLearningItem(entry.role.id, skill.id, skillInput),
        create: {
          id: `${skill.id}-learning-task`,
          ...buildLearningItem(entry.role.id, skill.id, skillInput)
        }
      });
    }
  }

  await prisma.user.upsert({
    where: { email: 'admin@aih.local' },
    update: {},
    create: {
      email: 'admin@aih.local',
      name: 'AIH Admin',
      role: UserRole.ADMIN,
      passwordHash: hashPassword('admin123456'),
      profile: { create: { targetRoleId: aiPm.id, level: Difficulty.SENIOR, goals: '维护面试题库与资讯来源。' } }
    }
  });

  await prisma.user.upsert({
    where: { email: 'user@aih.local' },
    update: {},
    create: {
      email: 'user@aih.local',
      name: 'AI Candidate',
      role: UserRole.USER,
      passwordHash: hashPassword('user123456'),
      profile: { create: { targetRoleId: agentDev.id, level: Difficulty.MID, goals: '准备 AI Agent 开发岗位面试。' } }
    }
  });

  await prisma.sourceFeed.upsert({
    where: { url: 'https://openai.com/news/rss.xml' },
    update: {},
    create: {
      name: 'OpenAI News',
      type: FeedType.RSS,
      url: 'https://openai.com/news/rss.xml'
    }
  });

  await prisma.promptTemplate.upsert({
    where: { taskType_version: { taskType: 'assessment_report', version: 1 } },
    update: {},
    create: {
      taskType: 'assessment_report',
      version: 1,
      content: '根据中文 AI 岗位面试转写，输出结构化评分 JSON。',
      schema: {
        overallScore: 'number',
        dimensionScores: 'AssessmentDimensionScore[]',
        summary: 'string',
        strengths: 'AssessmentFinding[]',
        weaknesses: 'AssessmentFinding[]',
        improvementPlan: 'ImprovementPlanItem[]',
        nextPractice: 'string'
      }
    }
  });
}

function buildLearningItem(
  roleProfileId: string,
  skillId: string,
  skill: { name: string; description: string; dimensionKey: string }
) {
  return {
    roleProfileId,
    skillId,
    type: LearningType.TASK,
    title: `${skill.name}: 30 分钟面试案例打磨`,
    description: `围绕 ${skill.description} 准备一个 STAR + 指标 + 风险取舍的中文回答。`,
    contentUrl: null,
    difficulty: Difficulty.MID,
    tags: ['面试表达', '补弱任务'],
    dimensionKeys: [skill.dimensionKey],
    status: RecordStatus.ACTIVE,
    sourceType: 'MANUAL',
    sourceMetadata: {},
    estimatedMinutes: 30
  };
}

async function upsertRole(name: string, slug: string, description: string) {
  return prisma.roleProfile.upsert({
    where: { slug },
    update: { name, description },
    create: { name, slug, description }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
