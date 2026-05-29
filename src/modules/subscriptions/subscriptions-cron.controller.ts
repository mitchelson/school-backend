import {
  Controller,
  Headers,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SubscriptionMaintenanceService } from './subscription-maintenance.service';

@Controller('internal/cron')
export class SubscriptionsCronController {
  constructor(
    private maintenance: SubscriptionMaintenanceService,
    private config: ConfigService,
  ) {}

  @Post('subscription-maintenance')
  run(@Headers('authorization') authorization?: string) {
    const secret = this.config.get<string>('CRON_SECRET');
    if (!secret || authorization !== `Bearer ${secret}`) {
      throw new UnauthorizedException();
    }
    return this.maintenance.run();
  }
}
