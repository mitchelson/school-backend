import { Controller, Get, HttpCode, HttpStatus, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Controller('health')
@SkipThrottle()
export class HealthController {
  private readonly startedAt = new Date();

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  @Get('live')
  @HttpCode(HttpStatus.OK)
  live() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  async ready(@Res() res: Response) {
    const dbOk = await this.checkDatabase();
    const body = {
      status: dbOk ? 'ok' : 'degraded',
      db: dbOk ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString(),
    };
    res.status(dbOk ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE).json(body);
  }

  @Get()
  async check(@Res() res: Response) {
    const isProduction = this.config.get<string>('NODE_ENV') === 'production';
    const dbOk = await this.checkDatabase();

    if (isProduction) {
      const body = {
        status: dbOk ? 'ok' : 'degraded',
        timestamp: new Date().toISOString(),
      };
      res
        .status(dbOk ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE)
        .json(body);
      return;
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

    const body = {
      status: ready ? 'ok' : dbOk ? 'degraded' : 'degraded',
      uptime: Math.floor((Date.now() - this.startedAt.getTime()) / 1000),
      timestamp: new Date().toISOString(),
      db: dbOk ? 'connected' : 'disconnected',
      schema: {
        platformSettingsTable,
        userMpColumns,
      },
    };

    res
      .status(ready ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE)
      .json(body);
  }

  private async checkDatabase(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
