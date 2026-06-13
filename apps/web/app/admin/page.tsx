'use client';

import { useEffect, useMemo, useState } from 'react';
import { DatabaseZap, Edit3, Play, Save } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';
import { InlineEmpty, InlineError, InlineLoading, apiErrorMessage } from '@/components/ui/state';
import { api, ApiError } from '@/lib/api';
import type { AiRunLog, CurrentUser, Difficulty, LearningItem, RoleProfile } from '@/lib/types';

const ADMIN_PERMISSION_ERROR = '当前账号没有管理员权限。';
const dimensionOptions = [
  { key: 'ai_llm_foundation', label: 'AI / LLM 基础理解' },
  { key: 'agent_rag_tooling_depth', label: 'Agent / RAG / 工具调用技术深度' },
  { key: 'system_architecture_engineering', label: '系统架构与工程实现能力' },
  { key: 'application_solution_design', label: '应用方案设计能力' },
  { key: 'business_product_decomposition', label: '业务 / 产品拆解能力' },
  { key: 'evaluation_metrics_risk', label: '评估、指标与风险控制' },
  { key: 'structured_communication', label: '表达结构与沟通能力' }
];

type LearningForm = {
  id?: string;
  title: string;
  description: string;
  type: 'ARTICLE' | 'DOCUMENT' | 'TASK' | 'PROJECT';
  contentUrl: string;
  roleProfileId: string;
  skillId: string;
  difficulty: Difficulty;
  estimatedMinutes: string;
  tags: string;
  dimensionKeys: string;
  status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED';
};

const emptyForm: LearningForm = {
  title: '',
  description: '',
  type: 'ARTICLE',
  contentUrl: '',
  roleProfileId: '',
  skillId: '',
  difficulty: 'MID',
  estimatedMinutes: '30',
  tags: '',
  dimensionKeys: '',
  status: 'ACTIVE'
};

