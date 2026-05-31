import { Difficulty, InterviewStatus, Speaker, UserRole } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { InterviewsService } from './interviews.service';

describe('InterviewsService', () => {
  it('finishes a session idempotently using one improvement plan per report', async () => {
    const session = buildSession();
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

  it('rejects invalid AI assessment JSON instead of creating fallback reports', async () => {
    const session = buildSession();
    const prisma = {
      interviewSession: {
        findUnique: vi.fn().mockResolvedValue(session),
        update: vi.fn()
      },
      assessmentReport: {
        upsert: vi.fn()
      },
      improvementPlan: {
        upsert: vi.fn()
      }
    };
    const ai = {
      run: vi.fn().mockResolvedValue('not-json')
    };
    const service = new InterviewsService(prisma as never, ai as never);

    await expect(service.finish('user-1', UserRole.USER, 'session-1')).rejects.toThrow('AI assessment report is not valid JSON');

    expect(prisma.assessmentReport.upsert).not.toHaveBeenCalled();
    expect(prisma.improvementPlan.upsert).not.toHaveBeenCalled();
    expect(prisma.interviewSession.update).not.toHaveBeenCalled();
  });

  it('rejects AI assessment JSON with invalid score schema', async () => {
    const session = buildSession();
    const prisma = {
      interviewSession: {
        findUnique: vi.fn().mockResolvedValue(session),
        update: vi.fn()
      },
      assessmentReport: {
        upsert: vi.fn()
      },
      improvementPlan: {
        upsert: vi.fn()
      }
    };
    const ai = {
      run: vi.fn().mockResolvedValue(
        JSON.stringify({
          overallScore: 105,
          dimensionScores: { communication: 80 },
          summary: 'ok',
          recommendations: ['Improve metrics depth']
        })
      )
    };
    const service = new InterviewsService(prisma as never, ai as never);

    await expect(service.finish('user-1', UserRole.USER, 'session-1')).rejects.toThrow('AI assessment report schema is invalid');

    expect(prisma.assessmentReport.upsert).not.toHaveBeenCalled();
    expect(prisma.improvementPlan.upsert).not.toHaveBeenCalled();
    expect(prisma.interviewSession.update).not.toHaveBeenCalled();
  });
});

function buildSession() {
  return {
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
}
