import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { EstablishSessionDto } from './dto/session.dto';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { FirebaseIdentityGuard } from '../../common/guards/firebase-identity.guard';
import { CurrentFirebaseIdentity } from '../../common/decorators/firebase-identity.decorator';
import type { FirebaseIdentity } from '../../common/guards/firebase-identity.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('auth')
@Throttle({ auth: { limit: 20, ttl: 60_000 } })
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('session')
  @UseGuards(FirebaseIdentityGuard)
  establishSession(
    @CurrentFirebaseIdentity() identity: FirebaseIdentity,
    @Body() dto: EstablishSessionDto,
  ) {
    return this.authService.establishSession(identity, dto);
  }

  @Post('register')
  @UseGuards(FirebaseIdentityGuard)
  register(
    @CurrentFirebaseIdentity() identity: FirebaseIdentity,
    @Body() dto: RegisterDto,
  ) {
    return this.authService.register(identity, dto);
  }

  @Get('me')
  @UseGuards(FirebaseAuthGuard)
  getMe(@CurrentUser('id') userId: string) {
    return this.authService.getMe(userId);
  }
}
