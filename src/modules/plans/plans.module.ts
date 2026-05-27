import { Module } from '@nestjs/common';
import { PlansController } from './plans.controller';
import { PlansService } from './plans.service';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';

@Module({
  controllers: [PlansController],
  providers: [PlansService, FirebaseAuthGuard],
})
export class PlansModule {}
