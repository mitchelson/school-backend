import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { CreditsService } from './credits.service';
import { UpdateCreditPriceDto } from './dto/credit-price.dto';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('credits')
@UseGuards(FirebaseAuthGuard)
export class CreditsController {
  constructor(private creditsService: CreditsService) {}

  @Get('balance')
  getBalance(@CurrentUser('id') userId: string) {
    return this.creditsService.getBalance(userId);
  }

  /** Preço de 1 crédito avulso (aluno e admin podem consultar). */
  @Get('pricing')
  getPricing() {
    return this.creditsService.getUnitPriceInCents();
  }

  /** Admin da escola define o valor do crédito avulso. */
  @Patch('pricing')
  @UseGuards(RolesGuard)
  @Roles('admin')
  updatePricing(@Body() dto: UpdateCreditPriceDto) {
    return this.creditsService.setUnitPriceInCents(dto.unitPriceInCents);
  }
}
