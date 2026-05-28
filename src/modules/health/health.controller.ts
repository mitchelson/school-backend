import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Controller('health')
export class HealthController {
  private readonly startedAt = new Date();

  constructor(private prisma: PrismaService) {}

  @Get()
  async check() {
    let dbOk = false;
    let platformSettingsTable = false;
    let userMpColumns = false;

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dbOk = true;
    } catch {}

    if (dbOk) {
      try {
        await this.prisma.platformSetting.count();
        platformSettingsTable = true;
      } catch {}

      try {
        await this.prisma.$queryRaw`
          SELECT "mpUserId" FROM "User" LIMIT 0
        `;
        userMpColumns = true;
      } catch {}
    }

    const ready = dbOk && platformSettingsTable && userMpColumns;

    return {
      status: ready ? 'ok' : dbOk ? 'degraded' : 'degraded',
      uptime: Math.floor((Date.now() - this.startedAt.getTime()) / 1000),
      timestamp: new Date().toISOString(),
      db: dbOk ? 'connected' : 'disconnected',
      schema: {
        platformSettingsTable,
        userMpColumns,
      },
    };
  }
}
