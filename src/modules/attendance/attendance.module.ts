import { Module } from '@nestjs/common';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';

@Module({
  controllers: [AttendanceController],
  providers: [AttendanceService, FirebaseAuthGuard],
})
export class AttendanceModule {}
