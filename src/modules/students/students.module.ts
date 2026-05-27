import { Module } from '@nestjs/common';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';

@Module({
  controllers: [StudentsController],
  providers: [StudentsService, FirebaseAuthGuard],
})
export class StudentsModule {}
