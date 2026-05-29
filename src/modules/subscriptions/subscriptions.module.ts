import { Module } from '@nestjs/common';
import { ResendEmailService } from '../../infrastructure/email/resend-email.service';
import { SubscriptionMaintenanceService } from './subscription-maintenance.service';
import { SubscriptionsCronController } from './subscriptions-cron.controller';

@Module({
  controllers: [SubscriptionsCronController],
  providers: [ResendEmailService, SubscriptionMaintenanceService],
  exports: [SubscriptionMaintenanceService],
})
export class SubscriptionsModule {}
