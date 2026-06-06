'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bot, Send, SquareCheckBig } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';
import { InlineEmpty, InlineError, InlineLoading, apiErrorMessage, apiErrorRequestId } from '@/components/ui/state';
import { api, ApiError } from '@/lib/api';
import type { Difficulty, InterviewSession, RoleProfile } from '@/lib/types';

const MAX_CANDIDATE_ANSWERS = 5;
const MIN_CANDIDATE_ANSWERS_FOR_REPORT = 2;
const DEFAULT_TOPIC = 'AI Agent 应用落地';

type Operation = 'initial' | 'loadSession' | 'start' | 'answer' | 'finish';

type PageError = {
  scope: 'load' | 'start' | 'answer' | 'finish';
  message: string;
  requestId?: string;
};

const difficultyOptions: Array<{ value: Difficulty; label: string }> = [
  { value: 'JUNIOR', label: '初级' },
  { value: 'MID', label: '中级' },
  { value: 'SENIOR', label: '高级' }
];

export default function InterviewsPage() {
  const [roles, setRoles] = useState<RoleProfile[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('MID');
  const [topic, setTopic] = useState(DEFAULT_TOPIC);
  const [sessions, setSessions] = useState<InterviewSession[]>([]);
  const [current, setCurrent] = useState<InterviewSession | null>(null);
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState<PageError | null>(null);
  const [operation, setOperation] = useState<Operation | null>('initial');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setOperation('initial');
      try {
        const [nextRoles, nextSessions] = await Promise.all([api<RoleProfile[]>('/role-profiles'), api<InterviewSession[]>('/interviews/sessions')]);
        if (cancelled) return;
        setRoles(nextRoles);
        setSelectedRoleId((existing) => existing || nextRoles[0]?.id || '');
        setSessions(nextSessions);
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
  const candidateAnswers = countCandidateAnswers(current);
  const reachedMaxAnswers = candidateAnswers >= MAX_CANDIDATE_ANSWERS;
  const completed = current?.status === 'COMPLETED';
  const canAnswer = Boolean(current && !completed && !reachedMaxAnswers);
  const canFinish = Boolean(current && !completed && candidateAnswers >= MIN_CANDIDATE_ANSWERS_FOR_REPORT);

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
          topic: trimmedTopic || DEFAULT_TOPIC
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
    if (candidateAnswers < MIN_CANDIDATE_ANSWERS_FOR_REPORT) {
      setError({
        scope: 'finish',
        message: `至少完成 ${MIN_CANDIDATE_ANSWERS_FOR_REPORT} 次回答后才能生成正式评分报告。`
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

  return (
    <AppShell>
      <div className="grid gap-5 xl:grid-cols-[0.82fr_1.18fr]">
        <Panel>
          <h2 className="text-lg font-semibold">启动模拟面试</h2>
          {error && error.scope !== 'answer' && (
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
                    <button
                      key={role.id}
                      className={selectionClass(role.id === selectedRole?.id)}
                      onClick={() => setSelectedRoleId(role.id)}
                      type="button"
                    >
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
                placeholder={DEFAULT_TOPIC}
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
              <button
                key={session.id}
                className={selectionClass(current?.id === session.id)}
                onClick={() => void selectSession(session.id)}
                type="button"
              >
                <span className="font-medium">{session.roleProfile.name}</span>
                <span className="mt-1 block text-xs text-slate-400">
                  {difficultyLabel(session.difficulty as Difficulty)} · {statusLabel(session.status)} · {countCandidateAnswers(session)}/{MAX_CANDIDATE_ANSWERS}
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
                  {current ? `${current.roleProfile.name} · ${difficultyLabel(current.difficulty as Difficulty)} · ${current.topic ?? DEFAULT_TOPIC}` : '选择岗位画像后开始一次文本模拟面试'}
                </p>
              </div>
              <span className="rounded-md border border-cyan/40 px-2 py-1 text-sm text-cyan">
                {candidateAnswers}/{MAX_CANDIDATE_ANSWERS} 轮
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
              {!current && <InlineEmpty title="尚未开始面试" description="配置岗位、难度和主题后，开始一场 5 轮文本模拟面试。" />}
              {current && reachedMaxAnswers && !completed && (
                <InlineEmpty title="已完成 5 轮回答" description="本轮面试已达到默认轮数上限，可以结束并生成评分报告。" />
              )}
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
              {current && !completed && candidateAnswers < MIN_CANDIDATE_ANSWERS_FOR_REPORT && (
                <p className="text-xs text-slate-500">至少完成 {MIN_CANDIDATE_ANSWERS_FOR_REPORT} 次回答后可以生成正式评分报告。</p>
              )}
            </div>
          </Panel>

          {current?.report ? <ReportPanel session={current} /> : <Panel>{current ? <InlineEmpty title="暂无评分报告" description="结束面试后，这里会展示总分、维度分和补弱建议。" /> : <InlineEmpty title="报告等待生成" description="完成一场面试后再生成结构化评分报告。" />}</Panel>}
        </div>
      </div>
    </AppShell>
  );
}

function ReportPanel({ session }: { session: InterviewSession }) {
  const report = session.report;
  if (!report) return null;
  const dimensions = Object.entries(report.dimensionScores ?? {});
  const recommendations = Array.isArray(report.recommendations) ? report.recommendations : [];

  return (
    <Panel>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">评分报告</h2>
        <span className="rounded-md bg-acid/10 px-2 py-1 text-sm text-acid">{report.overallScore}/100</span>
      </div>
      <p className="text-sm leading-6 text-slate-300">{report.summary}</p>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {dimensions.map(([name, score]) => (
          <div key={name} className="rounded-md border border-line bg-black/20 p-3">
            <div className="flex justify-between text-sm">
              <span>{name}</span>
              <span className="text-cyan">{score}</span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-white/10">
              <div className="h-2 rounded-full bg-cyan" style={{ width: `${Math.max(0, Math.min(100, score))}%` }} />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5">
        <h3 className="text-sm font-semibold text-slate-300">补弱建议</h3>
        <div className="mt-3 grid gap-2">
          {recommendations.map((item, index) => (
            <div key={`${item}-${index}`} className="rounded-md border border-line bg-white/[0.03] p-3 text-sm text-slate-300">
              {index + 1}. {item}
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
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
