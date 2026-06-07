'use client';

import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';
import { EmptyState, InlineEmpty, InlineError, InlineLoading, apiErrorMessage } from '@/components/ui/state';
import { api } from '@/lib/api';
import type { LearningItem, LearningProgress, RoleProfile } from '@/lib/types';

type ProgressStatus = LearningProgress['status'];

const progressOptions: Array<{ value: ProgressStatus; label: string }> = [
  { value: 'TODO', label: '未开始' },
  { value: 'IN_PROGRESS', label: '进行中' },
  { value: 'DONE', label: '已完成' }
];

export default function LearningPage() {
  const [roles, setRoles] = useState<RoleProfile[]>([]);
  const [items, setItems] = useState<LearningItem[]>([]);
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

  async function updateProgress(itemId: string, status: ProgressStatus) {
    setUpdatingId(itemId);
    setError('');
    try {
      const progress = await api<LearningProgress>('/learning/progress', {
        method: 'POST',
        body: JSON.stringify({ learningItemId: itemId, status })
      });
      setItems((existing) => existing.map((item) => (item.id === itemId ? { ...item, progress: [progress] } : item)));
    } catch (nextError) {
      setError(apiErrorMessage(nextError, '学习进度更新失败，请稍后重试。'));
    } finally {
      setUpdatingId('');
    }
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
            </div>
          </Panel>

          <Panel>
            <h2 className="text-lg font-semibold">学习资源</h2>
            <div className="mt-4 grid gap-3">
              {!items.length && <InlineEmpty title="暂无学习资源" description="管理员创建资源后，这里会按岗位、技能和标签展示。" />}
              {items.map((item) => (
                <div key={item.id} className="rounded-md border border-line bg-white/[0.03] p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{item.title}</span>
                        <span className="rounded-md bg-violet/10 px-2 py-1 text-xs text-violet">{learningTypeLabel(item.type)}</span>
                      </div>
                      <div className="mt-1 text-sm leading-6 text-slate-400">{item.description ?? item.skill?.name}</div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-400">
                        {item.roleProfile?.name && <span className="rounded-md border border-line px-2 py-1">{item.roleProfile.name}</span>}
                        {item.skill?.name && <span className="rounded-md border border-line px-2 py-1">{item.skill.name}</span>}
                        {(item.tags ?? []).map((tag) => (
                          <span key={tag} className="rounded-md bg-white/5 px-2 py-1">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                    <span className="shrink-0 rounded-md bg-cyan/10 px-2 py-1 text-xs text-cyan">{item.estimatedMinutes} 分钟</span>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap gap-2">
                      {progressOptions.map((option) => (
                        <Button
                          key={option.value}
                          variant={currentProgress(item) === option.value ? 'primary' : 'ghost'}
                          className="h-8 px-3"
                          onClick={() => void updateProgress(item.id, option.value)}
                          disabled={updatingId === item.id}
                        >
                          {option.label}
                        </Button>
                      ))}
                    </div>
                    {item.contentUrl && (
                      <a href={item.contentUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-cyan hover:text-acid">
                        打开资源
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}
    </AppShell>
  );
}

function currentProgress(item: LearningItem): ProgressStatus {
  return item.progress?.[0]?.status ?? 'TODO';
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
