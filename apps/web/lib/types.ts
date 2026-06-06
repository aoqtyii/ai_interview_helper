export type RoleProfile = {
  id: string;
  name: string;
  description: string;
  skills?: { id: string; name: string; category: string; description: string }[];
};

export type Difficulty = 'JUNIOR' | 'MID' | 'SENIOR';

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'USER';
};

export type InterviewSession = {
  id: string;
  status: string;
  difficulty: Difficulty;
  topic?: string;
  roleProfile: { id?: string; name: string };
  turns?: { id: string; speaker: string; content: string }[];
  report?: {
    overallScore: number;
    dimensionScores?: Record<string, number>;
    summary?: string;
    recommendations?: string[];
  };
};

export type LearningItem = {
  id: string;
  title: string;
  description?: string;
  estimatedMinutes: number;
  skill?: { name: string };
};

export type Article = {
  id: string;
  title: string;
  url: string;
  source: { name: string };
  digest?: { summary: string; tags: string[] };
};

export type AiRunLog = {
  id: string;
  taskType: string;
  provider: string;
  model: string;
  status: string;
  latencyMs: number;
};
