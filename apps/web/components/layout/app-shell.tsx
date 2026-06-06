'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BarChart3, BookOpen, BrainCircuit, Newspaper, Shield, Terminal } from 'lucide-react';
import { clsx } from 'clsx';
import { api } from '@/lib/api';
import type { CurrentUser } from '@/lib/types';

const nav = [
  { href: '/dashboard', label: '工作台', icon: BarChart3 },
  { href: '/interviews', label: '模拟面试', icon: BrainCircuit },
  { href: '/learning', label: '学习补弱', icon: BookOpen },
  { href: '/intelligence', label: '前沿情报', icon: Newspaper },
  { href: '/admin', label: '管理台', icon: Shield, adminOnly: true }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    let cancelled = false;

    api<CurrentUser>('/auth/me')
      .then((user) => {
        if (!cancelled) setCurrentUser(user);
      })
      .catch(() => {
        if (!cancelled) setCurrentUser(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const visibleNav = nav.filter((item) => !item.adminOnly || currentUser?.role === 'ADMIN');

  return (
    <main className="min-h-screen grid-mask">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-line bg-void/92 p-5 backdrop-blur lg:block">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md border border-cyan/60 bg-cyan/10">
            <Terminal className="h-5 w-5 text-cyan" />
          </div>
          <div>
            <div className="text-sm font-semibold text-white">AI-Interview</div>
            <div className="text-xs text-slate-400">Helper Console</div>
          </div>
        </div>

        <nav className="space-y-2" aria-label="主导航">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition',
                  active ? 'border border-cyan/40 bg-cyan/10 text-cyan' : 'text-slate-300 hover:bg-white/5 hover:text-white'
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <section className="lg:pl-64">
        <header className="sticky top-0 z-10 border-b border-line bg-void/75 px-5 py-4 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-cyan">AI Candidate Ops</p>
              <h1 className="text-xl font-semibold text-white">AI 应聘能力训练系统</h1>
            </div>
            <Link href="/login" className="rounded-md border border-line px-3 py-2 text-sm text-slate-200 hover:border-cyan/60">
              登录
            </Link>
          </div>
        </header>
        <div className="mx-auto max-w-7xl p-5">{children}</div>
      </section>
    </main>
  );
}
