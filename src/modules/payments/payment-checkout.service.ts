import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { MercadoPagoGateway } from '../../infrastructure/gateways/mercadopago/mercadopago.gateway';

const CREDIT_UNIT_PRICE_CENTS = 3000; // R$30 per credit

@Injectable()
export class PaymentCheckoutService {
  private readonly logger = new Logger(PaymentCheckoutService.name);

  constructor(
    private prisma: PrismaService,
    private gateway: MercadoPagoGateway,
    private config: ConfigService,
  ) {}

  async subscribeToPlan(
    studentId: string,
    planId: string,
    paymentMethod: 'pix' | 'card',
    cardToken?: string,
    installments?: number,
    paymentMethodId?: string,
  ) {
    const plan = await this.prisma.plan.findUnique({ where: { id: planId } });
    if (!plan || !plan.active) {
      throw new BadRequestException('Plano não encontrado ou inativo');
    }

    const student = await this.prisma.user.findUnique({ where: { id: studentId } });
    if (!student) throw new BadRequestException('Aluno não encontrado');

    // Create payment record
    const payment = await this.prisma.payment.create({
      data: {
        studentId,
        planId,
        amountInCents: plan.priceInCents,
        paymentMethod,
        purpose: 'plan',
        status: 'pending',
      },
    });

    // Dev simulate mode
    if (this.isDevSimulate()) {
      return this.devSimulateResponse(payment.id);
    }

    // Call Mercado Pago
    const result = await this.gateway.createCheckout({
      paymentId: payment.id,
      amountInCents: plan.priceInCents,
      description: `Plano ${plan.name} - CT095`,
      payerEmail: student.email,
      payerName: student.fullName,
      paymentMethod,
      cardToken,
      installments,
      paymentMethodId,
    });

    // Save external ID
    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { mpPaymentId: result.orderExternalId ?? result.externalId },
    });

    // If card was immediately approved, fulfill now
    if (result.immediatelyApproved) {
      await this.fulfillPayment(payment.id);
      return { paymentId: payment.id, mode: 'card_paid' as const, paid: true };
    }

    return {
      paymentId: payment.id,
      mode: paymentMethod === 'pix' ? ('pix' as const) : ('card_pending' as const),
      qrCode: result.qrCode,
      qrCodeBase64: result.qrCodeBase64,
    };
  }

  async purchaseCredits(
    studentId: string,
    quantity: number,
    paymentMethod: 'pix' | 'card',
    cardToken?: string,
    installments?: number,
    paymentMethodId?: string,
  ) {
    const student = await this.prisma.user.findUnique({ where: { id: studentId } });
    if (!student) throw new BadRequestException('Aluno não encontrado');

    const amountInCents = quantity * CREDIT_UNIT_PRICE_CENTS;

    const payment = await this.prisma.payment.create({
      data: {
        studentId,
        amountInCents,
        paymentMethod,
        purpose: 'credits',
        creditQuantity: quantity,
        status: 'pending',
      },
    });

    if (this.isDevSimulate()) {
      return this.devSimulateResponse(payment.id);
    }

    const result = await this.gateway.createCheckout({
      paymentId: payment.id,
      amountInCents,
      description: `${quantity} crédito${quantity > 1 ? 's' : ''} - CT095`,
      payerEmail: student.email,
      payerName: student.fullName,
      paymentMethod,
      cardToken,
      installments,
      paymentMethodId,
    });

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { mpPaymentId: result.orderExternalId ?? result.externalId },
    });

    if (result.immediatelyApproved) {
      await this.fulfillPayment(payment.id);
      return { paymentId: payment.id, mode: 'card_paid' as const, paid: true };
    }

    return {
      paymentId: payment.id,
      mode: paymentMethod === 'pix' ? ('pix' as const) : ('card_pending' as const),
      qrCode: result.qrCode,
      qrCodeBase64: result.qrCodeBase64,
    };
  }

  /**
   * Fulfill a confirmed payment: activate subscription or add credits.
   * Called by webhook handler or immediately after card approval.
   */
  async fulfillPayment(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment || payment.status === 'paid') return; // Idempotent

    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      // Mark as paid
      await tx.payment.update({
        where: { id: paymentId },
        data: { status: 'paid', paidAt: now },
      });

      if (payment.purpose === 'plan' && payment.planId) {
        // Activate/reactivate subscription with validUntil = now + 30 days
        const validUntil = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

        await tx.subscription.upsert({
          where: { studentId: payment.studentId },
          update: { planId: payment.planId, status: 'active', validUntil },
          create: {
            studentId: payment.studentId,
            planId: payment.planId,
            status: 'active',
            validUntil,
          },
        });
      } else if (payment.purpose === 'credits' && payment.creditQuantity) {
        // Add credits to balance
        await tx.studentTokenBalance.upsert({
          where: { studentId: payment.studentId },
          update: { balance: { increment: payment.creditQuantity } },
          create: { studentId: payment.studentId, balance: payment.creditQuantity },
        });
      }
    });

    this.logger.log(`Payment ${paymentId} fulfilled (${payment.purpose})`);
  }

  private isDevSimulate(): boolean {
    return this.config.get<string>('MP_DEV_SIMULATE') === 'true';
  }

  private devSimulateResponse(paymentId: string) {
    return {
      paymentId,
      mode: 'pix' as const,
      qrCode: '00020126580014BR.GOV.BCB.PIX0136simulacao-dev',
      qrCodeBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNjN9GQAAAABJRU5ErkJggg==',
      devSimulate: true,
    };
  }
}
