import Link from 'next/link';
import { ApiError } from '@/lib/api';
import { Panel } from './panel';
import { Button } from './button';

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <Panel className="border-dashed text-center">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-slate-400">{description}</p>
    </Panel>
  );
}

export function LoadingState({ title = '正在加载', description = '正在从后端读取真实数据。' }: { title?: string; description?: string }) {
  return (
    <Panel aria-busy="true">
      <div className="flex items-center gap-3">
        <div className="h-3 w-3 rounded-full bg-cyan shadow-[0_0_18px_rgba(34,211,238,0.75)]" />
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-slate-400">{description}</p>
        </div>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-20 animate-pulse rounded-md border border-line bg-white/[0.04]" />
        ))}
      </div>
    </Panel>
  );
}

export function ErrorState({ error }: { error: unknown }) {
  const unauthorized = error instanceof ApiError && error.status === 401;

  return (
    <Panel className="border-red-400/40 bg-red-950/20">
      <h2 className="text-lg font-semibold text-red-100">{unauthorized ? '需要登录' : '数据加载失败'}</h2>
      <p className="mt-2 text-sm text-red-100/75">
        {unauthorized ? '请先登录后再访问该工作区。' : '当前无法连接到后端服务，页面不会展示演示数据来掩盖错误。'}
      </p>
      {unauthorized && (
        <Link href="/login" className="mt-4 inline-flex">
          <Button>去登录</Button>
        </Link>
      )}
    </Panel>
  );
}
