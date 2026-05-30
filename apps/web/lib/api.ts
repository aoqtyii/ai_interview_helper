const API_BASE_URL = process.env.WEB_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    throw new Error(`API ${path} failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export const demo = {
  roles: [
    { id: 'ai-pm', name: 'AI 产品经理', description: 'AI 产品发现、方案设计、指标验证和跨团队落地。' },
    { id: 'agent-dev', name: 'AI Agent 开发', description: 'Agent 架构、RAG、工具调用、评测和部署。' },
    { id: 'fde', name: 'FDE', description: '面向客户场景快速交付 AI 解决方案。' }
  ],
  sessions: [
    { id: 'demo-session', roleProfile: { name: 'AI Agent 开发' }, status: 'COMPLETED', difficulty: 'MID', report: { overallScore: 78 } }
  ],
  learning: [
    { id: 'learn-1', title: 'Agent 架构：30 分钟面试案例打磨', estimatedMinutes: 30, skill: { name: 'Agent 架构' } },
    { id: 'learn-2', title: 'RAG 与检索：设计一次知识库评测', estimatedMinutes: 45, skill: { name: 'RAG 与检索' } }
  ],
  articles: [
    {
      id: 'article-1',
      title: 'Realtime voice agents and application architecture',
      url: 'https://developers.openai.com/',
      source: { name: 'OpenAI Developers' },
      digest: {
        summary: '实时语音 Agent 能力正在进入应用层，值得关注延迟、工具调用、评测与权限边界。',
        tags: ['Realtime', 'AI Agent', 'LLM 应用']
      }
    }
  ],
  logs: [
    { id: 'log-1', taskType: 'assessment_report', provider: 'mock', model: 'local-mock', status: 'MOCKED', latencyMs: 4 }
  ]
};

export async function safeApi<T>(path: string, fallback: T, init?: RequestInit) {
  try {
    return await api<T>(path, init);
  } catch {
    return fallback;
  }
}
