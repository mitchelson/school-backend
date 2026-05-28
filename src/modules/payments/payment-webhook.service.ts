import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { MercadoPagoGateway } from '../../infrastructure/gateways/mercadopago/mercadopago.gateway';
import { PaymentCheckoutService } from './payment-checkout.service';

@Injectable()
export class PaymentWebhookService {
  private readonly logger = new Logger(PaymentWebhookService.name);

  constructor(
    private prisma: PrismaService,
    private gateway: MercadoPagoGateway,
    private checkoutService: PaymentCheckoutService,
  ) {}

  async handleMercadoPagoWebhook(
    rawBody: string,
    headers: Record<string, string | undefined>,
    query: Record<string, string | undefined>,
  ): Promise<{ message: string }> {
    // 1. Parse webhook to extract external ID
    const parsed = this.gateway.parseWebhook(rawBody, query);

    if (!parsed.shouldProcess) {
      this.logger.debug(`Webhook ignored: ${parsed.message}`);
      return { message: parsed.message ?? 'evento ignorado' };
    }

    const externalId = parsed.externalId!;

    // 2. Validate HMAC signature
    const dataId = query['data.id'] ?? externalId;
    const isValid = this.gateway.validateSignature(
      headers as Record<string, string>,
      dataId,
    );

    if (!isValid) {
      this.logger.warn(`Webhook signature invalid for ${externalId}`);
      throw new UnauthorizedException('Assinatura inválida');
    }

    // 3. Find payment by mpPaymentId (idempotency via UNIQUE constraint)
    const payment = await this.prisma.payment.findFirst({
      where: { mpPaymentId: externalId },
    });

    if (!payment) {
      // Try to find by external_reference (paymentId) via MP API
      const snapshot = await this.gateway.fetchPaymentStatus(externalId);
      if (!snapshot.externalReference) {
        this.logger.warn(`Payment not found for external ID: ${externalId}`);
        return { message: 'pagamento não encontrado' };
      }

      const paymentByRef = await this.prisma.payment.findUnique({
        where: { id: snapshot.externalReference },
      });

      if (!paymentByRef) {
        this.logger.warn(`Payment not found for ref: ${snapshot.externalReference}`);
        return { message: 'pagamento não encontrado' };
      }

      // Update mpPaymentId for future lookups
      if (!paymentByRef.mpPaymentId) {
        await this.prisma.payment.update({
          where: { id: paymentByRef.id },
          data: { mpPaymentId: externalId },
        });
      }

      return this.processPayment(paymentByRef.id, snapshot.status);
    }

    // 4. Idempotency: already paid? skip
    if (payment.status === 'paid') {
      this.logger.debug(`Payment ${payment.id} already fulfilled (idempotent)`);
      return { message: 'pagamento já confirmado' };
    }

    // 5. Confirm status via MP API (don't trust webhook payload alone)
    const snapshot = await this.gateway.fetchPaymentStatus(externalId);

    return this.processPayment(payment.id, snapshot.status);
  }

  private async processPayment(
    paymentId: string,
    gatewayStatus: 'approved' | 'pending' | 'rejected',
  ): Promise<{ message: string }> {
    if (gatewayStatus === 'approved') {
      const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
      const externalId = payment?.mpPaymentId;
      if (externalId) {
        await this.checkoutService.reconcileFeesFromMercadoPago(paymentId, externalId);
      }
      await this.checkoutService.fulfillPayment(paymentId);
      this.logger.log(`Payment ${paymentId} confirmed and fulfilled`);
      return { message: 'pagamento confirmado' };
    }

    if (gatewayStatus === 'rejected') {
      await this.prisma.payment.update({
        where: { id: paymentId },
        data: { status: 'failed' },
      });
      this.logger.log(`Payment ${paymentId} rejected`);
      return { message: 'pagamento rejeitado' };
    }

    // Still pending
    this.logger.debug(`Payment ${paymentId} still pending`);
    return { message: 'pagamento pendente' };
  }
}
