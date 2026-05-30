import { PrismaClient, Difficulty, FeedType, LearningType, UserRole } from '@prisma/client';
import { hashPassword } from '../apps/api/src/common/password';

const prisma = new PrismaClient();

async function main() {
  const aiPm = await upsertRole('AI 产品经理', 'ai-product-manager', '负责 AI 产品发现、方案设计、指标验证和跨团队落地。');
  const agentDev = await upsertRole('AI Agent 开发', 'ai-agent-developer', '负责 Agent 架构、工具调用、RAG、评测和部署。');
  const fde = await upsertRole('Forward Deployed Engineer', 'fde', '面向客户场景快速交付 AI 解决方案，连接业务、工程和模型能力。');

  const roles = [
    {
      role: aiPm,
      skills: [
        ['需求发现', 'Product', '从业务目标、用户场景和工作流中识别 AI 机会。'],
        ['AI 方案判断', 'AI', '判断 LLM、Agent、RAG、传统规则等方案的适用边界。'],
        ['指标设计', 'Execution', '设计上线前后验证指标和实验方案。']
      ]
    },
    {
      role: agentDev,
      skills: [
        ['Agent 架构', 'Engineering', '规划 planner、tools、memory、guardrails 与 evaluator。'],
        ['RAG 与检索', 'Engineering', '设计知识切分、向量检索、重排和引用策略。'],
        ['评测与观测', 'Quality', '构建离线评测、线上日志和失败分析闭环。']
      ]
    },
    {
      role: fde,
      skills: [
        ['客户问题拆解', 'Field', '把复杂客户问题拆成可交付的 AI 方案。'],
        ['快速原型', 'Engineering', '用最小闭环验证价值、风险和集成路径。'],
        ['上线协作', 'Execution', '处理权限、数据、部署、培训和变更管理。']
      ]
    }
  ];

  for (const entry of roles) {
    for (const [name, category, description] of entry.skills) {
      const skill = await prisma.skill.upsert({
        where: { id: `${entry.role.slug}-${name}` },
        update: {},
        create: {
          id: `${entry.role.slug}-${name}`,
          roleProfileId: entry.role.id,
          name,
          category,
          description,
          level: Difficulty.MID
        }
      });

      await prisma.interviewQuestion.createMany({
        data: [
          {
            roleProfileId: entry.role.id,
            skillId: skill.id,
            difficulty: Difficulty.MID,
            question: `请结合项目经历说明你如何体现「${name}」能力？`,
            rubric: {
              dimensions: ['结构化表达', 'AI 应用深度', '指标意识', '落地判断'],
              passing: '能给出具体场景、方案取舍、指标和复盘。'
            }
          }
        ],
        skipDuplicates: true
      });

      await prisma.learningItem.create({
        data: {
          skillId: skill.id,
          type: LearningType.TASK,
          title: `${name}：30 分钟面试案例打磨`,
          description: `围绕 ${description} 准备一个 STAR + 指标 + 风险取舍的中文回答。`,
          estimatedMinutes: 30
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
      profile: { create: { targetRoleId: aiPm.id, level: Difficulty.SENIOR, goals: '维护面试题库与资讯来源' } }
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
      profile: { create: { targetRoleId: agentDev.id, level: Difficulty.MID, goals: '准备 AI Agent 开发岗位面试' } }
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
        dimensionScores: 'object',
        summary: 'string',
        recommendations: 'string[]'
      }
    }
  });
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
