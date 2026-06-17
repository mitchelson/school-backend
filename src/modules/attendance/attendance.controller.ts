import { Controller, Post, Get, Param, UseGuards } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('attendance')
@UseGuards(FirebaseAuthGuard, RolesGuard)
export class AttendanceController {
  constructor(private attendanceService: AttendanceService) {}

  @Post(':classId/checkin')
  @Roles('aluno')
  checkin(
    @CurrentUser('id') userId: string,
    @Param('classId') classId: string,
  ) {
    return this.attendanceService.checkin(userId, classId);
  }

  @Get(':classId')
  @Roles('admin')
  listByClass(@Param('classId') classId: string) {
    return this.attendanceService.listByClass(classId);
  }
}
