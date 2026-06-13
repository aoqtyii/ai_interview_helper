export type SettingGroup = 'ai' | 'interview' | 'learning';
export type SettingValueType = 'boolean' | 'number' | 'string' | 'secret';

export type SettingDefinition = {
  key: string;
  group: SettingGroup;
  label: string;
  description: string;
  valueType: SettingValueType;
  envKey?: string;
  defaultValue?: string | number | boolean;
  isSecret?: boolean;
  min?: number;
  max?: number;
  maxLength?: number;
};

export const SETTING_DEFINITIONS: SettingDefinition[] = [
  {
    key: 'AI_MOCK_MODE',
    group: 'ai',
    label: 'Mock 模式',
    description: '开启后 AI 调用使用本地确定性输出，不需要 API Key。',
    valueType: 'boolean',
    envKey: 'AI_MOCK_MODE',
    defaultValue: false
  },
  {
    key: 'AI_PROVIDER',
    group: 'ai',
    label: 'AI Provider',
    description: '当前首版支持 openai-compatible。',
    valueType: 'string',
    envKey: 'AI_PROVIDER',
    defaultValue: 'openai-compatible',
    maxLength: 80
  },
  {
    key: 'AI_BASE_URL',
    group: 'ai',
    label: 'API Base URL',
    description: '兼容 OpenAI Responses API 的服务地址。',
    valueType: 'string',
    envKey: 'AI_BASE_URL',
    defaultValue: 'https://api.openai.com/v1',
    maxLength: 2048
  },
  {
    key: 'AI_API_KEY',
    group: 'ai',
    label: 'API Key',
    description: '敏感字段，仅允许写入和脱敏查看。',
    valueType: 'secret',
    envKey: 'AI_API_KEY',
    isSecret: true,
    maxLength: 4096
  },
  {
    key: 'AI_DEFAULT_MODEL',
    group: 'ai',
    label: '默认模型',
    description: '面试官、评分、摘要等任务默认使用的模型。',
    valueType: 'string',
    envKey: 'AI_DEFAULT_MODEL',
    defaultValue: 'gpt-5.4-mini',
    maxLength: 120
  },
  {
    key: 'INTERVIEW_MAX_TURNS',
    group: 'interview',
    label: '最大回答轮数',
    description: '每场面试允许候选人提交的最多回答次数。',
    valueType: 'number',
    defaultValue: 5,
    min: 1,
    max: 20
  },
  {
    key: 'INTERVIEW_MIN_ANSWERS_FOR_REPORT',
    group: 'interview',
    label: '生成报告最少回答数',
    description: '候选人至少回答多少次后才能生成正式评分报告。',
    valueType: 'number',
    defaultValue: 2,
    min: 1,
    max: 20
  },
  {
    key: 'INTERVIEW_DEFAULT_TOPIC',
    group: 'interview',
    label: '默认面试主题',
    description: '用户未填写主题时使用的默认主题。',
    valueType: 'string',
    defaultValue: 'AI Agent 应用落地',
    maxLength: 200
  },
  {
    key: 'FOCUSED_PRACTICE_ENABLED',
    group: 'interview',
    label: '启用专项训练',
    description: '关闭后 Dashboard 和报告页不再提供专项训练入口。',
    valueType: 'boolean',
    defaultValue: true
  },
  {
    key: 'LEARNING_RECOMMENDATION_LIMIT',
    group: 'learning',
    label: '单个补弱项推荐资源数',
    description: '每个补弱任务最多匹配多少个学习资源。',
    valueType: 'number',
    defaultValue: 3,
    min: 1,
    max: 10
  },
  {
    key: 'LEARNING_PENDING_LIMIT',
    group: 'learning',
    label: 'Dashboard 待办数量',
    description: '工作台下一步行动中最多展示多少个待学习资源。',
    valueType: 'number',
    defaultValue: 6,
    min: 1,
    max: 20
  }
];

export const SETTING_DEFINITION_BY_KEY = new Map<string, SettingDefinition>(SETTING_DEFINITIONS.map((definition) => [definition.key, definition]));