export default function AdminPage() {
  const [logs, setLogs] = useState<AiRunLog[]>([]);
  const [roles, setRoles] = useState<RoleProfile[]>([]);
  const [learningItems, setLearningItems] = useState<LearningItem[]>([]);
  const [form, setForm] = useState<LearningForm>(emptyForm);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadAdminData() {
      try {
        const user = await api<CurrentUser>('/auth/me');
        if (user.role !== 'ADMIN') {
          if (!cancelled) setError(ADMIN_PERMISSION_ERROR);
          return;
        }

        const [nextLogs, nextRoles, nextLearningItems] = await Promise.all([
          api<AiRunLog[]>('/admin/ai-run-logs'),
          api<RoleProfile[]>('/role-profiles'),
          api<LearningItem[]>('/admin/learning-items')
        ]);
        if (cancelled) return;
        setLogs(nextLogs);
        setRoles(nextRoles);
        setLearningItems(nextLearningItems);
        setError('');
      } catch (nextError) {
        if (!cancelled) setError(formatAdminError(nextError));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadAdminData();

    return () => {
      cancelled = true;
    };
  }, []);

  const skills = useMemo(() => {
    const selectedRole = roles.find((role) => role.id === form.roleProfileId);
    return selectedRole?.skills ?? roles.flatMap((role) => role.skills ?? []);
  }, [form.roleProfileId, roles]);

  async function runIngestion() {
    setRunning(true);
    setMessage('抓取任务执行中...');
    setError('');
    const result = await api('/admin/ingestion/run', { method: 'POST' }).catch((nextError) => {
      setError(formatAdminError(nextError));
      return null;
    });
    setMessage(result ? '抓取任务已完成。' : '');
    setRunning(false);
  }

  async function saveLearningItem() {
    const validationError = validateLearningForm(form);
    if (validationError) {
      setError(validationError);
      setMessage('');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');
    try {
      const body = buildLearningPayload(form);
      const saved = await api<LearningItem>(form.id ? `/admin/learning-items/${form.id}` : '/admin/learning-items', {
        method: form.id ? 'PATCH' : 'POST',
        body: JSON.stringify(body)
      });
      setLearningItems((existing) => [saved, ...existing.filter((item) => item.id !== saved.id)]);
      setForm(emptyForm);
      setMessage(form.id ? '学习资源已更新。' : '学习资源已创建。');
    } catch (nextError) {
      setError(formatAdminError(nextError));
    } finally {
      setSaving(false);
    }
  }

  function editLearningItem(item: LearningItem) {
    setForm({
      id: item.id,
      title: item.title,
      description: item.description ?? '',
      type: item.type === 'DOCUMENT' || item.type === 'TASK' || item.type === 'PROJECT' ? item.type : 'ARTICLE',
      contentUrl: item.contentUrl ?? '',
      roleProfileId: item.roleProfile?.id ?? '',
      skillId: item.skill?.id ?? '',
      difficulty: item.difficulty ?? 'MID',
      estimatedMinutes: `${item.estimatedMinutes}`,
      tags: (item.tags ?? []).join(', '),
      dimensionKeys: (item.dimensionKeys ?? []).join(', '),
      status: item.status ?? 'ACTIVE'
    });
    setMessage('');
    setError('');
  }

  return (
    <AppShell>
      {error === ADMIN_PERMISSION_ERROR ? (
        <Panel className="border-red-400/40 bg-red-950/20">
          <h2 className="text-lg font-semibold text-red-100">403</h2>
          <p className="mt-2 text-sm text-red-100/75">{error}</p>
        </Panel>
      ) : loading ? (
        <InlineLoading title="正在加载管理数据" />
      ) : (
        <div className="space-y-5">
          {error && <InlineError title="管理 API 请求失败" description={error} />}
          {message && <div className="rounded-md border border-cyan/30 bg-cyan/10 p-3 text-sm text-cyan">{message}</div>}

          <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
            <Panel>
              <h2 className="text-lg font-semibold">{form.id ? '编辑学习资源' : '创建学习资源'}</h2>
              <div className="mt-4 grid gap-3">
                <input className={inputClass()} value={form.title} onChange={(event) => setFormValue('title', event.target.value)} placeholder="标题" />
                <textarea className={`${inputClass()} min-h-24`} value={form.description} onChange={(event) => setFormValue('description', event.target.value)} placeholder="描述" />
                <div className="grid gap-3 md:grid-cols-2">
                  <select className={inputClass()} value={form.type} onChange={(event) => setFormValue('type', event.target.value as LearningForm['type'])}>
                    <option value="ARTICLE">文章</option>
                    <option value="DOCUMENT">文档</option>
                    <option value="TASK">任务</option>
                    <option value="PROJECT">项目练习</option>
                  </select>
                  <select className={inputClass()} value={form.difficulty} onChange={(event) => setFormValue('difficulty', event.target.value as Difficulty)}>
                    <option value="JUNIOR">初级</option>
                    <option value="MID">中级</option>
                    <option value="SENIOR">高级</option>
                  </select>
                </div>
                <input className={inputClass()} value={form.contentUrl} onChange={(event) => setFormValue('contentUrl', event.target.value)} placeholder="资源 URL，可留空" />
                <div className="grid gap-3 md:grid-cols-2">
                  <select className={inputClass()} value={form.roleProfileId} onChange={(event) => setForm({ ...form, roleProfileId: event.target.value, skillId: '' })}>
                    <option value="">不绑定岗位</option>
                    {roles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                  <select className={inputClass()} value={form.skillId} onChange={(event) => setFormValue('skillId', event.target.value)}>
                    <option value="">不绑定技能</option>
                    {skills.map((skill) => (
                      <option key={skill.id} value={skill.id}>
                        {skill.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <input className={inputClass()} value={form.estimatedMinutes} onChange={(event) => setFormValue('estimatedMinutes', event.target.value)} placeholder="预计分钟数" />
                  <select className={inputClass()} value={form.status} onChange={(event) => setFormValue('status', event.target.value as LearningForm['status'])}>
                    <option value="ACTIVE">上架</option>
                    <option value="DRAFT">草稿</option>
                    <option value="ARCHIVED">归档</option>
                  </select>
                </div>
                <input className={inputClass()} value={form.tags} onChange={(event) => setFormValue('tags', event.target.value)} placeholder="标签，用逗号分隔" />
                <select className={inputClass()} value={form.dimensionKeys} onChange={(event) => setFormValue('dimensionKeys', event.target.value)}>
                  <option value="">不绑定评分维度</option>
                  {dimensionOptions.map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mt-5 flex gap-2">
                <Button onClick={() => void saveLearningItem()} disabled={saving || !form.title.trim() || !form.description.trim()}>
                  <Save className="h-4 w-4" />
                  {saving ? '保存中' : form.id ? '保存修改' : '创建资源'}
                </Button>
                {form.id && (
                  <Button variant="ghost" onClick={() => setForm(emptyForm)}>
                    取消编辑
                  </Button>
                )}
              </div>
            </Panel>

            <Panel>
              <h2 className="text-lg font-semibold">学习资源库</h2>
              <div className="mt-4 grid gap-3">
                {!learningItems.length && <InlineEmpty title="暂无学习资源" description="创建后会显示在用户学习页和面试报告推荐中。" />}
                {learningItems.map((item) => (
                  <div key={item.id} className="rounded-md border border-line bg-white/[0.03] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium">{item.title}</div>
                        <div className="mt-1 text-xs text-slate-400">
                          {learningTypeLabel(item.type)} / {statusLabel(item.status)} / {item.estimatedMinutes} 分钟
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-400">
                          {item.roleProfile?.name && <span className="rounded-md border border-line px-2 py-1">{item.roleProfile.name}</span>}
                          {item.skill?.name && <span className="rounded-md border border-line px-2 py-1">{item.skill.name}</span>}
                          {(item.dimensionKeys ?? []).map((dimensionKey) => (
                            <span key={dimensionKey} className="rounded-md bg-cyan/10 px-2 py-1 text-cyan">
                              {dimensionLabel(dimensionKey)}
                            </span>
                          ))}
                          {(item.tags ?? []).map((tag) => (
                            <span key={tag} className="rounded-md bg-white/5 px-2 py-1">
                              {tag}
                            </span>
                          ))}
                        </div>
                        <div className="mt-2 text-sm leading-6 text-slate-400">{item.description}</div>
                      </div>
                      <Button variant="ghost" className="h-8 px-3" onClick={() => editLearningItem(item)}>
                        <Edit3 className="h-4 w-4" />
                        编辑
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          </div>

          <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
            <Panel>
              <h2 className="text-lg font-semibold">运营控制台</h2>
              <div className="mt-4 space-y-3 text-sm text-slate-300">
                <div className="rounded-md border border-line bg-black/20 p-4">课程资源首版由管理员手动维护，后续可接入自动抓取和资源处理任务。</div>
                <div className="rounded-md border border-line bg-black/20 p-4">所有 AI 调用会记录 provider、model、状态和耗时。</div>
              </div>
              <Button className="mt-5 w-full" onClick={() => void runIngestion()} disabled={running || loading}>
                <Play className="h-4 w-4" />
                {running ? '执行中' : '触发资讯抓取'}
              </Button>
            </Panel>

            <Panel>
              <div className="mb-4 flex items-center gap-2">
                <DatabaseZap className="h-5 w-5 text-cyan" />
                <h2 className="text-lg font-semibold">AI 调用日志</h2>
              </div>
              {!logs.length ? (
                <InlineEmpty title="暂无 AI 调用日志" description="产生真实 AI 调用后，这里会显示 provider、model、状态和耗时。" />
              ) : (
                <div className="overflow-hidden rounded-md border border-line">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-white/5 text-slate-400">
                      <tr>
                        <th className="px-3 py-2">任务</th>
                        <th className="px-3 py-2">模型</th>
                        <th className="px-3 py-2">状态</th>
                        <th className="px-3 py-2">耗时</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((log) => (
                        <tr key={log.id} className="border-t border-line">
                          <td className="px-3 py-2">{log.taskType}</td>
                          <td className="px-3 py-2">{log.model}</td>
                          <td className="px-3 py-2 text-cyan">{log.status}</td>
                          <td className="px-3 py-2">{log.latencyMs} ms</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </div>
        </div>
      )}
    </AppShell>
  );

  function setFormValue<K extends keyof LearningForm>(key: K, value: LearningForm[K]) {
    setForm((existing) => ({ ...existing, [key]: value }));
  }
}

function buildLearningPayload(form: LearningForm) {
  return {
    title: form.title,
    description: form.description,
    type: form.type,
    contentUrl: form.contentUrl.trim() || null,
    roleProfileId: form.roleProfileId || null,
    skillId: form.skillId || null,
    difficulty: form.difficulty,
    estimatedMinutes: Number.parseInt(form.estimatedMinutes, 10),
    tags: splitList(form.tags),
    dimensionKeys: splitList(form.dimensionKeys),
    status: form.status
  };
}

function validateLearningForm(form: LearningForm) {
  if (!form.title.trim()) return '请填写学习资源标题。';
  if (!form.description.trim()) return '请填写学习资源描述。';
  const estimatedMinutes = Number.parseInt(form.estimatedMinutes, 10);
  if (!Number.isInteger(estimatedMinutes) || estimatedMinutes < 1 || estimatedMinutes > 2000) return '预计学习时间必须是 1 到 2000 之间的整数。';
  return '';
}

function splitList(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function inputClass() {
  return 'w-full rounded-md border border-line bg-black/30 px-3 py-2 text-sm outline-none focus:border-cyan/60';
}

function formatAdminError(error: unknown) {
  if (error instanceof ApiError && error.status === 401) return '请先登录管理员账号。';
  if (error instanceof ApiError && error.status === 403) return ADMIN_PERMISSION_ERROR;
  if (error instanceof ApiError) return `管理 API 请求失败：${error.message}`;
  return apiErrorMessage(error, '管理接口请求失败，请确认 API 服务和权限配置。');
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

function statusLabel(status?: LearningItem['status']) {
  if (status === 'ACTIVE') return '上架';
  if (status === 'DRAFT') return '草稿';
  if (status === 'ARCHIVED') return '归档';
  return '未知';
}

function dimensionLabel(value: string) {
  return dimensionOptions.find((item) => item.key === value)?.label ?? value;
}
