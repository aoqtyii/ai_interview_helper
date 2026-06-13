'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bot, ExternalLink, Send, SquareCheckBig } from 'lucide-react';
import { FocusedPracticeButton } from '@/components/interview/focused-practice-button';
import { AppShell } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';
import { InlineEmpty, InlineError, InlineLoading, apiErrorMessage, apiErrorRequestId } from '@/components/ui/state';
import { api, ApiError } from '@/lib/api';
import type { AssessmentDimensionScore, Difficulty, ImprovementPlanItem, InterviewConfig, InterviewSession, LearningItem, LearningProgress, RoleProfile } from '@/lib/types';

const DEFAULT_MAX_CANDIDATE_ANSWERS = 5;
const DEFAULT_MIN_CANDIDATE_ANSWERS_FOR_REPORT = 2;
const DEFAULT_TOPIC = 'AI Agent 应用落地';

type Operation = 'initial' | 'loadSession' | 'start' | 'answer' | 'finish';
type ProgressStatus = LearningProgress['status'];

type PageError = {
  scope: 'load' | 'start' | 'answer' | 'finish' | 'progress';
  message: string;
  requestId?: string;
};

const difficultyOptions: Array<{ value: Difficulty; label: string }> = [
  { value: 'JUNIOR', label: '初级' },
  { value: 'MID', label: '中级' },
  { value: 'SENIOR', label: '高级' }
];

const progressOptions: Array<{ value: ProgressStatus; label: string }> = [
  { value: 'TODO', label: '未开始' },
  { value: 'IN_PROGRESS', label: '进行中' },
  { value: 'DONE', label: '已完成' }
];

