import { AppShell } from '@/components/layout/app-shell';
import { Panel } from '@/components/ui/panel';
import { EmptyState, ErrorState } from '@/components/ui/state';
import { serverApi } from '@/lib/server-api';
import type { LearningItem, RoleProfile } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function LearningPage() {
  let roles: RoleProfile[];
  let items: LearningItem[];
  try {
    [roles, items] = await Promise.all([
      serverApi<RoleProfile[]>('/role-profiles'),
      serverApi<LearningItem[]>('/learning/recommendations')
    ]);
  } catch (error) {
    return (
      <AppShell>
        <ErrorState error={error} />
      </AppShell>
    );
  }

  return (
    <AppShell>
      {!roles.length && !items.length && <EmptyState title="暂无学习数据" description="管理员配置岗位画像和学习任务后，这里会显示真实推荐。" />}
      <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <Panel>
          <h2 className="text-lg font-semibold">岗位能力图谱</h2>
          <div className="mt-4 space-y-4">
            {roles.map((role) => (
              <div key={role.id} className="rounded-md border border-line bg-black/20 p-4">
                <div className="font-medium text-cyan">{role.name}</div>
                <div className="mt-1 text-sm text-slate-400">{role.description}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(role.skills ?? []).slice(0, 5).map((skill) => (
                    <span key={skill.id} className="rounded-md bg-white/5 px-2 py-1 text-xs text-slate-300">
                      {skill.name}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <h2 className="text-lg font-semibold">补弱任务</h2>
          <div className="mt-4 grid gap-3">
            {items.map((item) => (
              <div key={item.id} className="rounded-md border border-line bg-white/[0.03] p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-medium">{item.title}</div>
                    <div className="mt-1 text-sm text-slate-400">{item.description ?? item.skill?.name}</div>
                  </div>
                  <span className="shrink-0 rounded-md bg-violet/10 px-2 py-1 text-xs text-violet">{item.estimatedMinutes} min</span>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}
