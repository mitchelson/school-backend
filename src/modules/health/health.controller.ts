import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Controller('health')
export class HealthController {
  private readonly startedAt = new Date();

  constructor(private prisma: PrismaService) {}

  @Get()
  async check() {
    let dbOk = false;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dbOk = true;
    } catch {}

    return {
      status: dbOk ? 'ok' : 'degraded',
      uptime: Math.floor((Date.now() - this.startedAt.getTime()) / 1000),
      timestamp: new Date().toISOString(),
      db: dbOk ? 'connected' : 'disconnected',
    };
  }
}
