import { Global, Module } from '@nestjs/common';
import { MarketplaceController } from './marketplace.controller';
import { MpOAuthService } from './mp-oauth.service';
import { MpSellerService } from './mp-seller.service';
import { PlatformSettingsService } from './platform-settings.service';
import { SplitCalculatorService } from './split-calculator.service';
import { MpFeeEstimatorService } from './mp-fee-estimator.service';
import { MpAccountProfileService } from './mp-account-profile.service';
import { TokenCryptoService } from '../../infrastructure/crypto/token-crypto.service';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';

@Global()
@Module({
  controllers: [MarketplaceController],
  providers: [
    MpSellerService,
    MpOAuthService,
    MpAccountProfileService,
    PlatformSettingsService,
    SplitCalculatorService,
    MpFeeEstimatorService,
    TokenCryptoService,
    FirebaseAuthGuard,
  ],
  exports: [MpSellerService, PlatformSettingsService, SplitCalculatorService],
})
export class MarketplaceModule {}
