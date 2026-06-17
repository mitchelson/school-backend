import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { FirebaseIdentityGuard } from '../../common/guards/firebase-identity.guard';

@Module({
  controllers: [AuthController],
  providers: [AuthService, FirebaseAuthGuard, FirebaseIdentityGuard],
  exports: [AuthService, FirebaseAuthGuard, FirebaseIdentityGuard],
})
export class AuthModule {}
