import { describe, expect, it } from 'vitest';
import { loadAppConfig } from './app-config';

describe('loadAppConfig', () => {
  it('requires JWT_SECRET in production', () => {
    expect(() => loadAppConfig({ NODE_ENV: 'production' })).toThrow('JWT_SECRET is required in production');
  });

  it('does not enable AI mock mode in production unless explicitly requested', () => {
    const config = loadAppConfig({ NODE_ENV: 'production', JWT_SECRET: 'secret' });
    expect(config.aiMockMode).toBe(false);
  });
});
