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
    id: string;
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
  learningItem?: LearningItem | null;
  recommendedResources?: ImprovementPlanItemLearningResource[];
};

export type ImprovementPlanItemLearningResource = {
  id: string;
  position: number;
  reason?: string;
  learningItem: LearningItem;
};

export type LearningItem = {
  id: string;
  type: 'ARTICLE' | 'DOCUMENT' | 'TASK' | 'EXERCISE' | 'PROJECT' | 'VIDEO' | 'INTERVIEW_REVIEW';
  title: string;
  description?: string;
  contentUrl?: string | null;
  difficulty?: Difficulty;
  tags?: string[];
  dimensionKeys?: string[];
  status?: 'ACTIVE' | 'ARCHIVED' | 'DRAFT';
  estimatedMinutes: number;
  roleProfile?: { id: string; name: string } | null;
  skill?: { id?: string; name: string; roleProfileId?: string } | null;
  progress?: LearningProgress[];
  recommendedPlanItems?: Array<{
    reason?: string;
    planItem: {
      title: string;
      dimensionKey?: string;
      plan: {
        report: {
          session: { roleProfile?: { name: string } };
        };
      };
    };
  }>;
};

export type LearningProgress = {
  id: string;
  status: 'TODO' | 'IN_PROGRESS' | 'DONE';
  score?: number | null;
  completedAt?: string | null;
  note?: string;
  reflection?: string;
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
