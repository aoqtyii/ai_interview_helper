import Link from 'next/link';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { Panel } from './panel';
import { Button } from './button';

type StateProps = {
  title: string;
  description: string;
};

export function EmptyState({ title, description }: StateProps) {
  return (
    <Panel className="border-dashed text-center">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-slate-400">{description}</p>
    </Panel>
  );
}

export function InlineEmpty({ title, description }: StateProps) {
  return (
    <div className="rounded-md border border-dashed border-line bg-white/[0.02] p-4 text-sm">
      <div className="font-medium text-slate-200">{title}</div>
      <p className="mt-1 text-slate-400">{description}</p>
    </div>
  );
}

export function LoadingState({
  title = '正在加载',
  description = '正在从后端读取真实数据。'
}: {
  title?: string;
  description?: string;
}) {
  return (
    <Panel aria-busy="true">
      <div className="flex items-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-cyan" />
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

export function InlineLoading({ title }: { title: string }) {
  return (
    <div className="rounded-md border border-line bg-white/[0.03] p-4" aria-busy="true">
      <div className="flex items-center gap-2 text-sm text-slate-300">
        <Loader2 className="h-4 w-4 animate-spin text-cyan" />
        {title}
      </div>
      <div className="mt-3 grid gap-2">
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-10 animate-pulse rounded-md bg-white/[0.06]" />
        ))}
      </div>
    </div>
  );
}

export function ErrorState({
  error,
  title,
  description
}: {
  error: unknown;
  title?: string;
  description?: string;
}) {
  const unauthorized = error instanceof ApiError && error.status === 401;

  return (
    <Panel className="border-red-400/40 bg-red-950/20">
      <h2 className="text-lg font-semibold text-red-100">{title ?? (unauthorized ? '需要登录' : '数据加载失败')}</h2>
      <p className="mt-2 text-sm text-red-100/75">
        {description ?? (unauthorized ? '请先登录后再访问该工作区。' : '当前无法连接到后端服务，页面不会展示演示数据来掩盖错误。')}
      </p>
      {error instanceof ApiError && error.requestId && <p className="mt-2 text-xs text-red-100/55">Request ID: {error.requestId}</p>}
      {unauthorized && (
        <Link href="/login" className="mt-4 inline-flex">
          <Button>去登录</Button>
        </Link>
      )}
    </Panel>
  );
}

export function InlineError({
  title = '请求失败',
  description,
  requestId
}: {
  title?: string;
  description: string;
  requestId?: string;
}) {
  return (
    <div className="rounded-md border border-red-400/40 bg-red-950/20 p-3 text-sm text-red-100">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <div className="font-medium">{title}</div>
          <p className="mt-1 text-red-100/75">{description}</p>
          {requestId && <p className="mt-1 text-xs text-red-100/55">Request ID: {requestId}</p>}
        </div>
      </div>
    </div>
  );
}

export function apiErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) return error.message || fallback;
  return fallback;
}

export function apiErrorRequestId(error: unknown) {
  return error instanceof ApiError ? error.requestId : undefined;
}
