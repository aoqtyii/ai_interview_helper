import { AppShell } from '@/components/layout/app-shell';
import { LoadingState } from '@/components/ui/state';

export default function IntelligenceLoading() {
  return (
    <AppShell>
      <LoadingState title="正在加载前沿情报" description="正在读取已聚合的 RSS/API 资讯摘要。" />
    </AppShell>
  );
}
