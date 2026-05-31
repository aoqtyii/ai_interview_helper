import 'reflect-metadata';
import { AddressInfo } from 'node:net';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { UserRole, UserStatus } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';
import { PrismaService } from './prisma/prisma.service';

describe('API HTTP boundaries', () => {
  let app: INestApplication;
  let baseUrl: string;
  let jwt: JwtService;
  let sourceFeedCreate: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
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

          return Promise.resolve(null);
        })
      },
      aiRunLog: {
        findMany: vi.fn().mockResolvedValue([])
      },
      sourceFeed: {
        create: sourceFeedCreate
      }
    };

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
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
});
