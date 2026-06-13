'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, Save } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';
import { EmptyState, InlineEmpty, InlineError, InlineLoading, apiErrorMessage } from '@/components/ui/state';
import { api } from '@/lib/api';
import type { LearningItem, LearningProgress, RoleProfile } from '@/lib/types';

type ProgressStatus = LearningProgress['status'];
type ProgressDraft = {
  note: string;
  reflection: string;
};

const progressOptions: Array<{ value: ProgressStatus; label: string }> = [
  { value: 'TODO', label: '未开始' },
  { value: 'IN_PROGRESS', label: '进行中' },
  { value: 'DONE', label: '已完成' }
];

export default function LearningPage() {
  const [roles, setRoles] = useState<RoleProfile[]>([]);
  const [items, setItems] = useState<LearningItem[]>([]);
  const [drafts, setDrafts] = useState<Record<string, ProgressDraft>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatingId, setUpdatingId] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [nextRoles, nextItems] = await Promise.all([api<RoleProfile[]>('/role-profiles'), api<LearningItem[]>('/learning/items')]);
        if (cancelled) return;
        setRoles(nextRoles);
        setItems(nextItems);
        setDrafts(buildDrafts(nextItems));
        setError('');
      } catch (nextError) {
        if (!cancelled) setError(apiErrorMessage(nextError, '学习资源加载失败，请确认后端服务和登录状态。'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  async function updateProgress(item: LearningItem, status: ProgressStatus) {
    const draft = draftFor(item);
    setUpdatingId(item.id);
    setError('');
    try {
      const progress = await api<LearningProgress>('/learning/progress', {
        method: 'POST',
        body: JSON.stringify({
          learningItemId: item.id,
          status,
          note: draft.note,
          reflection: draft.reflection
        })
      });
      setItems((existing) => existing.map((entry) => (entry.id === item.id ? { ...entry, progress: [progress] } : entry)));
      setDrafts((existing) => ({ ...existing, [item.id]: { note: progress.note ?? '', reflection: progress.reflection ?? '' } }));
    } catch (nextError) {
      setError(apiErrorMessage(nextError, '学习进度更新失败，请稍后重试。'));
    } finally {
      setUpdatingId('');
    }
  }

  function setDraft(item: LearningItem, patch: Partial<ProgressDraft>) {
    const current = draftFor(item);
    setDrafts((existing) => ({
      ...existing,
      [item.id]: { ...current, ...patch }
    }));
  }

  function draftFor(item: LearningItem): ProgressDraft {
    return drafts[item.id] ?? {
      note: item.progress?.[0]?.note ?? '',
      reflection: item.progress?.[0]?.reflection ?? ''
    };
  }

  return (
    <AppShell>
      {loading ? (
        <InlineLoading title="正在加载学习资源" />
      ) : error ? (
        <InlineError title="学习资源加载失败" description={error} />
      ) : !roles.length && !items.length ? (
        <EmptyState title="暂无学习数据" description="管理员配置岗位画像和学习资源后，这里会显示真实学习内容。" />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
          <Panel>
            <h2 className="text-lg font-semibold">岗位能力图谱</h2>
            <div className="mt-4 space-y-4">
              {roles.map((role) => (
                <div key={role.id} className="rounded-md border border-line bg-black/20 p-4">
                  <div className="font-medium text-cyan">{role.name}</div>
                  <div className="mt-1 text-sm text-slate-400">{role.description}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(role.skills ?? []).slice(0, 6).map((skill) => (
                      <span key={skill.id} className="rounded-md bg-white/5 px-2 py-1 text-xs text-slate-300">
                        {skill.name}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              {!roles.length && <InlineEmpty title="暂无岗位画像" description="管理员配置岗位后，这里会展示能力图谱。" />}
            </div>
          </Panel>

          <Panel>
            <h2 className="text-lg font-semibold">学习资源</h2>
            <div className="mt-4 grid gap-3">
              {!items.length && <InlineEmpty title="暂无学习资源" description="管理员创建资源后，这里会按岗位、技能和标签展示。" />}
              {items.map((item) => {
                const progress = item.progress?.[0];
                const draft = draftFor(item);
                return (
                  <div key={item.id} className="rounded-md border border-line bg-white/[0.03] p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{item.title}</span>
                          <span className="rounded-md bg-violet/10 px-2 py-1 text-xs text-violet">{learningTypeLabel(item.type)}</span>
                          {item.recommendedPlanItems?.length ? <span className="rounded-md bg-cyan/10 px-2 py-1 text-xs text-cyan">来自面试报告推荐</span> : null}
                        </div>
                        <div className="mt-1 text-sm leading-6 text-slate-400">{item.description ?? item.skill?.name}</div>
                        {recommendationReason(item) && <div className="mt-2 text-xs leading-5 text-cyan">{recommendationReason(item)}</div>}
                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-400">
                          {item.roleProfile?.name && <span className="rounded-md border border-line px-2 py-1">{item.roleProfile.name}</span>}
                          {item.skill?.name && <span className="rounded-md border border-line px-2 py-1">{item.skill.name}</span>}
                          {item.difficulty && <span className="rounded-md border border-line px-2 py-1">{difficultyLabel(item.difficulty)}</span>}
                          {(item.tags ?? []).map((tag) => (
                            <span key={tag} className="rounded-md bg-white/5 px-2 py-1">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                      <span className="shrink-0 rounded-md bg-cyan/10 px-2 py-1 text-xs text-cyan">{item.estimatedMinutes} 分钟</span>
                    </div>

                    <div className="mt-4 grid gap-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap gap-2">
                          {progressOptions.map((option) => (
                            <Button
                              key={option.value}
                              variant={currentProgress(item) === option.value ? 'primary' : 'ghost'}
                              className="h-8 px-3"
                              onClick={() => void updateProgress(item, option.value)}
                              disabled={updatingId === item.id}
                            >
                              {option.label}
                            </Button>
                          ))}
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                          {progress?.completedAt && <span className="text-xs text-slate-500">完成于 {formatDate(progress.completedAt)}</span>}
                          {item.contentUrl && (
                            <a href={item.contentUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-cyan hover:text-acid">
                              打开资源
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          )}
                        </div>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        <label className="grid gap-1">
                          <span className="text-xs text-slate-500">学习备注</span>
                          <textarea
                            className="min-h-20 rounded-md border border-line bg-black/30 p-3 text-sm outline-none focus:border-cyan/60"
                            value={draft.note}
                            onChange={(event) => setDraft(item, { note: event.target.value })}
                            placeholder="记录你准备如何学习、卡在哪里。"
                          />
                        </label>
                        <label className="grid gap-1">
                          <span className="text-xs text-slate-500">完成复盘</span>
                          <textarea
                            className="min-h-20 rounded-md border border-line bg-black/30 p-3 text-sm outline-none focus:border-cyan/60"
                            value={draft.reflection}
                            onChange={(event) => setDraft(item, { reflection: event.target.value })}
                            placeholder="完成后记录收获、仍需追问的问题。"
                          />
                        </label>
                      </div>

                      <div className="flex justify-end">
                        <Button variant="ghost" className="h-8 px-3" onClick={() => void updateProgress(item, currentProgress(item))} disabled={updatingId === item.id}>
                          <Save className="h-4 w-4" />
                          保存备注
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>
        </div>
      )}
    </AppShell>
  );
}

function buildDrafts(items: LearningItem[]) {
  return Object.fromEntries(
    items.map((item) => [
      item.id,
      {
        note: item.progress?.[0]?.note ?? '',
        reflection: item.progress?.[0]?.reflection ?? ''
      }
    ])
  );
}

function currentProgress(item: LearningItem): ProgressStatus {
  return item.progress?.[0]?.status ?? 'TODO';
}

function recommendationReason(item: LearningItem) {
  return item.recommendedPlanItems?.[0]?.reason;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function difficultyLabel(value: LearningItem['difficulty']) {
  if (value === 'JUNIOR') return '初级';
  if (value === 'MID') return '中级';
  if (value === 'SENIOR') return '高级';
  return '未分级';
}

function learningTypeLabel(type: LearningItem['type']) {
  if (type === 'ARTICLE') return '文章';
  if (type === 'DOCUMENT') return '文档';
  if (type === 'TASK') return '任务';
  if (type === 'PROJECT') return '项目练习';
  if (type === 'VIDEO') return '视频';
  if (type === 'INTERVIEW_REVIEW') return '面试复盘';
  return '练习';
}
