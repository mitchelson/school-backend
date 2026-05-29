import { Module } from '@nestjs/common';
import { SubscriptionMaintenanceService } from './subscription-maintenance.service';
import { SubscriptionsCronController } from './subscriptions-cron.controller';

@Module({
  controllers: [SubscriptionsCronController],
  providers: [SubscriptionMaintenanceService],
  exports: [SubscriptionMaintenanceService],
})
export class SubscriptionsModule {}
