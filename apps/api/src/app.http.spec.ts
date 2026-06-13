import 'reflect-metadata';
import { AddressInfo } from 'node:net';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { InterviewStatus, Speaker, UserRole, UserStatus } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';
import { AiGatewayService } from './modules/ai/ai-gateway.service';
import { PrismaService } from './prisma/prisma.service';

describe('API HTTP boundaries', () => {
  let app: INestApplication;
  let baseUrl: string;
  let jwt: JwtService;
  let aiRun: ReturnType<typeof vi.fn>;
  let assessmentReportUpsert: ReturnType<typeof vi.fn>;
  let improvementPlanUpsert: ReturnType<typeof vi.fn>;
  let interviewSessionUpdate: ReturnType<typeof vi.fn>;
  let sourceFeedCreate: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    aiRun = vi.fn().mockResolvedValue('not-json');
    assessmentReportUpsert = vi.fn();
    improvementPlanUpsert = vi.fn();
    interviewSessionUpdate = vi.fn();
    sourceFeedCreate = vi.fn();
    const prisma = {
      user: {
        findUnique: vi.fn((args: { where: { id?: string } }) => {
          if (args.where.id === 'admin-1') {
            return Promise.resolve({
              id: 'admin-1',
              email: 'admin@example.com',
              role: UserRole.ADMIN,
              status: UserStatus.ACTIVE
            });
          }

          if (args.where.id === 'user-1') {
            return Promise.resolve({
              id: 'user-1',
              email: 'user@example.com',
              role: UserRole.USER,
              status: UserStatus.ACTIVE
            });
          }

          if (args.where.id === 'user-2') {
            return Promise.resolve({
              id: 'user-2',
              email: 'other-user@example.com',
              role: UserRole.USER,
              status: UserStatus.ACTIVE
            });
          }

          return Promise.resolve(null);
        })
      },
      aiRunLog: {
        findMany: vi.fn().mockResolvedValue([])
      },
      systemSetting: {
        findMany: vi.fn().mockResolvedValue([])
      },
      assessmentReport: {
        upsert: assessmentReportUpsert
      },
      improvementPlan: {
        upsert: improvementPlanUpsert
      },
      interviewSession: {
        findUnique: vi.fn((args: { where: { id?: string } }) => {
          if (args.where.id !== 'session-1') return Promise.resolve(null);

          return Promise.resolve({
            id: 'session-1',
            userId: 'user-1',
            roleProfileId: 'role-1',
            status: InterviewStatus.IN_PROGRESS,
            turns: [
              {
                id: 'turn-1',
                speaker: Speaker.CANDIDATE,
                content: 'I would define success metrics before launching the agent.'
              },
              {
                id: 'turn-2',
                speaker: Speaker.CANDIDATE,
                content: 'I would add offline evaluation and rollout guardrails.'
              }
            ],
            roleProfile: {
              id: 'role-1',
              name: 'AI Agent Developer',
              skills: []
            },
            report: null
          });
        }),
        update: interviewSessionUpdate
      },
      sourceFeed: {
        create: sourceFeedCreate
      }
    };

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(AiGatewayService)
      .useValue({ run: aiRun })
      .compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.listen(0);

    jwt = app.get(JwtService);
    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await app.close();
  });

  it('keeps health public and metrics protected by admin role', async () => {
    const health = await fetch(`${baseUrl}/health`);
    expect(health.status).toBe(200);
    expect(health.headers.get('x-request-id')).toBeTruthy();

    const missingToken = await fetch(`${baseUrl}/metrics`);
    expect(missingToken.status).toBe(401);

    const userToken = await jwt.signAsync({ sub: 'user-1' });
    const userMetrics = await fetch(`${baseUrl}/metrics`, {
      headers: { authorization: `Bearer ${userToken}` }
    });
    expect(userMetrics.status).toBe(403);

    const adminToken = await jwt.signAsync({ sub: 'admin-1' });
    const adminMetrics = await fetch(`${baseUrl}/metrics`, {
      headers: { authorization: `Bearer ${adminToken}` }
    });
    expect(adminMetrics.status).toBe(200);
  });

  it('rejects invalid admin payloads before controller persistence', async () => {
    const adminToken = await jwt.signAsync({ sub: 'admin-1' });
    const response = await fetch(`${baseUrl}/admin/source-feeds`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${adminToken}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Bad Feed',
        type: 'RSS',
        url: 'not-a-url',
        unexpected: 'rejected'
      })
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { statusCode: number; path: string; requestId: string };
    expect(body.statusCode).toBe(400);
    expect(body.path).toBe('/admin/source-feeds');
    expect(body.requestId).toBeTruthy();
    expect(sourceFeedCreate).not.toHaveBeenCalled();
  });

  it('preserves incoming request ids on error responses', async () => {
    const requestId = 'test-request-id-1';
    const response = await fetch(`${baseUrl}/metrics`, {
      headers: { 'x-request-id': requestId }
    });
    const body = (await response.json()) as { requestId: string };

    expect(response.status).toBe(401);
    expect(response.headers.get('x-request-id')).toBe(requestId);
    expect(body.requestId).toBe(requestId);
  });

  it('returns 502 and avoids report writes when AI assessment output is invalid', async () => {
    const userToken = await jwt.signAsync({ sub: 'user-1' });
    const requestId = 'invalid-assessment-report-1';

    const response = await fetch(`${baseUrl}/interviews/sessions/session-1/finish`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${userToken}`,
        'x-request-id': requestId
      }
    });

    const body = (await response.json()) as {
      statusCode: number;
      error: string;
      message: string;
      path: string;
      requestId: string;
    };

    expect(response.status).toBe(502);
    expect(body.statusCode).toBe(502);
    expect(body.message).toBe('AI assessment report is not valid JSON');
    expect(body.path).toBe('/interviews/sessions/session-1/finish');
    expect(body.requestId).toBe(requestId);
    expect(aiRun).toHaveBeenCalledWith(expect.objectContaining({ taskType: 'assessment_report', userId: 'user-1' }));
    expect(assessmentReportUpsert).not.toHaveBeenCalled();
    expect(improvementPlanUpsert).not.toHaveBeenCalled();
    expect(interviewSessionUpdate).not.toHaveBeenCalled();
  });

  it('rejects blank interview answers before calling AI', async () => {
    const userToken = await jwt.signAsync({ sub: 'user-1' });

    const response = await fetch(`${baseUrl}/interviews/sessions/session-1/turns`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${userToken}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ content: '   ' })
    });

    const body = (await response.json()) as {
      statusCode: number;
      path: string;
      requestId: string;
    };

    expect(response.status).toBe(400);
    expect(body.statusCode).toBe(400);
    expect(body.path).toBe('/interviews/sessions/session-1/turns');
    expect(body.requestId).toBeTruthy();
    expect(aiRun).not.toHaveBeenCalled();
  });

  it('prevents users from reading another user interview session', async () => {
    const otherUserToken = await jwt.signAsync({ sub: 'user-2' });

    const response = await fetch(`${baseUrl}/interviews/sessions/session-1`, {
      headers: { authorization: `Bearer ${otherUserToken}` }
    });

    const body = (await response.json()) as {
      statusCode: number;
      message: string;
      path: string;
      requestId: string;
    };

    expect(response.status).toBe(403);
    expect(body.statusCode).toBe(403);
    expect(body.message).toBe('Cannot access this session');
    expect(body.path).toBe('/interviews/sessions/session-1');
    expect(body.requestId).toBeTruthy();
  });

  it('prevents users from finishing another user interview session', async () => {
    const otherUserToken = await jwt.signAsync({ sub: 'user-2' });

    const response = await fetch(`${baseUrl}/interviews/sessions/session-1/finish`, {
      method: 'POST',
      headers: { authorization: `Bearer ${otherUserToken}` }
    });

    const body = (await response.json()) as {
      statusCode: number;
      message: string;
      path: string;
      requestId: string;
    };

    expect(response.status).toBe(403);
    expect(body.statusCode).toBe(403);
    expect(body.message).toBe('Cannot access this session');
    expect(body.path).toBe('/interviews/sessions/session-1/finish');
    expect(body.requestId).toBeTruthy();
    expect(aiRun).not.toHaveBeenCalled();
    expect(assessmentReportUpsert).not.toHaveBeenCalled();
    expect(improvementPlanUpsert).not.toHaveBeenCalled();
    expect(interviewSessionUpdate).not.toHaveBeenCalled();
  });
});
