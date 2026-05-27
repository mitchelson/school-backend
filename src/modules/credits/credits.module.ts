import { Module } from '@nestjs/common';
import { CreditsController } from './credits.controller';
import { CreditsService } from './credits.service';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';

@Module({
  controllers: [CreditsController],
  providers: [CreditsService, FirebaseAuthGuard],
  exports: [CreditsService],
})
export class CreditsModule {}
