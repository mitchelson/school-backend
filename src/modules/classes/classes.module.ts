import { Module } from '@nestjs/common';
import { ClassesController } from './classes.controller';
import { ClassesService } from './classes.service';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';

@Module({
  controllers: [ClassesController],
  providers: [ClassesService, FirebaseAuthGuard],
  exports: [ClassesService],
})
export class ClassesModule {}
