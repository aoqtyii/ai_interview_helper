import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/public.decorator';

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
  metrics() {
    return {
      uptimeSeconds: Math.round(process.uptime()),
      memory: process.memoryUsage()
    };
  }
}
