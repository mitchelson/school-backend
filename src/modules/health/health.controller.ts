import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Controller('health')
@SkipThrottle()
export class HealthController {
  private readonly startedAt = new Date();

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  @Get()
  async check() {
    const isProduction = this.config.get<string>('NODE_ENV') === 'production';

    let dbOk = false;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dbOk = true;
    } catch {}

    if (isProduction) {
      return {
        status: dbOk ? 'ok' : 'degraded',
        timestamp: new Date().toISOString(),
      };
    }

    let platformSettingsTable = false;
    let userMpColumns = false;

    if (dbOk) {
      try {
        await this.prisma.platformSetting.count();
        platformSettingsTable = true;
      } catch {}

      try {
        await this.prisma.$queryRaw`
          SELECT
            "mpUserId",
            "mpAccessToken",
            "mpRefreshToken",
            "mpTokenExpiresAt",
            "mpConnectedAt",
            "mpAccountEmail",
            "mpAccountNickname",
            "mpAccountName",
            "mpAccountSiteId",
            "mpProfileSyncedAt"
          FROM "User"
          LIMIT 0
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
