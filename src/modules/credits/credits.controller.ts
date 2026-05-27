import { Controller, Get, UseGuards } from '@nestjs/common';
import { CreditsService } from './credits.service';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('credits')
@UseGuards(FirebaseAuthGuard)
export class CreditsController {
  constructor(private creditsService: CreditsService) {}

  @Get('balance')
  getBalance(@CurrentUser('id') userId: string) {
    return this.creditsService.getBalance(userId);
  }
}
