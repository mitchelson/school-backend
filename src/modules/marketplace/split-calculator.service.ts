import { Injectable } from '@nestjs/common';
import { PlatformSettingsService } from './platform-settings.service';
import { MpFeeEstimatorService, type MpFeeSource } from './mp-fee-estimator.service';

export type SplitPaymentMethod = 'pix' | 'card';

export interface MarketplaceSplitBreakdown {
  grossInCents: number;
  /** Valor "em mãos" após taxa MP: gross − mpFee */
  netAvailableInCents: number;
  mpFeeInCents: number;
  mpFeeSource: MpFeeSource;
  applicationFeeInCents: number;
  sellerAmountInCents: number;
  mpFeePercent: number;
  totalFeePercent: number;
  platformFeePercent: number;
}

/**
 * Split residual (modelo "em mãos"):
 * 1. Vendedor recebe (100% − taxaTotal)% do bruto — ex.: 93% com taxa 7%.
 * 2. MP cobra primeiro → sobra netAvailable = bruto − mpFee.
 * 3. Plataforma (marketplace_fee) = netAvailable − repasseVendedor.
 *
 * Ex. R$ 100 Pix, MP R$ 0,99, taxa total 7%:
 *   vendedor = R$ 93 | em mãos = R$ 99,01 | plataforma = 99,01 − 93 = R$ 6,01
 */
@Injectable()
export class SplitCalculatorService {
  constructor(
    private platformSettings: PlatformSettingsService,
    private mpFeeEstimator: MpFeeEstimatorService,
  ) {}

  async calculate(
    grossInCents: number,
    paymentMethod: SplitPaymentMethod,
    installments = 1,
    sellerAccessToken?: string,
  ): Promise<MarketplaceSplitBreakdown> {
    const totalFeePercent = await this.platformSettings.getTotalFeePercent();
    const totalFeeInCents = Math.floor((grossInCents * totalFeePercent) / 100);

    const sellerAmountInCents = Math.max(0, grossInCents - totalFeeInCents);

    const mpEstimate = await this.mpFeeEstimator.estimate(
      grossInCents,
      paymentMethod,
      installments,
      sellerAccessToken,
    );

    return this.buildFromParts(
      grossInCents,
      sellerAmountInCents,
      mpEstimate.mpFeeInCents,
      mpEstimate.netAvailableInCents,
      mpEstimate.source,
      totalFeePercent,
    );
  }

  /** Recalcula com valor "em mãos" retornado pelo MP após o pagamento. */
  async calculateFromNetReceived(
    grossInCents: number,
    netReceivedInCents: number,
  ): Promise<MarketplaceSplitBreakdown> {
    const totalFeePercent = await this.platformSettings.getTotalFeePercent();
    const totalFeeInCents = Math.floor((grossInCents * totalFeePercent) / 100);
    const sellerAmountInCents = Math.max(0, grossInCents - totalFeeInCents);
    const mpSettlement = this.mpFeeEstimator.fromSettlement(
      grossInCents,
      netReceivedInCents,
    );

    return this.buildFromParts(
      grossInCents,
      sellerAmountInCents,
      mpSettlement.mpFeeInCents,
      mpSettlement.netAvailableInCents,
      'mp_settlement',
      totalFeePercent,
    );
  }

  getMpFeePercent(paymentMethod: SplitPaymentMethod, installments = 1): number {
    return this.mpFeeEstimator.getConfigRate(paymentMethod, installments);
  }

  private buildFromParts(
    grossInCents: number,
    sellerAmountInCents: number,
    mpFeeInCents: number,
    netAvailableInCents: number,
    mpFeeSource: MpFeeSource,
    totalFeePercent: number,
  ): MarketplaceSplitBreakdown {
    const applicationFeeInCents = Math.max(
      0,
      netAvailableInCents - sellerAmountInCents,
    );

    const mpFeePercent =
      grossInCents > 0
        ? Math.round((mpFeeInCents / grossInCents) * 10000) / 100
        : 0;
    const platformFeePercent =
      grossInCents > 0
        ? Math.round((applicationFeeInCents / grossInCents) * 10000) / 100
        : 0;

    return {
      grossInCents,
      netAvailableInCents,
      mpFeeInCents,
      mpFeeSource,
      applicationFeeInCents,
      sellerAmountInCents,
      mpFeePercent,
      totalFeePercent,
      platformFeePercent,
    };
  }
}
