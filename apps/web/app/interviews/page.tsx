'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bot, Send, SquareCheckBig } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';
import { InlineEmpty, InlineError, InlineLoading, apiErrorMessage, apiErrorRequestId } from '@/components/ui/state';
import { api, ApiError } from '@/lib/api';
import type { InterviewSession, RoleProfile } from '@/lib/types';

type Operation = 'initial' | 'start' | 'answer' | 'finish';

type PageError = {
  scope: 'load' | 'start' | 'answer' | 'finish';
  message: string;
  requestId?: string;
};

export default function InterviewsPage() {
  const [roles, setRoles] = useState<RoleProfile[]>([]);
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

  const selectedRole = useMemo(() => roles[0], [roles]);
  const loading = operation !== null;
  const initialLoading = operation === 'initial' && !roles.length && !sessions.length && !current;
  const answerFailed = error?.scope === 'answer';

  async function startInterview() {
    if (!selectedRole) return;
    setOperation('start');
    setError(null);
    try {
      const session = await api<InterviewSession>('/interviews/sessions', {
        method: 'POST',
        body: JSON.stringify({ roleProfileId: selectedRole.id, difficulty: 'MID', topic: 'AI Agent 应用落地' })
      });
      setCurrent(session);
      setSessions((existing) => [session, ...existing.filter((item) => item.id !== session.id)]);
    } catch (nextError) {
      setError(toPageError(nextError, 'start', '面试启动失败，请确认 AI 配置和后端服务状态。'));
    } finally {
      setOperation(null);
    }
  }

  async function sendAnswer() {
    if (!current || !answer.trim()) return;
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
    if (!current) return;
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
      <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        <Panel>
          <h2 className="text-lg font-semibold">启动模拟面试</h2>
          {error && error.scope !== 'answer' && (
            <div className="mt-4">
              <InlineError title={errorTitle(error)} description={error.message} requestId={error.requestId} />
            </div>
          )}
          <div className="mt-4 space-y-3">
            {initialLoading && <InlineLoading title="正在加载面试配置" />}
            {!loading && !roles.length && !error && <InlineEmpty title="暂无可用岗位画像" description="管理员配置岗位画像后，用户才能启动模拟面试。" />}
            {roles.map((role) => (
              <div key={role.id} className="rounded-md border border-line bg-black/20 p-4">
                <div className="font-medium">{role.name}</div>
                <div className="mt-1 text-sm text-slate-400">{role.description}</div>
              </div>
            ))}
          </div>
          <Button className="mt-5 w-full" onClick={() => void startInterview()} disabled={loading || !selectedRole}>
            <Bot className="h-4 w-4" />
            {operation === 'start' ? '启动中' : '开始 AI Agent 主题面试'}
          </Button>

          <h3 className="mt-8 text-sm font-semibold text-slate-300">历史记录</h3>
          <div className="mt-3 space-y-2">
            {!loading && !sessions.length && <InlineEmpty title="暂无历史面试" description="完成或启动一次面试后，这里会显示真实记录。" />}
            {sessions.map((session) => (
              <button
                key={session.id}
                className="w-full rounded-md border border-line bg-white/[0.03] p-3 text-left text-sm hover:border-cyan/50"
                onClick={() => setCurrent(session)}
              >
                {session.roleProfile.name} · {session.status}
              </button>
            ))}
          </div>
        </Panel>

        <Panel className="min-h-[640px]">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">面试工作区</h2>
            {current?.report && <span className="rounded-md bg-acid/10 px-2 py-1 text-sm text-acid">评分 {current.report.overallScore}</span>}
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
            {!current && <InlineEmpty title="尚未开始面试" description="选择岗位画像后开始一次文本模拟面试。" />}
          </div>

          <div className="mt-5 space-y-3">
            {answerFailed && <InlineError title="回答未发送" description={error.message} requestId={error.requestId} />}
            <div className="flex gap-2">
              <textarea
                className="min-h-24 flex-1 rounded-md border border-line bg-black/30 p-3 text-sm"
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                placeholder="输入你的回答..."
              />
              <div className="flex w-36 flex-col gap-2">
                <Button onClick={() => void sendAnswer()} disabled={!current || loading || !answer.trim()}>
                  <Send className="h-4 w-4" />
                  {answerFailed ? '重新发送' : '发送'}
                </Button>
                <Button variant="ghost" onClick={() => void finish()} disabled={!current || loading}>
                  <SquareCheckBig className="h-4 w-4" />
                  结束
                </Button>
              </div>
            </div>
          </div>
        </Panel>
      </div>
    </AppShell>
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
  return '正在加载面试配置...';
}
