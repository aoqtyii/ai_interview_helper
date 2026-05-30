import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { ROLES_KEY } from '../../common/roles.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  it('rejects authenticated users without the required role', async () => {
    const reflector = {
      getAllAndOverride: vi.fn((key: string) => {
        if (key === ROLES_KEY) return [UserRole.ADMIN];
        return false;
      })
    };
    const jwt = { verifyAsync: vi.fn().mockResolvedValue({ sub: 'user-1' }) };
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'user-1',
          email: 'user@example.com',
          role: UserRole.USER,
          status: UserStatus.ACTIVE
        })
      }
    };
    const guard = new JwtAuthGuard(jwt as never, prisma as never, reflector as never);

    await expect(guard.canActivate(createContext({ authorization: 'Bearer token' }))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects missing tokens', async () => {
    const guard = new JwtAuthGuard({ verifyAsync: vi.fn() } as never, { user: { findUnique: vi.fn() } } as never, { getAllAndOverride: vi.fn(() => false) } as never);

    await expect(guard.canActivate(createContext({}))).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

function createContext(headers: Record<string, string>) {
  return {
    getHandler: vi.fn(),
    getClass: vi.fn(),
    switchToHttp: () => ({
      getRequest: () => ({
        cookies: {},
        headers
      })
    })
  } as never;
}
