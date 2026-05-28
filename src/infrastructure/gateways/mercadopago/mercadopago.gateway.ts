import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface MercadoPagoMarketplaceSplit {
  applicationFeeInCents: number;
  sellerAccessToken: string;
}

export interface CheckoutInput {
  paymentId: string;
  amountInCents: number;
  description: string;
  payerEmail: string;
  payerName?: string;
  paymentMethod: 'pix' | 'card';
  cardToken?: string;
  installments?: number;
  paymentMethodId?: string;
  mercadopagoMarketplace?: MercadoPagoMarketplaceSplit;
}

export interface CheckoutResult {
  externalId: string;
  orderExternalId?: string;
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
  /** Valor disponível após taxa MP, antes do marketplace_fee. */
  netReceivedInCents: number;
  mpFeeInCents: number;
  paymentId: string;
}

@Injectable()
export class MercadoPagoGateway {
  private readonly logger = new Logger(MercadoPagoGateway.name);
  private readonly apiBase = 'https://api.mercadopago.com';

  constructor(private config: ConfigService) {}

  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    if (input.paymentMethod === 'card') {
      return this.createCardPayment(input);
    }
    return this.createPixOrder(input);
  }

  /**
   * Pix via Orders API (POST /v1/orders).
   * Returns QR code for the student to scan.
   */
  private async createPixOrder(input: CheckoutInput): Promise<CheckoutResult> {
    const amountStr = (input.amountInCents / 100).toFixed(2);
    const marketplaceFee = this.resolveMarketplaceFee(input);

    const body: Record<string, unknown> = {
      type: 'online',
      processing_mode: 'automatic',
      external_reference: input.paymentId,
      total_amount: amountStr,
      description: input.description.slice(0, 255),
      payer: { email: input.payerEmail },
      transactions: {
        payments: [
          {
            amount: amountStr,
            payment_method: { id: 'pix', type: 'bank_transfer' },
            expiration_time: 'PT1H',
          },
        ],
      },
      ...(marketplaceFee != null ? { marketplace_fee: marketplaceFee } : {}),
    };

    const order = await this.postOrder(
      body,
      input.paymentId,
      input.mercadopagoMarketplace?.sellerAccessToken,
    );
    const payment = order.transactions?.payments?.[0];

    if (!payment?.payment_method?.qr_code) {
      throw new Error('Mercado Pago não retornou QR Code Pix');
    }

    return {
      externalId: payment.id,
      orderExternalId: order.id,
      qrCode: payment.payment_method.qr_code,
      qrCodeBase64: payment.payment_method.qr_code_base64,
    };
  }

  /**
   * Card via Orders API (POST /v1/orders).
   * May be immediately approved.
   */
  private async createCardPayment(input: CheckoutInput): Promise<CheckoutResult> {
    if (!input.cardToken) throw new Error('Token do cartão é obrigatório');

    const amountStr = (input.amountInCents / 100).toFixed(2);
    const marketplaceFee = this.resolveMarketplaceFee(input);

    const body: Record<string, unknown> = {
      type: 'online',
      processing_mode: 'automatic',
      external_reference: input.paymentId,
      total_amount: amountStr,
      description: input.description.slice(0, 255),
      payer: { email: input.payerEmail },
      transactions: {
        payments: [
          {
            amount: amountStr,
            payment_method: {
              id: input.paymentMethodId || 'master',
              type: 'credit_card',
              token: input.cardToken,
              installments: input.installments ?? 1,
            },
          },
        ],
      },
      ...(marketplaceFee != null ? { marketplace_fee: marketplaceFee } : {}),
    };

    const order = await this.postOrder(
      body,
      input.paymentId,
      input.mercadopagoMarketplace?.sellerAccessToken,
    );
    const payment = order.transactions?.payments?.[0];

    const payStatus = (payment?.status ?? '').toLowerCase();
    const ordStatus = (order.status ?? '').toLowerCase();

    return {
      externalId: payment?.id ?? order.id,
      orderExternalId: order.id,
      immediatelyApproved: payStatus === 'approved' || ordStatus === 'processed',
    };
  }

  /**
   * Fetch payment status from MP API (used during webhook processing to confirm).
   */
  /**
   * Busca taxas reais do pagamento (GET payment ou payment dentro da order).
   * net_received ≈ valor "em mãos" após MP descontar a taxa de processamento.
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

  async fetchPaymentStatus(externalId: string): Promise<PaymentSnapshot> {
    const isOrder = externalId.startsWith('ORD');
    const url = isOrder
      ? `${this.apiBase}/v1/orders/${externalId}`
      : `${this.apiBase}/v1/payments/${externalId}`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${this.getAccessToken()}` },
    });

    if (!response.ok) {
      throw new Error(`MP API retornou ${response.status}`);
    }

    const data = await response.json();

    if (isOrder) {
      const status = this.mapOrderStatus(data.status);
      return {
        externalId: data.transactions?.payments?.[0]?.id ?? externalId,
        externalReference: data.external_reference ?? '',
        status,
      };
    }

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
   * Validate webhook HMAC signature.
   * MP sends: x-signature: ts=...,v1=...
   * Manifest: id:{data.id};request-id:{x-request-id};ts:{ts};
   */
  validateSignature(headers: Record<string, string | undefined>, dataId: string): boolean {
    const secret = this.config.get<string>('MERCADOPAGO_WEBHOOK_SECRET');
    if (!secret) return true; // No secret configured = skip validation (dev mode)

    const xSignature = headers['x-signature'] ?? '';
    const xRequestId = headers['x-request-id'] ?? '';

    if (!xSignature) return false;

    // Parse ts and v1 from x-signature header
    const parts = Object.fromEntries(
      xSignature.split(',').map((p) => {
        const [k, ...v] = p.split('=');
        return [k.trim(), v.join('=').trim()];
      }),
    );

    const ts = parts['ts'];
    const v1 = parts['v1'];
    if (!ts || !v1) return false;

    // Build manifest and compute HMAC
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

    return this.fetchPaymentSettlementById(String(payId), token);
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

    const feeDetails = (payment.fee_details ?? []) as Array<{ amount?: number }>;
    const feesSum = feeDetails.reduce(
      (sum, f) => sum + Math.round(Number(f.amount ?? 0) * 100),
      0,
    );

    if (!netReceivedInCents && feesSum > 0) {
      netReceivedInCents = Math.max(0, grossInCents - feesSum);
    }
    if (!netReceivedInCents) return null;

    const mpFeeInCents = Math.max(0, grossInCents - netReceivedInCents);

    return {
      grossInCents,
      netReceivedInCents,
      mpFeeInCents,
      paymentId: String(payment.id ?? paymentId),
    };
  }

  private mapOrderStatus(status: string): 'approved' | 'pending' | 'rejected' {
    if (status === 'processed') return 'approved';
    if (status === 'cancelled' || status === 'expired' || status === 'reverted') return 'rejected';
    return 'pending';
  }

  private resolveMarketplaceFee(input: CheckoutInput): string | null {
    const split = input.mercadopagoMarketplace;
    if (!split || split.applicationFeeInCents <= 0) return null;
    if (!split.sellerAccessToken?.trim()) {
      throw new Error('Split Mercado Pago exige token do vendedor (admin conectado).');
    }
    return (split.applicationFeeInCents / 100).toFixed(2);
  }

  private async postOrder(
    body: Record<string, unknown>,
    idempotencyKey: string,
    sellerAccessToken?: string,
  ): Promise<Record<string, any>> {
    const bearer = sellerAccessToken?.trim() || this.getAccessToken();
    const response = await fetch(`${this.apiBase}/v1/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bearer}`,
        'X-Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      this.logger.error(`MP Orders API error ${response.status}: ${errText.slice(0, 200)}`);
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
