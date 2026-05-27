import { Global, Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, FirebaseAuthGuard],
  exports: [NotificationsService],
})
export class NotificationsModule {}
