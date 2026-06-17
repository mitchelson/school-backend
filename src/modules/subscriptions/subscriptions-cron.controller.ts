import {
  Controller,
  Headers,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { SubscriptionMaintenanceService } from './subscription-maintenance.service';
import { isIpAllowed, resolveClientIp } from '../../common/utils/client-ip';

@Controller('internal/cron')
@SkipThrottle()
export class SubscriptionsCronController {
  constructor(
    private maintenance: SubscriptionMaintenanceService,
    private config: ConfigService,
  ) {}

  @Post('subscription-maintenance')
  run(
    @Headers('authorization') authorization: string | undefined,
    @Req() req: Request,
  ) {
    const secret = this.config.get<string>('CRON_SECRET');
    if (!secret || authorization !== `Bearer ${secret}`) {
      throw new UnauthorizedException();
    }

    const allowedIps =
      this.config
        .get<string>('CRON_ALLOWED_IPS')
        ?.split(',')
        .map((ip) => ip.trim())
        .filter(Boolean) ?? [];

    if (allowedIps.length > 0) {
      const clientIp = resolveClientIp(req);
      if (!isIpAllowed(clientIp, allowedIps)) {
        throw new UnauthorizedException();
      }
    }

    return this.maintenance.run();
  }
}
