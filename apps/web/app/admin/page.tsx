'use client';

import { useEffect, useState } from 'react';
import { DatabaseZap, Play } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';
import { api, ApiError } from '@/lib/api';
import type { AiRunLog, CurrentUser } from '@/lib/types';

export default function AdminPage() {
  const [logs, setLogs] = useState<AiRunLog[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadAdminData() {
      try {
        const user = await api<CurrentUser>('/auth/me');
        if (user.role !== 'ADMIN') {
          if (!cancelled) setError('当前账号没有管理员权限。');
          return;
        }

        const nextLogs = await api<AiRunLog[]>('/admin/ai-run-logs');
        if (cancelled) return;
        setLogs(nextLogs);
        setError('');
      } catch (nextError) {
        if (!cancelled) setError(formatAdminError(nextError));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadAdminData();

    return () => {
      cancelled = true;
    };
  }, []);

  async function runIngestion() {
    setRunning(true);
    setMessage('抓取任务执行中...');
    setError('');
    const result = await api('/admin/ingestion/run', { method: 'POST' }).catch((nextError) => {
      setError(formatAdminError(nextError));
      return null;
    });
    setMessage(result ? '抓取任务已完成。' : '');
    setRunning(false);
  }

  return (
    <AppShell>
      {error === '当前账号没有管理员权限。' ? (
        <Panel className="border-red-400/40 bg-red-950/20">
          <h2 className="text-lg font-semibold text-red-100">403</h2>
          <p className="mt-2 text-sm text-red-100/75">{error}</p>
        </Panel>
      ) : (
      <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
        <Panel>
          <h2 className="text-lg font-semibold">运营控制台</h2>
          <div className="mt-4 space-y-3 text-sm text-slate-300">
            <div className="rounded-md border border-line bg-black/20 p-4">岗位画像、题库、Prompt 模板和资讯源通过 Admin API 管理。</div>
            <div className="rounded-md border border-line bg-black/20 p-4">所有 AI 调用会记录 provider、model、状态和耗时。</div>
          </div>
          <Button className="mt-5 w-full" onClick={() => void runIngestion()} disabled={running}>
            <Play className="h-4 w-4" />
            {running ? '执行中' : '触发资讯抓取'}
          </Button>
          {error && <p className="mt-3 rounded-md border border-red-400/40 bg-red-950/20 p-3 text-sm text-red-100">{error}</p>}
          {message && <p className="mt-3 text-sm text-slate-300">{message}</p>}
        </Panel>

        <Panel>
          <div className="mb-4 flex items-center gap-2">
            <DatabaseZap className="h-5 w-5 text-cyan" />
            <h2 className="text-lg font-semibold">AI 调用日志</h2>
          </div>
          <div className="overflow-hidden rounded-md border border-line">
            <table className="w-full text-left text-sm">
              <thead className="bg-white/5 text-slate-400">
                <tr>
                  <th className="px-3 py-2">任务</th>
                  <th className="px-3 py-2">模型</th>
                  <th className="px-3 py-2">状态</th>
                  <th className="px-3 py-2">耗时</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td className="px-3 py-6 text-center text-slate-400" colSpan={4}>
                      正在加载 AI 调用日志
                    </td>
                  </tr>
                )}
                {!loading && !logs.length && (
                  <tr>
                    <td className="px-3 py-6 text-center text-slate-400" colSpan={4}>
                      暂无 AI 调用日志
                    </td>
                  </tr>
                )}
                {logs.map((log) => (
                  <tr key={log.id} className="border-t border-line">
                    <td className="px-3 py-2">{log.taskType}</td>
                    <td className="px-3 py-2">{log.model}</td>
                    <td className="px-3 py-2 text-cyan">{log.status}</td>
                    <td className="px-3 py-2">{log.latencyMs} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
      )}
    </AppShell>
  );
}

function formatAdminError(error: unknown) {
  if (error instanceof ApiError && error.status === 401) return '请先登录管理员账号。';
  if (error instanceof ApiError && error.status === 403) return '当前账号没有管理员权限。';
  return '管理接口请求失败，请确认 API 服务和权限配置。';
}
