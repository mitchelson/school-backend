import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { MpOAuthService } from './mp-oauth.service';
import { MpSellerService } from './mp-seller.service';
import { PlatformSettingsService } from './platform-settings.service';
import { SplitCalculatorService } from './split-calculator.service';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('marketplace/mp')
export class MarketplaceController {
  constructor(
    private oauth: MpOAuthService,
    private seller: MpSellerService,
    private settings: PlatformSettingsService,
    private splitCalc: SplitCalculatorService,
  ) {}

  @Get('status')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles('admin')
  async status() {
    const connection = await this.seller.getConnectionStatus();
    const totalFeePercent = await this.settings.getTotalFeePercent();
    const [mpFeePercentPix, mpFeePercentCard] = await Promise.all([
      this.splitCalc.getMpFeePercent('pix'),
      this.splitCalc.getMpFeePercent('card'),
    ]);
    return {
      ...connection,
      totalFeePercent,
      sellerNetPercent: Math.max(0, 100 - totalFeePercent),
      platformFeePercent: totalFeePercent,
      mpFeePercentPix,
      mpFeePercentCard,
    };
  }

  @Get('oauth/authorize')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles('admin')
  async authorize() {
    const url = await this.oauth.buildAuthorizeUrl();
    return { url };
  }

  /** Callback público — Mercado Pago redireciona aqui após OAuth. */
  @Get('oauth/callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    try {
      if (!code || !state) throw new Error('Parâmetros ausentes');
      await this.oauth.handleCallback(code, state);
      res.redirect(this.oauth.getFrontendRedirectUrl(true));
    } catch {
      res.redirect(this.oauth.getFrontendRedirectUrl(false));
    }
  }
}
