import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  buildMpPaymentBody,
  type MpPaymentItemInput,
  type MpPayerInput,
} from './mercadopago-payment.builder';

export interface MercadoPagoMarketplaceSplit {
  applicationFeeInCents: number;
  sellerAccessToken: string;
}

export interface CheckoutInput {
  paymentId: string;
  items: MpPaymentItemInput[];
  payer: MpPayerInput;
  paymentMethod: 'pix' | 'card';
  cardToken?: string;
  installments?: number;
  paymentMethodId?: string;
  deviceSessionId?: string;
  mercadopagoMarketplace?: MercadoPagoMarketplaceSplit;
}

export interface CheckoutResult {
  externalId: string;
  qrCode?: string;
  qrCodeBase64?: string;
  immediatelyApproved?: boolean;
}

export interface PaymentSnapshot {
  externalId: string;
  externalReference: string;
  status: 'approved' | 'pending' | 'rejected';
}

/** Valores reais após liquidação MP (para reconciliar split). */
export interface PaymentSettlementSnapshot {
  grossInCents: number;
  /** Valor disponível após taxa MP, antes do application_fee. */
  netReceivedInCents: number;
  mpFeeInCents: number;
  /** Comissão marketplace creditada à conta da aplicação (centavos), se informada pelo MP. */
  marketplaceFeeInCents: number;
  paymentId: string;
}

@Injectable()
export class MercadoPagoGateway {
  private readonly logger = new Logger(MercadoPagoGateway.name);
  private readonly apiBase = 'https://api.mercadopago.com';

  constructor(private config: ConfigService) {}

  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    const body = this.buildPaymentBody(input);
    this.logApplicationFee(body, input.paymentId);

    const payment = await this.postPayment(
      body,
      input.paymentId,
      input.mercadopagoMarketplace?.sellerAccessToken,
      input.deviceSessionId,
    );

    if (input.paymentMethod === 'pix') {
      const txData = payment.point_of_interaction?.transaction_data;
      const qrCode = txData?.qr_code;
      if (!qrCode) {
        throw new Error('Mercado Pago não retornou QR Code Pix');
      }

      return {
        externalId: String(payment.id),
        qrCode,
        qrCodeBase64: txData?.qr_code_base64,
      };
    }

