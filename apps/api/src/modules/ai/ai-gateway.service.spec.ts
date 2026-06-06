import { describe, expect, it, vi } from 'vitest';
import { AiGatewayService } from './ai-gateway.service';

describe('AiGatewayService', () => {
  it('requires provider credentials when mock mode is not explicitly enabled', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalMockMode = process.env.AI_MOCK_MODE;
    const originalApiKey = process.env.AI_API_KEY;
    process.env.NODE_ENV = 'development';
    delete process.env.AI_MOCK_MODE;
    delete process.env.AI_API_KEY;

    const prisma = { aiRunLog: { create: vi.fn() } };
    const service = new AiGatewayService(prisma as never);

    await expect(
      service.run({
        taskType: 'assessment_report',
        system: 'score',
        input: 'transcript'
      })
    ).rejects.toThrow('AI_API_KEY is required');

    expect(prisma.aiRunLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          error: 'AI_API_KEY is required when AI_MOCK_MODE is disabled'
        })
      })
    );
    restoreEnv('NODE_ENV', originalNodeEnv);
    restoreEnv('AI_MOCK_MODE', originalMockMode);
    restoreEnv('AI_API_KEY', originalApiKey);
  });

  it('uses deterministic mock output only when mock mode is explicit', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalMockMode = process.env.AI_MOCK_MODE;
    const originalApiKey = process.env.AI_API_KEY;
    process.env.NODE_ENV = 'development';
    process.env.AI_MOCK_MODE = 'true';
    delete process.env.AI_API_KEY;

    const prisma = { aiRunLog: { create: vi.fn() } };
    const service = new AiGatewayService(prisma as never);

    const output = await service.run({
      taskType: 'assessment_report',
      system: 'score',
      input: 'transcript'
    });

    expect(output).toContain('overallScore');
    expect(prisma.aiRunLog.create).toHaveBeenCalledOnce();
    restoreEnv('NODE_ENV', originalNodeEnv);
    restoreEnv('AI_MOCK_MODE', originalMockMode);
    restoreEnv('AI_API_KEY', originalApiKey);
  });

  it('does not silently mock in production without explicit mock mode', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalMockMode = process.env.AI_MOCK_MODE;
    const originalApiKey = process.env.AI_API_KEY;
    const originalJwtSecret = process.env.JWT_SECRET;
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'test-secret';
    delete process.env.AI_MOCK_MODE;
    delete process.env.AI_API_KEY;

    const prisma = { aiRunLog: { create: vi.fn() } };
    const service = new AiGatewayService(prisma as never);

    await expect(
      service.run({
        taskType: 'assessment_report',
        system: 'score',
        input: 'transcript'
      })
    ).rejects.toThrow('AI_API_KEY is required');

    restoreEnv('NODE_ENV', originalNodeEnv);
    restoreEnv('AI_MOCK_MODE', originalMockMode);
    restoreEnv('AI_API_KEY', originalApiKey);
    restoreEnv('JWT_SECRET', originalJwtSecret);
  });
});

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}