export default function InterviewsPage() {
  const [roles, setRoles] = useState<RoleProfile[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('MID');
  const [interviewConfig, setInterviewConfig] = useState<InterviewConfig>({
    maxTurns: DEFAULT_MAX_CANDIDATE_ANSWERS,
    minAnswersForReport: DEFAULT_MIN_CANDIDATE_ANSWERS_FOR_REPORT,
    defaultTopic: DEFAULT_TOPIC,
    focusedPracticeEnabled: true
  });
  const [topic, setTopic] = useState(DEFAULT_TOPIC);
  const [sessions, setSessions] = useState<InterviewSession[]>([]);
  const [current, setCurrent] = useState<InterviewSession | null>(null);
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState<PageError | null>(null);
  const [operation, setOperation] = useState<Operation | null>('initial');
  const [updatingLearningItemId, setUpdatingLearningItemId] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setOperation('initial');
      try {
        const initialSessionId = new URLSearchParams(window.location.search).get('sessionId');
        const [nextRoles, nextSessions, nextConfig] = await Promise.all([
          api<RoleProfile[]>('/role-profiles'),
          api<InterviewSession[]>('/interviews/sessions'),
          api<InterviewConfig>('/interviews/config')
        ]);
        const initialSession = initialSessionId ? await api<InterviewSession>(`/interviews/sessions/${initialSessionId}`) : null;
        if (cancelled) return;
        setRoles(nextRoles);
        setInterviewConfig(nextConfig);
        setTopic((existing) => (existing === DEFAULT_TOPIC ? nextConfig.defaultTopic : existing));
        setSelectedRoleId((existing) => existing || nextRoles[0]?.id || '');
        setSessions(nextSessions);
        if (initialSession) setCurrent(initialSession);
        setError(null);
      } catch (nextError) {
        if (!cancelled) setError(toPageError(nextError, 'load', '面试配置加载失败，请确认后端服务和登录状态。'));
      } finally {
        if (!cancelled) setOperation(null);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedRole = useMemo(() => roles.find((role) => role.id === selectedRoleId) ?? roles[0], [roles, selectedRoleId]);
  const loading = operation !== null;
  const initialLoading = operation === 'initial' && !roles.length && !sessions.length && !current;
  const answerFailed = error?.scope === 'answer';
  const progressFailed = error?.scope === 'progress';
  const candidateAnswers = countCandidateAnswers(current);
  const reachedMaxAnswers = candidateAnswers >= interviewConfig.maxTurns;
  const completed = current?.status === 'COMPLETED';
  const canAnswer = Boolean(current && !completed && !reachedMaxAnswers);
  const canFinish = Boolean(current && !completed && candidateAnswers >= interviewConfig.minAnswersForReport);

  async function startInterview() {
    if (!selectedRole) return;
    setOperation('start');
    setError(null);
    try {
      const trimmedTopic = topic.trim();
      const session = await api<InterviewSession>('/interviews/sessions', {
        method: 'POST',
        body: JSON.stringify({
          roleProfileId: selectedRole.id,
          difficulty,
          topic: trimmedTopic || interviewConfig.defaultTopic
        })
      });
      setCurrent(session);
      setSessions((existing) => [session, ...existing.filter((item) => item.id !== session.id)]);
      setAnswer('');
    } catch (nextError) {
      setError(toPageError(nextError, 'start', '面试启动失败，请确认 AI 配置和后端服务状态。'));
    } finally {
      setOperation(null);
    }
  }

  async function selectSession(sessionId: string) {
    setOperation('loadSession');
    setError(null);
    try {
      const session = await api<InterviewSession>(`/interviews/sessions/${sessionId}`);
      setCurrent(session);
      setAnswer('');
    } catch (nextError) {
      setError(toPageError(nextError, 'load', '面试记录加载失败，请确认权限和后端服务状态。'));
    } finally {
      setOperation(null);
    }
  }

  async function sendAnswer() {
    if (!current || !answer.trim() || !canAnswer) return;
    setOperation('answer');
    setError(null);
    try {
      const session = await api<InterviewSession>(`/interviews/sessions/${current.id}/turns`, {
        method: 'POST',
        body: JSON.stringify({ content: answer })
      });
      setCurrent(session);
      setSessions((existing) => [session, ...existing.filter((item) => item.id !== session.id)]);
      setAnswer('');
    } catch (nextError) {
      setError(toPageError(nextError, 'answer', '回答发送失败，输入已保留，可以直接重试。'));
    } finally {
      setOperation(null);
    }
  }

  async function finish() {
    if (!current || completed) return;
    if (candidateAnswers < interviewConfig.minAnswersForReport) {
      setError({
        scope: 'finish',
        message: `至少完成 ${interviewConfig.minAnswersForReport} 次回答后才能生成正式评分报告。`
      });
      return;
    }

    setOperation('finish');
    setError(null);
    try {
      const session = await api<InterviewSession>(`/interviews/sessions/${current.id}/finish`, { method: 'POST' });
      setCurrent(session);
      setSessions((existing) => [session, ...existing.filter((item) => item.id !== session.id)]);
    } catch (nextError) {
      setError(toPageError(nextError, 'finish', '评分报告生成失败，请稍后重试。'));
    } finally {
      setOperation(null);
    }
  }

  async function updateLearningProgress(learningItemId: string, status: ProgressStatus) {
    setUpdatingLearningItemId(learningItemId);
    setError(null);
    try {
      const progress = await api<LearningProgress>('/learning/progress', {
        method: 'POST',
        body: JSON.stringify({ learningItemId, status })
      });
      setCurrent((existing) => (existing ? applyLearningProgress(existing, learningItemId, progress) : existing));
      setSessions((existing) => existing.map((session) => applyLearningProgress(session, learningItemId, progress)));
    } catch (nextError) {
      setError(toPageError(nextError, 'progress', '学习进度更新失败，请稍后重试。'));
    } finally {
      setUpdatingLearningItemId('');
    }
  }

  function handleFocusedSessionCreated(session: InterviewSession) {
    setCurrent(session);
    setSessions((existing) => [session, ...existing.filter((item) => item.id !== session.id)]);
    setAnswer('');
    setError(null);
  }

  return (
    <AppShell>
      <div className="grid gap-5 xl:grid-cols-[0.82fr_1.18fr]">
        <Panel>
          <h2 className="text-lg font-semibold">启动模拟面试</h2>
          {error && error.scope !== 'answer' && error.scope !== 'progress' && (
            <div className="mt-4">
              <InlineError title={errorTitle(error)} description={error.message} requestId={error.requestId} />
            </div>
          )}

          <div className="mt-4 space-y-4">
            {initialLoading && <InlineLoading title="正在加载面试配置" />}
            {!loading && !roles.length && !error && <InlineEmpty title="暂无可用岗位画像" description="管理员配置岗位画像后，用户才能启动模拟面试。" />}

            {roles.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-medium uppercase text-slate-500">目标岗位</div>
                <div className="grid gap-2">
                  {roles.map((role) => (
                    <button key={role.id} className={selectionClass(role.id === selectedRole?.id)} onClick={() => setSelectedRoleId(role.id)} type="button">
                      <span className="font-medium">{role.name}</span>
                      <span className="mt-1 block text-xs text-slate-400">{role.description}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <div className="text-xs font-medium uppercase text-slate-500">难度</div>
              <div className="grid grid-cols-3 gap-2">
                {difficultyOptions.map((item) => (
                  <button key={item.value} className={selectionClass(difficulty === item.value)} onClick={() => setDifficulty(item.value)} type="button">
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <label className="block space-y-2">
              <span className="text-xs font-medium uppercase text-slate-500">主题</span>
              <input
                className="w-full rounded-md border border-line bg-black/30 px-3 py-2 text-sm outline-none focus:border-cyan/60"
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                placeholder={interviewConfig.defaultTopic}
              />
            </label>
          </div>

          <Button className="mt-5 w-full" onClick={() => void startInterview()} disabled={loading || !selectedRole}>
            <Bot className="h-4 w-4" />
            {operation === 'start' ? '启动中' : '开始面试'}
          </Button>

          <h3 className="mt-8 text-sm font-semibold text-slate-300">历史记录</h3>
          <div className="mt-3 space-y-2">
            {!loading && !sessions.length && <InlineEmpty title="暂无历史面试" description="完成或启动一次面试后，这里会显示真实记录。" />}
            {sessions.map((session) => (
              <button key={session.id} className={selectionClass(current?.id === session.id)} onClick={() => void selectSession(session.id)} type="button">
                <span className="font-medium">{session.roleProfile.name}</span>
                <span className="mt-1 block text-xs text-slate-400">
                  {difficultyLabel(session.difficulty as Difficulty)} / {statusLabel(session.status)} / {countCandidateAnswers(session)}/{interviewConfig.maxTurns}
                </span>
              </button>
            ))}
          </div>
        </Panel>

        <div className="space-y-5">
          <Panel className="min-h-[560px]">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">面试工作区</h2>
                <p className="mt-1 text-sm text-slate-400">
                  {current ? `${current.roleProfile.name} / ${difficultyLabel(current.difficulty as Difficulty)} / ${current.topic ?? interviewConfig.defaultTopic}` : '选择岗位画像后开始一次文本模拟面试'}
                </p>
              </div>
              <span className="rounded-md border border-cyan/40 px-2 py-1 text-sm text-cyan">
                {candidateAnswers}/{interviewConfig.maxTurns} 轮
              </span>
            </div>

            <div className="space-y-3">
              {operation && current && <div className="rounded-md border border-cyan/30 bg-cyan/10 p-3 text-sm text-cyan">{operationLabel(operation)}</div>}
              {(current?.turns ?? []).map((turn) => (
                <div
                  key={turn.id}
                  className={turn.speaker === 'CANDIDATE' ? 'ml-auto max-w-[82%] rounded-md bg-cyan/10 p-4' : 'max-w-[82%] rounded-md border border-line bg-black/30 p-4'}
                >
                  <div className="mb-1 text-xs text-slate-400">{turn.speaker === 'CANDIDATE' ? '候选人' : 'AI 面试官'}</div>
                  <div className="text-sm leading-6">{turn.content}</div>
                </div>
              ))}
              {!current && <InlineEmpty title="尚未开始面试" description={`配置岗位、难度和主题后，开始一场 ${interviewConfig.maxTurns} 轮文本模拟面试。`} />}
              {current && reachedMaxAnswers && !completed && <InlineEmpty title={`已完成 ${interviewConfig.maxTurns} 轮回答`} description="本轮面试已达到当前轮数上限，可以结束并生成评分报告。" />}
            </div>

            <div className="mt-5 space-y-3">
              {answerFailed && <InlineError title="回答未发送" description={error.message} requestId={error.requestId} />}
              <div className="flex gap-2">
                <textarea
                  className="min-h-24 flex-1 rounded-md border border-line bg-black/30 p-3 text-sm outline-none focus:border-cyan/60 disabled:opacity-60"
                  value={answer}
                  onChange={(event) => setAnswer(event.target.value)}
                  placeholder={canAnswer ? '输入你的回答...' : '当前面试不能继续提交回答'}
                  disabled={!canAnswer || loading}
                />
                <div className="flex w-36 flex-col gap-2">
                  <Button onClick={() => void sendAnswer()} disabled={!canAnswer || loading || !answer.trim()}>
                    <Send className="h-4 w-4" />
                    {answerFailed ? '重新发送' : '发送'}
                  </Button>
                  <Button variant="ghost" onClick={() => void finish()} disabled={!current || completed || loading || !canFinish}>
                    <SquareCheckBig className="h-4 w-4" />
                    结束评分
                  </Button>
                </div>
              </div>
              {current && !completed && candidateAnswers < interviewConfig.minAnswersForReport && (
                <p className="text-xs text-slate-500">至少完成 {interviewConfig.minAnswersForReport} 次回答后可以生成正式评分报告。</p>
              )}
            </div>
          </Panel>

          {progressFailed && <InlineError title="学习进度更新失败" description={error.message} requestId={error.requestId} />}
          {current?.report ? (
            <ReportPanel
              session={current}
              updatingLearningItemId={updatingLearningItemId}
              onProgressChange={updateLearningProgress}
              onFocusedSessionCreated={handleFocusedSessionCreated}
              focusedPracticeEnabled={interviewConfig.focusedPracticeEnabled}
            />
          ) : (
            <Panel>
              {current ? (
                <InlineEmpty title="暂无评分报告" description="结束面试后，这里会展示总分、维度分和补弱建议。" />
              ) : (
                <InlineEmpty title="报告等待生成" description="完成一场面试后再生成结构化评分报告。" />
              )}
            </Panel>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function ReportPanel({
  session,
  updatingLearningItemId,
  onProgressChange,
  onFocusedSessionCreated,
  focusedPracticeEnabled
}: {
  session: InterviewSession;
  updatingLearningItemId: string;
  onProgressChange: (learningItemId: string, status: ProgressStatus) => Promise<void>;
  onFocusedSessionCreated: (session: InterviewSession) => void;
  focusedPracticeEnabled: boolean;
}) {
  const report = session.report;
  if (!report) return null;
  const dimensions = normalizeDimensions(report.dimensionScoreRows, report.dimensionScores);
  const strengths = (report.findings ?? []).filter((item) => item.type === 'STRENGTH');
  const weaknesses = (report.findings ?? []).filter((item) => item.type === 'WEAKNESS');
  const planItems = normalizePlanItems(report.improvementPlans?.[0]?.planItems, report.recommendations);
  const canStartFocusedPractice = Boolean(focusedPracticeEnabled && report.id && (weaknesses.length || planItems.length));

  return (
    <Panel>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">评分报告</h2>
        <span className="rounded-md bg-acid/10 px-2 py-1 text-sm text-acid">{report.overallScore}/100</span>
      </div>
      <p className="text-sm leading-6 text-slate-300">{report.summary}</p>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {dimensions.map((dimension) => (
          <div key={dimension.dimensionKey} className="rounded-md border border-line bg-black/20 p-3">
            <div className="flex justify-between gap-3 text-sm">
              <span>{dimension.dimensionName}</span>
              <span className="shrink-0 text-cyan">{dimension.score}</span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-white/10">
              <div className="h-2 rounded-full bg-cyan" style={{ width: `${Math.max(0, Math.min(100, dimension.score))}%` }} />
            </div>
            {dimension.rationale && <p className="mt-2 text-xs leading-5 text-slate-400">{dimension.rationale}</p>}
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <FindingList title="优势" items={strengths.map((item) => item.content)} empty="暂无优势条目" />
        <FindingList title="短板" items={weaknesses.map((item) => item.content)} empty="暂无短板条目" />
      </div>

      <div className="mt-5">
        <h3 className="text-sm font-semibold text-slate-300">补弱任务</h3>
        <div className="mt-3 grid gap-3">
          {planItems.map((item) => {
            const resources = recommendedLearningItems(item);
            return (
              <div key={item.id} className="rounded-md border border-line bg-white/[0.03] p-3 text-sm text-slate-300">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-slate-100">
                    {item.priority}. {item.title}
                  </span>
                  <span className="text-xs text-slate-500">{item.estimatedMinutes} 分钟</span>
                </div>
                {item.weakness && <p className="mt-2 text-xs leading-5 text-slate-400">短板：{item.weakness}</p>}
                {item.practiceMethod && <p className="mt-1 text-xs leading-5 text-slate-400">练习方式：{item.practiceMethod}</p>}

                <div className="mt-3 grid gap-2">
                  {resources.length ? (
                    resources.map((resource) => (
                      <LearningResourceCard
                        key={resource.learningItem.id}
                        resource={resource.learningItem}
                        reason={resource.reason}
                        updating={updatingLearningItemId === resource.learningItem.id}
                        onProgressChange={onProgressChange}
                      />
                    ))
                  ) : (
                    <div className="rounded-md border border-dashed border-line px-2 py-2 text-xs text-slate-500">
                      暂无匹配资源，仅展示文字练习任务。
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {report.nextPractice && (
        <div className="mt-5 rounded-md border border-acid/30 bg-acid/10 p-3 text-sm text-acid">
          下一轮训练：{report.nextPractice}
        </div>
      )}

      {canStartFocusedPractice && (
        <div className="mt-4 rounded-md border border-cyan/30 bg-cyan/10 p-3">
          <div className="text-sm font-medium text-cyan">下一轮专项训练</div>
          <p className="mt-1 text-xs leading-5 text-slate-300">基于本次报告的短板和补弱任务，启动一场聚焦训练面试。</p>
          <div className="mt-3">
            <FocusedPracticeButton reportId={report.id} onCreated={onFocusedSessionCreated} />
          </div>
        </div>
      )}
    </Panel>
  );
}

function LearningResourceCard({
  resource,
  reason,
  updating,
  onProgressChange
}: {
  resource: LearningItem;
  reason?: string;
  updating: boolean;
  onProgressChange: (learningItemId: string, status: ProgressStatus) => Promise<void>;
}) {
  const progress = resource.progress?.[0];

  return (
    <div className="rounded-md border border-cyan/25 bg-cyan/5 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-medium text-slate-100">{resource.title}</div>
          <div className="mt-1 text-xs text-slate-400">
            {learningTypeLabel(resource.type)} / {resource.estimatedMinutes} 分钟{resource.skill?.name ? ` / ${resource.skill.name}` : ''}
          </div>
          {reason && <div className="mt-2 text-xs leading-5 text-cyan">{reason}</div>}
          {progress?.completedAt && <div className="mt-1 text-xs text-slate-500">完成于 {formatDate(progress.completedAt)}</div>}
        </div>
        {resource.contentUrl && (
          <a href={resource.contentUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-cyan hover:text-acid">
            打开
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {progressOptions.map((option) => (
          <Button
            key={option.value}
            variant={currentProgress(resource) === option.value ? 'primary' : 'ghost'}
            className="h-8 px-3"
            onClick={() => void onProgressChange(resource.id, option.value)}
            disabled={updating}
          >
            {option.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

function FindingList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-300">{title}</h3>
      <div className="mt-3 grid gap-2">
        {items.length ? (
          items.map((item, index) => (
            <div key={`${item}-${index}`} className="rounded-md border border-line bg-white/[0.03] p-3 text-sm text-slate-300">
              {item}
            </div>
          ))
        ) : (
          <InlineEmpty title={empty} description="完成新版评分后会展示结构化条目。" />
        )}
      </div>
    </div>
  );
}

function recommendedLearningItems(item: ImprovementPlanItem) {
  const resources = item.recommendedResources ?? [];
  if (!resources.length && item.learningItem) {
    return [{ id: item.learningItem.id, position: 1, learningItem: item.learningItem, reason: fallbackRecommendationReason(item, item.learningItem) }];
  }
  return Array.from(new Map(resources.map((resource) => [resource.learningItem.id, resource])).values()).slice(0, 3);
}

function currentProgress(item: LearningItem): ProgressStatus {
  return item.progress?.[0]?.status ?? 'TODO';
}

function fallbackRecommendationReason(planItem: ImprovementPlanItem, resource: LearningItem) {
  const reasons: string[] = [];
  if (resource.dimensionKeys?.includes(planItem.dimensionKey)) reasons.push('匹配本次短板维度');
  if (resource.skill?.name) reasons.push(`匹配技能：${resource.skill.name}`);
  if (resource.roleProfile?.name) reasons.push(`匹配岗位：${resource.roleProfile.name}`);
  return reasons.join('，') || '根据本次面试短板推荐';
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function applyLearningProgress(session: InterviewSession, learningItemId: string, progress: LearningProgress): InterviewSession {
  if (!session.report?.improvementPlans) return session;
  return {
    ...session,
    report: {
      ...session.report,
      improvementPlans: session.report.improvementPlans.map((plan) => ({
        ...plan,
        planItems: plan.planItems?.map((item) => updatePlanItemProgress(item, learningItemId, progress))
      }))
    }
  };
}

function updatePlanItemProgress(item: ImprovementPlanItem, learningItemId: string, progress: LearningProgress): ImprovementPlanItem {
  return {
    ...item,
    learningItem: item.learningItem?.id === learningItemId ? { ...item.learningItem, progress: [progress] } : item.learningItem,
    recommendedResources: item.recommendedResources?.map((resource) =>
      resource.learningItem.id === learningItemId ? { ...resource, learningItem: { ...resource.learningItem, progress: [progress] } } : resource
    )
  };
}

function normalizeDimensions(rows?: AssessmentDimensionScore[], legacy?: Record<string, number>): AssessmentDimensionScore[] {
  if (rows?.length) return rows;
  return Object.entries(legacy ?? {}).map(([dimensionName, score], index) => ({
    id: dimensionName,
    dimensionKey: dimensionName,
    dimensionName,
    score,
    rationale: '',
    position: index + 1
  }));
}

function normalizePlanItems(items?: ImprovementPlanItem[], recommendations?: string[]): ImprovementPlanItem[] {
  if (items?.length) return items;
  return (recommendations ?? []).map((title, index) => ({
    id: `${title}-${index}`,
    dimensionKey: '',
    title,
    weakness: '',
    practiceMethod: '',
    priority: index + 1,
    estimatedMinutes: 30,
    status: 'TODO'
  }));
}

function toPageError(error: unknown, scope: PageError['scope'], fallback: string): PageError {
  return {
    scope,
    message: formatApiError(error, fallback),
    requestId: apiErrorRequestId(error)
  };
}

function formatApiError(error: unknown, fallback: string) {
  if (error instanceof ApiError && error.status === 401) return '请先登录后再使用模拟面试。';
  if (error instanceof ApiError && error.status === 403) return '当前账号没有访问该资源的权限。';
  return apiErrorMessage(error, fallback);
}

function errorTitle(error: PageError) {
  if (error.scope === 'load') return '面试配置加载失败';
  if (error.scope === 'start') return '面试启动失败';
  if (error.scope === 'finish') return '评分生成失败';
  return '请求失败';
}

function operationLabel(operation: Operation) {
  if (operation === 'answer') return '正在等待 AI 面试官追问...';
  if (operation === 'finish') return '正在生成评分报告...';
  if (operation === 'start') return '正在启动模拟面试...';
  if (operation === 'loadSession') return '正在加载面试记录...';
  return '正在加载面试配置...';
}

function countCandidateAnswers(session: InterviewSession | null) {
  return (session?.turns ?? []).filter((turn) => turn.speaker === 'CANDIDATE').length;
}

function selectionClass(active: boolean) {
  return `w-full rounded-md border p-3 text-left text-sm transition ${
    active ? 'border-cyan/50 bg-cyan/10 text-cyan' : 'border-line bg-white/[0.03] text-slate-300 hover:border-cyan/50 hover:text-white'
  }`;
}

function difficultyLabel(value: Difficulty) {
  return difficultyOptions.find((item) => item.value === value)?.label ?? value;
}

function statusLabel(value: string) {
  if (value === 'IN_PROGRESS') return '进行中';
  if (value === 'COMPLETED') return '已完成';
  if (value === 'CANCELLED') return '已取消';
  return value;
}

function learningTypeLabel(type: LearningItem['type']) {
  if (type === 'ARTICLE') return '文章';
  if (type === 'DOCUMENT') return '文档';
  if (type === 'TASK') return '任务';
  if (type === 'PROJECT') return '项目练习';
  if (type === 'VIDEO') return '视频';
  if (type === 'INTERVIEW_REVIEW') return '面试复盘';
  return '练习';
}