    return {
      externalId: String(payment.id),
      immediatelyApproved: payment.status === 'approved',
    };
  }

  /**
   * Busca taxas reais do pagamento (GET /v1/payments ou order legada ORD…).
   */
  async fetchPaymentSettlement(
    externalId: string,
    bearerToken?: string,
  ): Promise<PaymentSettlementSnapshot | null> {
    try {
      const token = bearerToken?.trim() || this.getAccessToken();
      if (externalId.startsWith('ORD')) {
        return this.fetchOrderSettlement(externalId, token);
      }
      return this.fetchPaymentSettlementById(externalId, token);
    } catch (err) {
      this.logger.warn(`Settlement fetch failed for ${externalId}: ${err}`);
      return null;
    }
  }

  async fetchPaymentStatus(
    externalId: string,
    bearerToken?: string,
  ): Promise<PaymentSnapshot> {
    const token = bearerToken?.trim() || this.getAccessToken();

    if (externalId.startsWith('ORD')) {
      return this.fetchOrderPaymentStatus(externalId, token);
    }

    const response = await fetch(`${this.apiBase}/v1/payments/${externalId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      throw new Error(`MP API retornou ${response.status}`);
    }

    const data = await response.json();

    return {
      externalId: String(data.id),
      externalReference: data.external_reference ?? '',
      status: this.mapPaymentStatus(data.status),
    };
  }

  /**
   * Parse incoming webhook payload. Returns the external ID to look up.
   */
  parseWebhook(rawBody: string, query: Record<string, string | undefined>): {
    shouldProcess: boolean;
    externalId?: string;
    message?: string;
  } {
    let payload: Record<string, any>;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return { shouldProcess: false, message: 'payload inválido' };
    }

    const topic = payload.topic ?? payload.type ?? '';
    const action = payload.action ?? '';

    const isPayment = topic === 'payment' || action.startsWith('payment.');
    const isOrder = topic === 'order';

    if (!isPayment && !isOrder) {
      return { shouldProcess: false, message: `evento ignorado: ${topic || action}` };
    }

    const externalId = String(payload.data?.id ?? query['data.id'] ?? '');
    if (!externalId) {
      return { shouldProcess: false, message: 'id ausente' };
    }

    return { shouldProcess: true, externalId };
  }

  /**
   * `data.id` da query string (como o MP assina). IDs alfanuméricos (ex. ORD…) vão em minúsculas.
   */
  resolveWebhookDataId(
    query: Record<string, string | undefined>,
    fallbackFromBody?: string,
  ): string {
    const raw = query['data.id'] ?? query['data_id'] ?? fallbackFromBody ?? '';
    const id = String(raw).trim();
    if (!id) return '';
    return /[a-zA-Z]/.test(id) ? id.toLowerCase() : id;
  }

  validateSignature(headers: Record<string, string | undefined>, dataId: string): boolean {
    const secret = this.config.get<string>('MERCADOPAGO_WEBHOOK_SECRET')?.trim();
    if (!secret) {
      return process.env.NODE_ENV !== 'production';
    }

    const normalizedHeaders = Object.fromEntries(
      Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
    );
    const xSignature = normalizedHeaders['x-signature'] ?? '';
    const xRequestId = normalizedHeaders['x-request-id'] ?? '';

    if (!xSignature || !dataId) return false;

    const parts = Object.fromEntries(
      xSignature.split(',').map((p) => {
        const [k, ...v] = p.split('=');
        return [k.trim(), v.join('=').trim()];
      }),
    );

    const ts = parts['ts'];
    const v1 = parts['v1'];
    if (!ts || !v1) return false;

    const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
    const { createHmac, timingSafeEqual } = require('node:crypto');
    const computed = createHmac('sha256', secret).update(manifest).digest('hex');

    try {
      return timingSafeEqual(Buffer.from(computed), Buffer.from(v1));
    } catch {
      return false;
    }
  }

  private mapPaymentStatus(status: string): 'approved' | 'pending' | 'rejected' {
    if (status === 'approved') return 'approved';
    if (status === 'rejected' || status === 'cancelled') return 'rejected';
    return 'pending';
  }

  /** Compatibilidade com pagamentos legados criados via Orders API (ORD…). */
  private async fetchOrderPaymentStatus(
    orderId: string,
    token: string,
  ): Promise<PaymentSnapshot> {
    const response = await fetch(`${this.apiBase}/v1/orders/${orderId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      throw new Error(`MP API retornou ${response.status}`);
    }

    const data = await response.json();
    const payId = data.transactions?.payments?.[0]?.id;

    return {
      externalId: payId ? String(payId) : orderId,
      externalReference: data.external_reference ?? '',
      status: this.mapOrderStatus(data.status),
    };
  }

  private async fetchOrderSettlement(
    orderId: string,
    token: string,
  ): Promise<PaymentSettlementSnapshot | null> {
    const response = await fetch(`${this.apiBase}/v1/orders/${orderId}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!response.ok) return null;

    const order = (await response.json()) as Record<string, any>;
    const payId = order.transactions?.payments?.[0]?.id;
    if (!payId) return null;

    const numericId = String(payId);
    if (/^\d+$/.test(numericId)) {
      return this.fetchPaymentSettlementById(numericId, token);
    }
    return null;
  }

  private async fetchPaymentSettlementById(
    paymentId: string,
    token: string,
  ): Promise<PaymentSettlementSnapshot | null> {
    const response = await fetch(`${this.apiBase}/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!response.ok) return null;

    const payment = (await response.json()) as Record<string, any>;
    const gross = Number(payment.transaction_amount ?? 0);
    if (!gross) return null;

    const grossInCents = Math.round(gross * 100);
    const netRaw =
      payment.transaction_details?.net_received_amount ??
      payment.net_received_amount;
    let netReceivedInCents = netRaw != null ? Math.round(Number(netRaw) * 100) : 0;

    const feeDetails = (payment.fee_details ?? []) as Array<{
      amount?: number;
      type?: string;
    }>;
    const feesSum = feeDetails.reduce(
      (sum, f) => sum + Math.round(Number(f.amount ?? 0) * 100),
      0,
    );
    const marketplaceFeeInCents = feeDetails.reduce((sum, f) => {
      const type = (f.type ?? '').toLowerCase();
      if (type.includes('marketplace') || type === 'application_fee') {
        return sum + Math.round(Number(f.amount ?? 0) * 100);
      }
      return sum;
    }, 0);

    if (!netReceivedInCents && feesSum > 0) {
      netReceivedInCents = Math.max(0, grossInCents - feesSum);
    }
    if (!netReceivedInCents) return null;

    const mpFeeInCents = Math.max(0, grossInCents - netReceivedInCents);

    return {
      grossInCents,
      netReceivedInCents,
      mpFeeInCents,
      marketplaceFeeInCents,
      paymentId: String(payment.id ?? paymentId),
    };
  }

  private logApplicationFee(body: Record<string, unknown>, paymentId: string): void {
    const fee = body.application_fee;
    if (fee != null && fee !== '' && Number(fee) > 0) {
      this.logger.log(`MP payment ${paymentId}: application_fee=${fee}`);
      return;
    }
    this.logger.warn(
      `MP payment ${paymentId}: application_fee ausente — split da plataforma não será aplicado`,
    );
  }

  private mapOrderStatus(status: string): 'approved' | 'pending' | 'rejected' {
    if (status === 'processed') return 'approved';
    if (status === 'cancelled' || status === 'expired' || status === 'reverted') return 'rejected';
    return 'pending';
  }

  private buildPaymentBody(input: CheckoutInput): Record<string, unknown> {
    if (input.paymentMethod === 'card' && !input.cardToken) {
      throw new Error('Token do cartão é obrigatório');
    }

    return buildMpPaymentBody({
      paymentId: input.paymentId,
      items: input.items,
      payer: input.payer,
      paymentMethod: input.paymentMethod,
      statementDescriptor: this.getStatementDescriptor(),
      cardToken: input.cardToken,
      paymentMethodId: input.paymentMethodId,
      installments: input.installments,
      applicationFee: this.resolveApplicationFee(input),
    });
  }

  private getStatementDescriptor(): string {
    return (
      this.config.get<string>('MERCADOPAGO_STATEMENT_DESCRIPTOR')?.trim() || 'CT095'
    ).slice(0, 50);
  }

  private resolveApplicationFee(input: CheckoutInput): number | null {
    const split = input.mercadopagoMarketplace;
    if (!split || split.applicationFeeInCents <= 0) return null;
    if (!split.sellerAccessToken?.trim()) {
      throw new Error('Split Mercado Pago exige token do vendedor (admin conectado).');
    }
    return split.applicationFeeInCents / 100;
  }

  private async postPayment(
    body: Record<string, unknown>,
    idempotencyKey: string,
    sellerAccessToken?: string,
    deviceSessionId?: string,
  ): Promise<Record<string, any>> {
    const bearer = sellerAccessToken?.trim() || this.getAccessToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${bearer}`,
      'X-Idempotency-Key': idempotencyKey,
    };
    const sessionId = deviceSessionId?.trim();
    if (sessionId) {
      headers['X-meli-session-id'] = sessionId;
    }

    const response = await fetch(`${this.apiBase}/v1/payments`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      this.logger.error(`MP Payments API error ${response.status}: ${errText.slice(0, 800)}`);
      throw new Error(`Mercado Pago retornou ${response.status}`);
    }

    return response.json();
  }

  private getAccessToken(): string {
    const token = this.config.get<string>('MERCADOPAGO_ACCESS_TOKEN');
    if (!token) throw new Error('MERCADOPAGO_ACCESS_TOKEN não configurado');
    return token;
  }
}
