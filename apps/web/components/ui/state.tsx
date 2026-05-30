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
