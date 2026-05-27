import { Module } from '@nestjs/common';
import { EnrollmentsController } from './enrollments.controller';
import { EnrollmentsService } from './enrollments.service';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';

@Module({
  controllers: [EnrollmentsController],
  providers: [EnrollmentsService, FirebaseAuthGuard],
})
export class EnrollmentsModule {}
