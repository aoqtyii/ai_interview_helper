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
    schemaVersion?: number;
    dimensionScores?: Record<string, number>;
    dimensionScoreRows?: AssessmentDimensionScore[];
    findings?: AssessmentFinding[];
    summary?: string;
    recommendations?: string[];
    nextPractice?: string;
    improvementPlans?: ImprovementPlan[];
  };
};

export type AssessmentDimensionScore = {
  id: string;
  dimensionKey: string;
  dimensionName: string;
  score: number;
  rationale: string;
  position: number;
};

export type AssessmentFinding = {
  id: string;
  type: 'STRENGTH' | 'WEAKNESS';
  dimensionKey: string;
  content: string;
  position: number;
};

export type ImprovementPlan = {
  id: string;
  status: string;
  planItems?: ImprovementPlanItem[];
};

export type ImprovementPlanItem = {
  id: string;
  dimensionKey: string;
  title: string;
  weakness: string;
  practiceMethod: string;
  priority: number;
  estimatedMinutes: number;
  status: string;
  skill?: { id?: string; name: string } | null;
  learningItem?: { id: string; title: string; contentUrl?: string | null } | null;
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
