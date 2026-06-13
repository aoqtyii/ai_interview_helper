'use client';

import { useEffect, useState } from 'react';
import { Save, ShieldCheck } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';
import { InlineError, InlineLoading, apiErrorMessage } from '@/components/ui/state';
import { api, ApiError } from '@/lib/api';
import type { AdminSettingGroup, AdminSettingItem, AdminSettingsResponse, CurrentUser } from '@/lib/types';

const ADMIN_PERMISSION_ERROR = '当前账号没有管理员权限。';

export default function AdminSettingsPage() {
  const [groups, setGroups] = useState<AdminSettingGroup[]>([]);
  const [draft, setDraft] = useState<Record<string, string | number | boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const user = await api<CurrentUser>('/auth/me');
        if (user.role !== 'ADMIN') {
          if (!cancelled) setError(ADMIN_PERMISSION_ERROR);
          return;
        }

        const response = await api<AdminSettingsResponse>('/admin/settings');
        if (cancelled) return;
        setGroups(response.groups);
        setDraft(buildDraft(response.groups));
        setError('');
      } catch (nextError) {
        if (!cancelled) setError(formatSettingsError(nextError));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const response = await api<AdminSettingsResponse>('/admin/settings', {
        method: 'PATCH',
        body: JSON.stringify({ settings: buildPayload(groups, draft) })
      });
      setGroups(response.groups);
      setDraft(buildDraft(response.groups));
      setMessage('系统配置已保存，并会在下一次请求时生效。');
    } catch (nextError) {
      setError(formatSettingsError(nextError));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <AppShell>
        <InlineLoading title="正在加载系统配置" />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-5">
        {error === ADMIN_PERMISSION_ERROR ? (
          <Panel className="border-red-400/40 bg-red-950/20">
            <h2 className="text-lg font-semibold text-red-100">403</h2>
            <p className="mt-2 text-sm text-red-100/75">{error}</p>
          </Panel>
        ) : (
          <>
            <Panel>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-cyan" />
                    <h2 className="text-lg font-semibold">系统配置</h2>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    数据库配置优先于 .env。敏感字段只允许写入和脱敏查看，保存后会在下一次后端请求中生效。
                  </p>
                </div>
                <Button onClick={() => void save()} disabled={saving}>
                  <Save className="h-4 w-4" />
                  {saving ? '保存中' : '保存配置'}
                </Button>
              </div>
            </Panel>

            {error && <InlineError title="系统配置请求失败" description={error} />}
            {message && <div className="rounded-md border border-cyan/30 bg-cyan/10 p-3 text-sm text-cyan">{message}</div>}

            <div className="grid gap-5 xl:grid-cols-3">
              {groups.map((group) => (
                <Panel key={group.key}>
                  <h3 className="text-base font-semibold">{group.title}</h3>
                  <div className="mt-4 grid gap-4">
                    {group.settings.map((setting) => (
                      <SettingField
                        key={setting.key}
                        setting={setting}
                        value={draft[setting.key]}
                        onChange={(value) => setDraft((existing) => ({ ...existing, [setting.key]: value }))}
                      />
                    ))}
                  </div>
                </Panel>
              ))}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

function SettingField({ setting, value, onChange }: { setting: AdminSettingItem; value: string | number | boolean | undefined; onChange: (value: string | number | boolean) => void }) {
  return (
    <label className="grid gap-2 rounded-md border border-line bg-white/[0.03] p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-slate-100">{setting.label}</div>
          <div className="mt-1 text-xs leading-5 text-slate-400">{setting.description}</div>
        </div>
        <span className="shrink-0 rounded-md bg-white/5 px-2 py-1 text-xs text-slate-400">{sourceLabel(setting.source)}</span>
      </div>

      {setting.valueType === 'boolean' ? (
        <select className={inputClass()} value={String(Boolean(value))} onChange={(event) => onChange(event.target.value === 'true')}>
          <option value="true">开启</option>
          <option value="false">关闭</option>
        </select>
      ) : setting.valueType === 'number' ? (
        <input
          className={inputClass()}
          type="number"
          min={setting.min}
          max={setting.max}
          value={String(value ?? '')}
          onChange={(event) => onChange(Number.parseInt(event.target.value, 10))}
        />
      ) : setting.valueType === 'secret' ? (
        <div className="grid gap-2">
          <input className={inputClass()} type="password" value={String(value ?? '')} onChange={(event) => onChange(event.target.value)} placeholder="留空则不修改现有密钥" />
          <div className="text-xs text-slate-500">
            当前状态：{setting.configured ? `已配置（${setting.masked ?? '已脱敏'}）` : '未配置'}
          </div>
        </div>
      ) : (
        <input className={inputClass()} value={String(value ?? '')} onChange={(event) => onChange(event.target.value)} />
      )}
    </label>
  );
}

function buildDraft(groups: AdminSettingGroup[]) {
  return Object.fromEntries(groups.flatMap((group) => group.settings.map((setting) => [setting.key, setting.isSecret ? '' : setting.value ?? ''])));
}

function buildPayload(groups: AdminSettingGroup[], draft: Record<string, string | number | boolean>) {
  const settings: Record<string, string | number | boolean> = {};
  for (const setting of groups.flatMap((group) => group.settings)) {
    const value = draft[setting.key];
    if (setting.isSecret && !String(value ?? '').trim()) continue;
    if (value === undefined) continue;
    settings[setting.key] = value;
  }
  return settings;
}

function inputClass() {
  return 'w-full rounded-md border border-line bg-black/30 px-3 py-2 text-sm outline-none focus:border-cyan/60';
}

function sourceLabel(source: AdminSettingItem['source']) {
  if (source === 'database') return '数据库';
  if (source === 'env') return '.env';
  return '默认值';
}

function formatSettingsError(error: unknown) {
  if (error instanceof ApiError && error.status === 401) return '请先登录管理员账号。';
  if (error instanceof ApiError && error.status === 403) return ADMIN_PERMISSION_ERROR;
  return apiErrorMessage(error, '系统配置请求失败，请确认 API 服务和权限配置。');
}
