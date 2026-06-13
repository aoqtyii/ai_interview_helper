import { describe, expect, it, vi } from 'vitest';
import { SettingsService } from './settings.service';

describe('SettingsService', () => {
  it('uses database values before environment values and defaults', async () => {
    const restore = withEnv({ AI_DEFAULT_MODEL: 'env-model' });
    const prisma = {
      systemSetting: {
        findMany: vi.fn().mockResolvedValue([{ key: 'AI_DEFAULT_MODEL', value: 'db-model', valueType: 'string', isSecret: false }])
      }
    };
    const service = new SettingsService(prisma as never);

    await expect(service.aiConfig()).resolves.toMatchObject({
      defaultModel: 'db-model'
    });

    restore();
  });

  it('encrypts stored secrets and only exposes masked values to admins', async () => {
    const restore = withEnv({ APP_ENCRYPTION_KEY: 'test-settings-key' });
    const stored = new Map<string, { key: string; value: string; valueType: string; isSecret: boolean; description: string; updatedBy: string }>();
    const prisma = {
      systemSetting: {
        findMany: vi.fn().mockImplementation(() => Promise.resolve(Array.from(stored.values()))),
        upsert: vi.fn().mockImplementation((input) => {
          const next = stored.has(input.where.key) ? { ...stored.get(input.where.key), ...input.update } : input.create;
          stored.set(input.where.key, next);
          return Promise.resolve(next);
        })
      }
    };
    const service = new SettingsService(prisma as never);

    await service.updateSettings('admin-1', { AI_API_KEY: 'sk-test-secret-value' });

    const storedSecret = stored.get('AI_API_KEY')?.value;
    expect(storedSecret).toBeDefined();
    expect(storedSecret).not.toBe('sk-test-secret-value');
    expect(storedSecret).toMatch(/^v1:/);
    await expect(service.aiConfig()).resolves.toMatchObject({ apiKey: 'sk-test-secret-value' });

    const adminSettings = await service.adminSettings();
    const aiGroup = adminSettings.groups.find((group) => group.key === 'ai');
    const apiKeySetting = aiGroup?.settings.find((setting) => setting.key === 'AI_API_KEY');
    expect(apiKeySetting).toMatchObject({
      configured: true,
      isSecret: true,
      masked: 'sk-****alue',
      source: 'database'
    });
    expect(apiKeySetting?.value).toBeUndefined();

    restore();
  });

  it('rejects invalid numeric values instead of silently clamping them', async () => {
    const prisma = {
      systemSetting: {
        findMany: vi.fn().mockResolvedValue([]),
        upsert: vi.fn()
      }
    };
    const service = new SettingsService(prisma as never);

    await expect(service.updateSettings('admin-1', { INTERVIEW_MAX_TURNS: 0 })).rejects.toThrow('INTERVIEW_MAX_TURNS must be >= 1');
    expect(prisma.systemSetting.upsert).not.toHaveBeenCalled();
  });
});

function withEnv(values: Record<string, string | undefined>) {
  const originals = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  return () => {
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}
