import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';

@Module({
  controllers: [DashboardController],
  providers: [DashboardService, FirebaseAuthGuard],
})
export class DashboardModule {}
