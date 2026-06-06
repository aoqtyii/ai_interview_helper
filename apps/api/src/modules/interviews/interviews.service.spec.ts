import { BadGatewayException } from '@nestjs/common';
import { Difficulty, InterviewStatus, Speaker, UserRole } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { InterviewsService } from './interviews.service';

describe('InterviewsService', () => {
  it('does not create a session when the opening AI question fails', async () => {
    const prisma = {
      roleProfile: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'role-1', name: 'AI Agent Developer', skills: [] })
      },
      interviewSession: {
        create: vi.fn()
      },
      interviewTurn: {
        create: vi.fn()
      }
    };
    const ai = {
      run: vi.fn().mockRejectedValue(new BadGatewayException('AI_API_KEY is required'))
    };
    const service = new InterviewsService(prisma as never, ai as never);

    await expect(service.create('user-1', { roleProfileId: 'role-1', difficulty: Difficulty.MID })).rejects.toThrow('AI_API_KEY is required');

    expect(prisma.interviewSession.create).not.toHaveBeenCalled();
    expect(prisma.interviewTurn.create).not.toHaveBeenCalled();
  });

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

  it('requires at least two candidate answers before generating a report', async () => {
    const session = buildSessionWithCandidateAnswers(1);
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
      run: vi.fn()
    };
    const service = new InterviewsService(prisma as never, ai as never);

    await expect(service.finish('user-1', UserRole.USER, 'session-1')).rejects.toThrow('At least 2 candidate answers are required');

    expect(ai.run).not.toHaveBeenCalled();
    expect(prisma.assessmentReport.upsert).not.toHaveBeenCalled();
    expect(prisma.improvementPlan.upsert).not.toHaveBeenCalled();
    expect(prisma.interviewSession.update).not.toHaveBeenCalled();
  });

  it('does not persist candidate answers when the follow-up AI turn fails', async () => {
    const session = buildSession();
    const prisma = {
      interviewSession: {
        findUnique: vi.fn().mockResolvedValue(session)
      },
      interviewTurn: {
        create: vi.fn()
      },
      $transaction: vi.fn()
    };
    const ai = {
      run: vi.fn().mockRejectedValue(new BadGatewayException('AI provider failed'))
    };
    const service = new InterviewsService(prisma as never, ai as never);

    await expect(service.addTurn('user-1', UserRole.USER, 'session-1', 'candidate answer')).rejects.toThrow('AI provider failed');

    expect(prisma.interviewTurn.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('persists candidate and interviewer turns together after the follow-up AI turn succeeds', async () => {
    const session = buildSession();
    const updatedSession = {
      ...session,
      turns: [
        ...session.turns,
        { id: 'turn-2', sessionId: 'session-1', speaker: Speaker.CANDIDATE, content: 'candidate answer', metadata: {}, createdAt: new Date() },
        { id: 'turn-3', sessionId: 'session-1', speaker: Speaker.INTERVIEWER, content: 'next question', metadata: {}, createdAt: new Date() }
      ]
    };
    const prisma = {
      interviewSession: {
        findUnique: vi.fn().mockResolvedValueOnce(session).mockResolvedValueOnce(updatedSession)
      },
      interviewTurn: {
        create: vi.fn().mockReturnValueOnce({ id: 'turn-2' }).mockReturnValueOnce({ id: 'turn-3' })
      },
      $transaction: vi.fn().mockResolvedValue([{ id: 'turn-2' }, { id: 'turn-3' }])
    };
    const ai = {
      run: vi.fn().mockResolvedValue('next question')
    };
    const service = new InterviewsService(prisma as never, ai as never);

    await expect(service.addTurn('user-1', UserRole.USER, 'session-1', 'candidate answer')).resolves.toEqual(updatedSession);

    expect(ai.run).toHaveBeenCalledWith(expect.objectContaining({ input: expect.stringContaining('candidate answer') }));
    expect(prisma.interviewTurn.create).toHaveBeenNthCalledWith(1, {
      data: { sessionId: 'session-1', speaker: Speaker.CANDIDATE, content: 'candidate answer' }
    });
    expect(prisma.interviewTurn.create).toHaveBeenNthCalledWith(2, {
      data: { sessionId: 'session-1', speaker: Speaker.INTERVIEWER, content: 'next question' }
    });
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });

  it('stores the fifth candidate answer without generating another follow-up question', async () => {
    const session = buildSessionWithCandidateAnswers(4);
    const updatedSession = buildSessionWithCandidateAnswers(5);
    const prisma = {
      interviewSession: {
        findUnique: vi.fn().mockResolvedValueOnce(session).mockResolvedValueOnce(updatedSession)
      },
      interviewTurn: {
        create: vi.fn().mockResolvedValue({ id: 'turn-final' })
      },
      $transaction: vi.fn()
    };
    const ai = {
      run: vi.fn()
    };
    const service = new InterviewsService(prisma as never, ai as never);

    await expect(service.addTurn('user-1', UserRole.USER, 'session-1', 'final candidate answer')).resolves.toEqual(updatedSession);

    expect(ai.run).not.toHaveBeenCalled();
    expect(prisma.interviewTurn.create).toHaveBeenCalledWith({
      data: { sessionId: 'session-1', speaker: Speaker.CANDIDATE, content: 'final candidate answer' }
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects additional answers after the maximum answer rounds', async () => {
    const session = buildSessionWithCandidateAnswers(5);
    const prisma = {
      interviewSession: {
        findUnique: vi.fn().mockResolvedValue(session)
      },
      interviewTurn: {
        create: vi.fn()
      },
      $transaction: vi.fn()
    };
    const ai = {
      run: vi.fn()
    };
    const service = new InterviewsService(prisma as never, ai as never);

    await expect(service.addTurn('user-1', UserRole.USER, 'session-1', 'extra answer')).rejects.toThrow('Interview has reached the maximum answer rounds');

    expect(ai.run).not.toHaveBeenCalled();
    expect(prisma.interviewTurn.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
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
  return buildSessionWithCandidateAnswers(2);
}

function buildSessionWithCandidateAnswers(candidateAnswers: number) {
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
    turns: Array.from({ length: candidateAnswers }, (_, index) => ({
      id: `turn-${index + 1}`,
      sessionId: 'session-1',
      speaker: Speaker.CANDIDATE,
      content: `answer ${index + 1}`,
      metadata: {},
      createdAt: new Date()
    })),
    report: null
  };
}
