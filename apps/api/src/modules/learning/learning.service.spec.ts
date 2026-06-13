import { NotFoundException } from '@nestjs/common';
import { ProgressStatus, RecordStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { LearningService } from './learning.service';

describe('LearningService', () => {
  it('rejects progress updates for missing or inactive learning items', async () => {
    const prisma = {
      learningItem: {
        findFirst: vi.fn().mockResolvedValue(null)
      },
      learningProgress: {
        findUnique: vi.fn(),
        upsert: vi.fn()
      }
    };
    const service = new LearningService(prisma as never);

    await expect(service.progress('user-1', { learningItemId: 'missing', status: ProgressStatus.DONE })).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.learningItem.findFirst).toHaveBeenCalledWith({
      where: { id: 'missing', status: RecordStatus.ACTIVE },
      select: { id: true }
    });
    expect(prisma.learningProgress.findUnique).not.toHaveBeenCalled();
    expect(prisma.learningProgress.upsert).not.toHaveBeenCalled();
  });

  it('preserves an existing completion timestamp when saving notes for a done item', async () => {
    const completedAt = new Date('2026-06-01T00:00:00.000Z');
    const prisma = {
      learningItem: {
        findFirst: vi.fn().mockResolvedValue({ id: 'learning-1' })
      },
      learningProgress: {
        findUnique: vi.fn().mockResolvedValue({ completedAt }),
        upsert: vi.fn().mockResolvedValue({ id: 'progress-1', status: ProgressStatus.DONE })
      }
    };
    const service = new LearningService(prisma as never);

    await service.progress('user-1', { learningItemId: 'learning-1', status: ProgressStatus.DONE, note: '  note  ', reflection: '  reflection  ' });

    expect(prisma.learningProgress.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ completedAt, note: 'note', reflection: 'reflection' }),
        update: expect.objectContaining({ completedAt, note: 'note', reflection: 'reflection' })
      })
    );
  });

  it('sets completedAt only when progress is marked done', async () => {
    const prisma = {
      learningItem: {
        findFirst: vi.fn().mockResolvedValue({ id: 'learning-1' })
      },
      learningProgress: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue({ id: 'progress-1', status: ProgressStatus.DONE })
      }
    };
    const service = new LearningService(prisma as never);

    await service.progress('user-1', { learningItemId: 'learning-1', status: ProgressStatus.DONE });

    expect(prisma.learningProgress.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ completedAt: expect.any(Date) }),
        update: expect.objectContaining({ completedAt: expect.any(Date) })
      })
    );
  });
});
