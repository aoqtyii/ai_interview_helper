import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { SETTING_DEFINITION_BY_KEY, SETTING_DEFINITIONS, SettingDefinition } from './settings.definitions';

type StoredSetting = {
  key: string;
  value: string;
  valueType: string;
  isSecret: boolean;
};

type ResolvedSetting = {
  value: string | number | boolean;
  source: 'database' | 'env' | 'default';
  configured: boolean;
  masked?: string;
};

type ResolvedSettings = Record<string, ResolvedSetting>;

@Injectable()
export class SettingsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async adminSettings() {
    const resolved = await this.resolveAll();
    return {
      groups: [
        { key: 'ai', title: 'AI 配置', settings: this.groupSettings(resolved, 'ai') },
        { key: 'interview', title: '面试配置', settings: this.groupSettings(resolved, 'interview') },
        { key: 'learning', title: '学习配置', settings: this.groupSettings(resolved, 'learning') }
      ]
    };
  }

  async updateSettings(userId: string, input: Record<string, unknown>) {
    const entries = Object.entries(input);
    if (!entries.length) return this.adminSettings();

    for (const [key, rawValue] of entries) {
      const definition = SETTING_DEFINITION_BY_KEY.get(key);
      if (!definition) throw new BadRequestException(`Unknown setting: ${key}`);
      if (definition.isSecret && (rawValue === undefined || rawValue === '')) continue;
      const value = this.normalizeValue(definition, rawValue);
      const storedValue = definition.isSecret ? this.encryptSecret(String(value)) : String(value);

      await this.prisma.systemSetting.upsert({
        where: { key },
        create: {
          key,
          value: storedValue,
          valueType: definition.valueType,
          isSecret: Boolean(definition.isSecret),
          description: definition.description,
          updatedBy: userId
        },
        update: {
          value: storedValue,
          valueType: definition.valueType,
          isSecret: Boolean(definition.isSecret),
          description: definition.description,
          updatedBy: userId
        }
      });
    }

    return this.adminSettings();
  }

  async aiConfig() {
    const resolved = await this.resolveAll();
    return {
      mockMode: Boolean(this.required(resolved, 'AI_MOCK_MODE').value),
      provider: String(this.required(resolved, 'AI_PROVIDER').value),
      baseUrl: String(this.required(resolved, 'AI_BASE_URL').value),
      apiKey: String(this.required(resolved, 'AI_API_KEY').value ?? ''),
      defaultModel: String(this.required(resolved, 'AI_DEFAULT_MODEL').value)
    };
  }

  async interviewConfig() {
    const resolved = await this.resolveAll();
    return {
      maxTurns: Number(this.required(resolved, 'INTERVIEW_MAX_TURNS').value),
      minAnswersForReport: Number(this.required(resolved, 'INTERVIEW_MIN_ANSWERS_FOR_REPORT').value),
      defaultTopic: String(this.required(resolved, 'INTERVIEW_DEFAULT_TOPIC').value),
      focusedPracticeEnabled: Boolean(this.required(resolved, 'FOCUSED_PRACTICE_ENABLED').value)
    };
  }

  async learningConfig() {
    const resolved = await this.resolveAll();
    return {
      recommendationLimit: Number(this.required(resolved, 'LEARNING_RECOMMENDATION_LIMIT').value),
      pendingLimit: Number(this.required(resolved, 'LEARNING_PENDING_LIMIT').value)
    };
  }

  private async resolveAll(): Promise<ResolvedSettings> {
    const stored = await this.prisma.systemSetting.findMany();
    const byKey = new Map(stored.map((setting) => [setting.key, setting]));
    return Object.fromEntries(SETTING_DEFINITIONS.map((definition) => [definition.key, this.resolveSetting(definition, byKey.get(definition.key))])) as ResolvedSettings;
  }

  private groupSettings(resolved: ResolvedSettings, group: string) {
    return SETTING_DEFINITIONS.filter((definition) => definition.group === group).map((definition) => {
      const item = this.required(resolved, definition.key);
      return {
        key: definition.key,
        label: definition.label,
        description: definition.description,
        valueType: definition.valueType,
        isSecret: Boolean(definition.isSecret),
        value: definition.isSecret ? undefined : item.value,
        configured: item.configured,
        masked: item.masked,
        source: item.source,
        min: definition.min,
        max: definition.max
      };
    });
  }

  private required(resolved: ResolvedSettings, key: string) {
    const setting = resolved[key];
    if (!setting) throw new BadRequestException(`Missing setting definition: ${key}`);
    return setting;
  }

  private resolveSetting(definition: SettingDefinition, stored?: StoredSetting) {
    if (stored) {
      const value = definition.isSecret ? this.decryptSecret(stored.value) : stored.value;
      return this.resolvedValue(definition, value, 'database' as const);
    }

    const envValue = definition.envKey ? process.env[definition.envKey] : undefined;
    if (envValue !== undefined && envValue !== '') return this.resolvedValue(definition, envValue, 'env' as const);

    return this.resolvedValue(definition, definition.defaultValue ?? '', 'default' as const);
  }

  private resolvedValue(definition: SettingDefinition, rawValue: unknown, source: 'database' | 'env' | 'default') {
    const value = this.normalizeValue(definition, rawValue, true);
    return {
      value,
      source,
      configured: definition.isSecret ? Boolean(String(value)) : true,
      masked: definition.isSecret && String(value) ? this.maskSecret(String(value)) : undefined
    };
  }

  private normalizeValue(definition: SettingDefinition, rawValue: unknown, allowEmpty = false) {
    if (definition.valueType === 'boolean') {
      if (typeof rawValue === 'boolean') return rawValue;
      if (typeof rawValue === 'string') return ['true', '1', 'yes', 'on'].includes(rawValue.toLowerCase());
      return Boolean(rawValue);
    }

    if (definition.valueType === 'number') {
      const value = typeof rawValue === 'number' ? rawValue : Number.parseInt(String(rawValue), 10);
      if (!Number.isInteger(value)) throw new BadRequestException(`${definition.key} must be an integer`);
      if (definition.min !== undefined && value < definition.min) throw new BadRequestException(`${definition.key} must be >= ${definition.min}`);
      if (definition.max !== undefined && value > definition.max) throw new BadRequestException(`${definition.key} must be <= ${definition.max}`);
      return value;
    }

    const value = typeof rawValue === 'string' ? rawValue.trim() : String(rawValue ?? '').trim();
    if (!allowEmpty && !definition.isSecret && !value) throw new BadRequestException(`${definition.key} cannot be blank`);
    if (definition.maxLength && value.length > definition.maxLength) throw new BadRequestException(`${definition.key} is too long`);
    if (definition.key === 'AI_BASE_URL') this.validateHttpUrl(value, definition.key);
    return value;
  }

  private validateHttpUrl(value: string, key: string) {
    try {
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid protocol');
    } catch {
      throw new BadRequestException(`${key} must be a valid HTTP URL`);
    }
  }

  private encryptSecret(value: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
  }

  private decryptSecret(value: string) {
    if (!value.startsWith('v1:')) return value;
    const parts = value.split(':');
    if (parts.length !== 4) throw new BadRequestException('Stored secret is invalid');
    const [, iv, tag, encrypted] = parts as [string, string, string, string];
    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64')), decipher.final()]).toString('utf8');
  }

  private encryptionKey() {
    const secret = process.env.APP_ENCRYPTION_KEY || process.env.JWT_SECRET || 'dev-local-settings-key-change-me';
    return createHash('sha256').update(secret).digest();
  }

  private maskSecret(value: string) {
    if (value.length <= 8) return '********';
    return `${value.slice(0, 3)}****${value.slice(-4)}`;
  }
}
