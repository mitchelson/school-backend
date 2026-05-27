import { Controller, Post, Delete, Param, UseGuards } from '@nestjs/common';
import { EnrollmentsService } from './enrollments.service';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('classes')
@UseGuards(FirebaseAuthGuard)
export class EnrollmentsController {
  constructor(private enrollmentsService: EnrollmentsService) {}

  @Post(':classId/enroll')
  enroll(
    @CurrentUser('id') userId: string,
    @Param('classId') classId: string,
  ) {
    return this.enrollmentsService.enroll(userId, classId);
  }

  @Delete(':classId/enroll')
  cancel(
    @CurrentUser('id') userId: string,
    @Param('classId') classId: string,
  ) {
    return this.enrollmentsService.cancelEnrollment(userId, classId);
  }
}
