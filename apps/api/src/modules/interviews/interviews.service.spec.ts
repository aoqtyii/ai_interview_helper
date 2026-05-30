import { Difficulty, InterviewStatus, Speaker, UserRole } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { InterviewsService } from './interviews.service';

describe('InterviewsService', () => {
  it('finishes a session idempotently using one improvement plan per report', async () => {
    const session = {
      id: 'session-1',
      userId: 'user-1',
      roleProfileId: 'role-1',
      mode: 'TEXT',
      difficulty: Difficulty.MID,
      topic: null,
      status: InterviewStatus.IN_PROGRESS,
      startedAt: new Date(),
      endedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      roleProfile: { id: 'role-1', name: 'AI Agent Developer', skills: [] },
      turns: [
        {
          id: 'turn-1',
          sessionId: 'session-1',
          speaker: Speaker.CANDIDATE,
          content: 'answer',
          metadata: {},
          createdAt: new Date()
        }
      ],
      report: null
    };
    const completedSession = { ...session, status: InterviewStatus.COMPLETED };
    const prisma = {
      interviewSession: {
        findUnique: vi.fn().mockResolvedValueOnce(session).mockResolvedValueOnce(completedSession),
        update: vi.fn().mockResolvedValue(completedSession)
      },
      assessmentReport: {
        upsert: vi.fn().mockResolvedValue({ id: 'report-1' })
      },
      improvementPlan: {
        upsert: vi.fn().mockResolvedValue({ id: 'plan-1' })
      }
    };
    const ai = {
      run: vi.fn().mockResolvedValue(
        JSON.stringify({
          overallScore: 80,
          dimensionScores: { communication: 80 },
          summary: 'ok',
          recommendations: ['Improve metrics depth']
        })
      )
    };
    const service = new InterviewsService(prisma as never, ai as never);

    await service.finish('user-1', UserRole.USER, 'session-1');

    expect(prisma.improvementPlan.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { reportId: 'report-1' }
      })
    );
    expect(prisma.improvementPlan.upsert).toHaveBeenCalledOnce();
  });
});
