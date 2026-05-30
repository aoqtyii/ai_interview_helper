import { describe, expect, it, vi } from 'vitest';
import { AiGatewayService } from './ai-gateway.service';

describe('AiGatewayService', () => {
  it('returns deterministic mock output without provider credentials', async () => {
    const prisma = { aiRunLog: { create: vi.fn() } };
    const service = new AiGatewayService(prisma as never);

    const output = await service.run({
      taskType: 'assessment_report',
      system: 'score',
      input: 'transcript'
    });

    expect(output).toContain('overallScore');
    expect(prisma.aiRunLog.create).toHaveBeenCalledOnce();
  });
});
