import { Body, Controller, Get, Patch, Query, UseGuards } from '@nestjs/common';
import { PlatformSettingsService } from '../marketplace/platform-settings.service';
import { SplitCalculatorService } from '../marketplace/split-calculator.service';
import { UpdatePlatformFeeDto } from './dto/platform-fee.dto';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('platform')
export class PlatformController {
  constructor(
    private settings: PlatformSettingsService,
    private splitCalc: SplitCalculatorService,
  ) {}

  @Get('fee')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles('owner')
  async getFee() {
    const totalFeePercent = await this.settings.getTotalFeePercent();
    return {
      totalFeePercent,
      sellerNetPercent: Math.max(0, 100 - totalFeePercent),
      platformFeePercent: totalFeePercent,
      mpFeePercentPix: this.splitCalc.getMpFeePercent('pix'),
      mpFeePercentCard: this.splitCalc.getMpFeePercent('card'),
    };
  }

  /** Simula split para um valor (ex.: R$ 100) — útil no painel owner. */
  @Get('fee/preview')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles('owner')
  async previewFee(
    @Query('amountInCents') amountInCents = '10000',
    @Query('paymentMethod') paymentMethod: 'pix' | 'card' = 'pix',
  ) {
    const gross = Math.max(100, parseInt(amountInCents, 10) || 10000);
    const method = paymentMethod === 'card' ? 'card' : 'pix';
    return this.splitCalc.calculate(gross, method);
  }

  @Patch('fee')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles('owner')
  async updateFee(@Body() dto: UpdatePlatformFeeDto) {
    const totalFeePercent = await this.settings.setPlatformFeePercent(
      dto.platformFeePercent,
    );
    return {
      totalFeePercent,
      sellerNetPercent: Math.max(0, 100 - totalFeePercent),
      platformFeePercent: totalFeePercent,
    };
  }
}
