import Link from 'next/link';
import { AppShell } from '@/components/layout/app-shell';
import { Panel } from '@/components/ui/panel';
import { StatCard } from '@/components/dashboard/stat-card';
import { EmptyState, ErrorState } from '@/components/ui/state';
import { serverApi } from '@/lib/server-api';
import type { Article, InterviewSession, LearningItem } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  let sessions: InterviewSession[];
  let pendingLearning: LearningItem[];
  let articles: Article[];
  try {
    [sessions, pendingLearning, articles] = await Promise.all([
      serverApi<InterviewSession[]>('/interviews/sessions'),
      serverApi<LearningItem[]>('/learning/pending'),
      serverApi<Article[]>('/intelligence/articles')
    ]);
  } catch (error) {
    return (
      <AppShell>
        <ErrorState error={error} />
      </AppShell>
    );
  }

  const weaknesses = latestWeaknesses(sessions);

  return (
    <AppShell>
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="最近面试" value={`${sessions.length}`} hint="可回放并生成评分报告" />
        <StatCard label="待完成补弱" value={`${pendingLearning.length}`} hint="来自最近报告和学习资源" />
        <StatCard label="前沿资讯" value={`${articles.length}`} hint="RSS/API 聚合与 AI 摘要" />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
        {!sessions.length && !pendingLearning.length && !articles.length && (
          <div className="lg:col-span-2">
            <EmptyState title="暂无工作台数据" description="完成一次面试、配置学习资源或抓取资讯后，这里会显示真实进展。" />
          </div>
        )}

        <Panel>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">面试能力雷达</h2>
            <span className="rounded-md bg-acid/10 px-2 py-1 text-xs text-acid">报告驱动</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {latestDimensions(sessions).map((item) => (
              <div key={item.name} className="rounded-md border border-line bg-black/20 p-4">
                <div className="flex justify-between gap-3 text-sm">
                  <span>{item.name}</span>
                  <span className="text-cyan">{item.score}%</span>
                </div>
                <div className="mt-3 h-2 rounded-full bg-white/10">
                  <div className="h-2 rounded-full bg-cyan" style={{ width: `${item.score}%` }} />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5">
            <h3 className="text-sm font-semibold text-slate-300">最近报告主要短板</h3>
            <div className="mt-3 grid gap-2">
              {weaknesses.length ? (
                weaknesses.map((item, index) => (
                  <div key={`${item}-${index}`} className="rounded-md border border-line bg-white/[0.03] p-3 text-sm text-slate-300">
                    {item}
                  </div>
                ))
              ) : (
                <div className="rounded-md border border-dashed border-line bg-white/[0.02] p-4 text-sm text-slate-400">
                  完成一次面试评分后，这里会展示最近报告的主要短板。
                </div>
              )}
            </div>
          </div>
        </Panel>

        <Panel>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">下一步行动</h2>
            <Link href="/learning" className="text-sm text-cyan hover:text-acid">
              查看全部
            </Link>
          </div>
          <div className="space-y-3">
            {pendingLearning.length ? (
              pendingLearning.slice(0, 4).map((item) => (
                <div key={item.id} className="rounded-md border border-line bg-white/[0.03] p-3">
                  <div className="text-sm font-medium">{item.title}</div>
                  <div className="mt-1 text-xs text-slate-400">
                    {item.estimatedMinutes} 分钟{item.roleProfile?.name ? ` / ${item.roleProfile.name}` : ''}
                  </div>
                  {item.recommendedPlanItems?.length ? (
                    <div className="mt-2 text-xs leading-5 text-cyan">{item.recommendedPlanItems[0]?.reason ?? '来自最近面试报告推荐'}</div>
                  ) : null}
                </div>
              ))
            ) : (
              <div className="rounded-md border border-dashed border-line bg-white/[0.02] p-4 text-sm text-slate-400">
                暂无待完成补弱任务。
              </div>
            )}
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}

function latestDimensions(sessions: InterviewSession[]) {
  const report = sessions.find((session) => session.report)?.report;
  const rows = report?.dimensionScoreRows ?? [];
  if (rows.length) {
    return rows.slice(0, 4).map((row) => ({ name: row.dimensionName, score: Math.max(0, Math.min(100, row.score)) }));
  }

  return [
    { name: 'AI / LLM 基础理解', score: 0 },
    { name: 'Agent / RAG 技术深度', score: 0 },
    { name: '系统架构与工程实现', score: 0 },
    { name: '评估指标与风险控制', score: 0 }
  ];
}

function latestWeaknesses(sessions: InterviewSession[]) {
  const report = sessions.find((session) => session.report)?.report;
  return (report?.findings ?? []).filter((item) => item.type === 'WEAKNESS').slice(0, 3).map((item) => item.content);
}
