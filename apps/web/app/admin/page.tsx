'use client';

import { useEffect, useState } from 'react';
import { DatabaseZap, Play } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';
import { api, demo, safeApi } from '@/lib/api';
import type { AiRunLog } from '@/lib/types';

export default function AdminPage() {
  const [logs, setLogs] = useState<AiRunLog[]>(demo.logs);
  const [message, setMessage] = useState('');

  useEffect(() => {
    void safeApi<AiRunLog[]>('/admin/ai-run-logs', demo.logs).then(setLogs);
  }, []);

  async function runIngestion() {
    setMessage('抓取任务执行中...');
    const result = await api('/admin/ingestion/run', { method: 'POST' }).catch(() => null);
    setMessage(result ? '抓取任务已完成。' : '抓取失败，请确认已使用管理员账号登录且 API 可用。');
  }

  return (
    <AppShell>
      <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
        <Panel>
          <h2 className="text-lg font-semibold">运营控制台</h2>
          <div className="mt-4 space-y-3 text-sm text-slate-300">
            <div className="rounded-md border border-line bg-black/20 p-4">岗位画像、题库、Prompt 模板和资讯源通过 Admin API 管理。</div>
            <div className="rounded-md border border-line bg-black/20 p-4">所有 AI 调用会记录 provider、model、状态和耗时。</div>
          </div>
          <Button className="mt-5 w-full" onClick={runIngestion}>
            <Play className="h-4 w-4" />
            触发资讯抓取
          </Button>
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
    </AppShell>
  );
}
