import { Module } from '@nestjs/common';
import { PlatformController } from './platform.controller';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';

@Module({
  controllers: [PlatformController],
  providers: [FirebaseAuthGuard],
})
export class PlatformModule {}
