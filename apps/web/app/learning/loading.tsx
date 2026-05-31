import { AppShell } from '@/components/layout/app-shell';
import { LoadingState } from '@/components/ui/state';

export default function LearningLoading() {
  return (
    <AppShell>
      <LoadingState title="正在加载学习数据" description="正在读取岗位画像、能力图谱和补弱任务。" />
    </AppShell>
  );
}
