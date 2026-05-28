import { Injectable, Logger } from '@nestjs/common';
import { PlatformSettingsService } from './platform-settings.service';
import { SplitPaymentMethod } from './split-calculator.service';

export type MpFeeSource = 'config' | 'mp_api' | 'mp_settlement';

export interface MpFeeEstimate {
  mpFeeInCents: number;
  netAvailableInCents: number;
  source: MpFeeSource;
}

@Injectable()
export class MpFeeEstimatorService {
  private readonly logger = new Logger(MpFeeEstimatorService.name);
  private readonly apiBase = 'https://api.mercadopago.com';

  constructor(private platformSettings: PlatformSettingsService) {}

  /**
   * Estimativa antes do pagamento (taxa % do banco ou API de parcelas no cartão).
   */
  async estimate(
    grossInCents: number,
    paymentMethod: SplitPaymentMethod,
    installments = 1,
    accessToken?: string,
  ): Promise<MpFeeEstimate> {
    if (paymentMethod === 'card' && accessToken) {
      const fromApi = await this.tryInstallmentsFee(
        grossInCents,
        installments,
        accessToken,
      );
      if (fromApi) return fromApi;
    }

    return this.estimateFromSettings(grossInCents, paymentMethod, installments);
  }

  /**
   * Após pagamento: deriva taxa MP do que sobrou em relação ao bruto.
   */
  fromSettlement(grossInCents: number, netReceivedInCents: number): MpFeeEstimate {
    const mpFeeInCents = Math.max(0, grossInCents - netReceivedInCents);
    return {
      mpFeeInCents,
      netAvailableInCents: netReceivedInCents,
      source: 'mp_settlement',
    };
  }

  async estimateFromSettings(
    grossInCents: number,
    paymentMethod: SplitPaymentMethod,
    installments = 1,
  ): Promise<MpFeeEstimate> {
    const rate = await this.getConfigRate(paymentMethod, installments);
    const mpFeeInCents = Math.round((grossInCents * rate) / 100);
    return {
      mpFeeInCents,
      netAvailableInCents: Math.max(0, grossInCents - mpFeeInCents),
      source: 'config',
    };
  }

  async getConfigRate(
    paymentMethod: SplitPaymentMethod,
    installments = 1,
  ): Promise<number> {
    return this.platformSettings.getMpFeePercent(paymentMethod, installments);
  }

  private async tryInstallmentsFee(
    grossInCents: number,
    installments: number,
    accessToken: string,
  ): Promise<MpFeeEstimate | null> {
    const amount = (grossInCents / 100).toFixed(2);
    const params = new URLSearchParams({
      amount,
      installments: String(Math.max(1, installments)),
      payment_method_id: 'credit_card',
    });

    try {
      const response = await fetch(
        `${this.apiBase}/v1/payment_methods/installments?${params}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: 'no-store',
        },
      );

      if (!response.ok) return null;

      const data = (await response.json()) as Array<{
        payer_costs?: Array<{
          installments: number;
          total_amount?: number;
        }>;
      }>;

      const entry = data[0]?.payer_costs?.find(
        (c) => c.installments === installments,
      );
      if (!entry?.total_amount) return null;

      const totalPaidCents = Math.round(entry.total_amount * 100);
      const mpFeeInCents = Math.max(0, totalPaidCents - grossInCents);
      if (mpFeeInCents <= 0) return null;

      return {
        mpFeeInCents,
        netAvailableInCents: grossInCents,
        source: 'mp_api',
      };
    } catch (err) {
      this.logger.debug(`MP installments fee lookup failed: ${err}`);
      return null;
    }
  }
}
