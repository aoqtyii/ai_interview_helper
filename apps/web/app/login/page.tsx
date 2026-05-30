'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LockKeyhole } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('user@aih.local');
  const [password, setPassword] = useState('user123456');
  const [error, setError] = useState('');

  async function login() {
    setError('');
    try {
      await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      router.push('/dashboard');
    } catch {
      setError('登录失败，请确认 API 已启动并使用种子账号。');
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center grid-mask p-5">
      <Panel className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-md border border-cyan/50 bg-cyan/10 p-3">
            <LockKeyhole className="h-5 w-5 text-cyan" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">登录 AIH Console</h1>
            <p className="text-sm text-slate-400">内部工具首版账号入口</p>
          </div>
        </div>
        <div className="space-y-4">
          <input className="w-full rounded-md border border-line bg-black/30 px-3 py-2" value={email} onChange={(event) => setEmail(event.target.value)} />
          <input
            className="w-full rounded-md border border-line bg-black/30 px-3 py-2"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {error && <p className="text-sm text-red-300">{error}</p>}
          <Button className="w-full" onClick={() => void login()}>
            进入系统
          </Button>
        </div>
      </Panel>
    </main>
  );
}
