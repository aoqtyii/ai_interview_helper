'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bot, Send, SquareCheckBig } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';
import { api, ApiError } from '@/lib/api';
import type { InterviewSession, RoleProfile } from '@/lib/types';

export default function InterviewsPage() {
  const [roles, setRoles] = useState<RoleProfile[]>([]);
  const [sessions, setSessions] = useState<InterviewSession[]>([]);
  const [current, setCurrent] = useState<InterviewSession | null>(null);
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([api<RoleProfile[]>('/role-profiles'), api<InterviewSession[]>('/interviews/sessions')])
      .then(([nextRoles, nextSessions]) => {
        setRoles(nextRoles);
        setSessions(nextSessions);
        setError('');
      })
      .catch((nextError) => setError(formatApiError(nextError)))
      .finally(() => setLoading(false));
  }, []);

  const selectedRole = useMemo(() => roles[0], [roles]);

  async function startInterview() {
    if (!selectedRole) return;
    setLoading(true);
    setError('');
    const session = await api<InterviewSession>('/interviews/sessions', {
      method: 'POST',
      body: JSON.stringify({ roleProfileId: selectedRole.id, difficulty: 'MID', topic: 'AI Agent 应用落地' })
    }).catch((nextError) => {
      setError(formatApiError(nextError));
      return null;
    });
    if (session) setCurrent(session);
    setLoading(false);
  }

  async function sendAnswer() {
    if (!current || !answer.trim()) return;
    setLoading(true);
    setError('');
    const session = await api<InterviewSession>(`/interviews/sessions/${current.id}/turns`, {
      method: 'POST',
      body: JSON.stringify({ content: answer })
    }).catch((nextError) => {
      setError(formatApiError(nextError));
      return null;
    });
    if (session) {
      setCurrent(session);
      setAnswer('');
    }
    setLoading(false);
  }

  async function finish() {
    if (!current) return;
    setLoading(true);
    setError('');
    const session = await api<InterviewSession>(`/interviews/sessions/${current.id}/finish`, { method: 'POST' }).catch((nextError) => {
      setError(formatApiError(nextError));
      return null;
    });
    if (session) setCurrent(session);
    setLoading(false);
  }

  return (
    <AppShell>
      <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        <Panel>
          <h2 className="text-lg font-semibold">启动模拟面试</h2>
          {error && <div className="mt-4 rounded-md border border-red-400/40 bg-red-950/20 p-3 text-sm text-red-100">{error}</div>}
          <div className="mt-4 space-y-3">
            {!loading && !roles.length && !error && <div className="rounded-md border border-dashed border-line p-4 text-sm text-slate-400">暂无可用岗位画像</div>}
            {roles.map((role) => (
              <div key={role.id} className="rounded-md border border-line bg-black/20 p-4">
                <div className="font-medium">{role.name}</div>
                <div className="mt-1 text-sm text-slate-400">{role.description}</div>
              </div>
            ))}
          </div>
          <Button className="mt-5 w-full" onClick={() => void startInterview()} disabled={loading || !selectedRole}>
            <Bot className="h-4 w-4" />
            开始 AI Agent 主题面试
          </Button>

          <h3 className="mt-8 text-sm font-semibold text-slate-300">历史记录</h3>
          <div className="mt-3 space-y-2">
            {!loading && !sessions.length && <div className="rounded-md border border-dashed border-line p-3 text-sm text-slate-400">暂无历史面试</div>}
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
            {(current?.turns ?? []).map((turn) => (
              <div
                key={turn.id}
                className={turn.speaker === 'CANDIDATE' ? 'ml-auto max-w-[82%] rounded-md bg-cyan/10 p-4' : 'max-w-[82%] rounded-md border border-line bg-black/30 p-4'}
              >
                <div className="mb-1 text-xs text-slate-400">{turn.speaker === 'CANDIDATE' ? '候选人' : 'AI 面试官'}</div>
                <div className="text-sm leading-6">{turn.content}</div>
              </div>
            ))}
            {!current && <div className="rounded-md border border-dashed border-line p-8 text-center text-slate-400">选择岗位画像后开始一次文本模拟面试</div>}
          </div>
          <div className="mt-5 flex gap-2">
            <textarea
              className="min-h-24 flex-1 rounded-md border border-line bg-black/30 p-3 text-sm"
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              placeholder="输入你的回答..."
            />
            <div className="flex w-36 flex-col gap-2">
              <Button onClick={() => void sendAnswer()} disabled={!current || loading || !answer.trim()}>
                <Send className="h-4 w-4" />
                发送
              </Button>
              <Button variant="ghost" onClick={() => void finish()} disabled={!current || loading}>
                <SquareCheckBig className="h-4 w-4" />
                结束
              </Button>
            </div>
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}

function formatApiError(error: unknown) {
  if (error instanceof ApiError && error.status === 401) return '请先登录后再使用模拟面试。';
  if (error instanceof ApiError && error.status === 403) return '当前账号没有访问该资源的权限。';
  return '请求失败，请确认后端服务可用后重试。';
}
