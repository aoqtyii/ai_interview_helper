import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { UserStatus } from '@prisma/client';
import { IS_PUBLIC_KEY } from '../../common/public.decorator';
import { ROLES_KEY } from '../../common/roles.decorator';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(JwtService)
    private readonly jwt: JwtService,
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(Reflector)
    private readonly reflector: Reflector
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const cookieName = process.env.COOKIE_NAME ?? 'aih_session';
    const token = request.cookies?.[cookieName] ?? this.readBearerToken(request.headers.authorization);
    if (!token) throw new UnauthorizedException('Missing session token');

    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(token);
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, email: true, role: true, status: true }
      });
      if (!user || user.status !== UserStatus.ACTIVE) throw new UnauthorizedException('Invalid session');

      request.user = { id: user.id, email: user.email, role: user.role };
      const roles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [context.getHandler(), context.getClass()]);
      if (roles?.length && !roles.includes(user.role)) throw new ForbiddenException('Insufficient role');
      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) throw error;
      throw new UnauthorizedException('Invalid session token');
    }
  }

  private readBearerToken(header?: string) {
    if (!header?.startsWith('Bearer ')) return undefined;
    return header.slice('Bearer '.length);
  }
}
