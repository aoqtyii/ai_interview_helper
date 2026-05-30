import { AppShell } from '@/components/layout/app-shell';
import { Panel } from '@/components/ui/panel';
import { StatCard } from '@/components/dashboard/stat-card';
import { EmptyState, ErrorState } from '@/components/ui/state';
import { serverApi } from '@/lib/server-api';
import type { Article, InterviewSession, LearningItem } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  let sessions: InterviewSession[];
  let learning: LearningItem[];
  let articles: Article[];
  try {
    [sessions, learning, articles] = await Promise.all([
      serverApi<InterviewSession[]>('/interviews/sessions'),
      serverApi<LearningItem[]>('/learning/recommendations'),
      serverApi<Article[]>('/intelligence/articles')
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
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="最近面试" value={`${sessions.length}`} hint="可回放并生成评分报告" />
        <StatCard label="补弱任务" value={`${learning.length}`} hint="按目标岗位能力图谱推荐" />
        <StatCard label="前沿资讯" value={`${articles.length}`} hint="RSS/API 聚合与 AI 摘要" />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
        {!sessions.length && !learning.length && !articles.length && (
          <div className="lg:col-span-2">
            <EmptyState title="暂无工作台数据" description="完成一次面试或配置学习内容后，这里会显示真实进展。" />
          </div>
        )}
        <Panel>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">面试能力雷达</h2>
            <span className="rounded-md bg-acid/10 px-2 py-1 text-xs text-acid">Mock Ready</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {['AI 应用深度', '结构化表达', '指标意识', '工程落地'].map((item, index) => (
              <div key={item} className="rounded-md border border-line bg-black/20 p-4">
                <div className="flex justify-between text-sm">
                  <span>{item}</span>
                  <span className="text-cyan">{82 - index * 4}%</span>
                </div>
                <div className="mt-3 h-2 rounded-full bg-white/10">
                  <div className="h-2 rounded-full bg-cyan" style={{ width: `${82 - index * 4}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <h2 className="mb-4 text-lg font-semibold">下一步行动</h2>
          <div className="space-y-3">
            {learning.slice(0, 3).map((item) => (
              <div key={item.id} className="rounded-md border border-line bg-white/[0.03] p-3">
                <div className="text-sm font-medium">{item.title}</div>
                <div className="mt-1 text-xs text-slate-400">{item.estimatedMinutes} 分钟</div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}
