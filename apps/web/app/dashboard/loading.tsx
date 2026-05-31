import { AppShell } from '@/components/layout/app-shell';
import { LoadingState } from '@/components/ui/state';

export default function DashboardLoading() {
  return (
    <AppShell>
      <LoadingState title="正在加载工作台" description="正在读取最近面试、补弱任务和前沿资讯。" />
    </AppShell>
  );
}
