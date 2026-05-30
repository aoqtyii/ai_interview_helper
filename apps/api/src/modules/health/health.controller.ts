import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/public.decorator';
import { Roles } from '../../common/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller()
export class HealthController {
  @Public()
  @Get('health')
  health() {
    return {
      ok: true,
      service: 'ai-interview-helper-api',
      timestamp: new Date().toISOString()
    };
  }

  @Get('metrics')
  @Roles(UserRole.ADMIN)
  metrics() {
    return {
      uptimeSeconds: Math.round(process.uptime()),
      memory: process.memoryUsage()
    };
  }
}
