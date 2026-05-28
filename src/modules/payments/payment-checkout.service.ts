import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { MercadoPagoGateway } from '../../infrastructure/gateways/mercadopago/mercadopago.gateway';
import { MpSellerService } from '../marketplace/mp-seller.service';
import { PlatformSettingsService } from '../marketplace/platform-settings.service';
import { SplitCalculatorService } from '../marketplace/split-calculator.service';

@Injectable()
export class PaymentCheckoutService {
  private readonly logger = new Logger(PaymentCheckoutService.name);

  constructor(
    private prisma: PrismaService,
    private gateway: MercadoPagoGateway,
    private config: ConfigService,
    private mpSeller: MpSellerService,
    private platformSettings: PlatformSettingsService,
    private splitCalculator: SplitCalculatorService,
  ) {}

  /** Prévia do split para o aluno antes de pagar (não cria pagamento). */
  async previewSplit(amountInCents: number, paymentMethod: 'pix' | 'card', installments = 1) {
    let sellerToken: string | undefined;
    try {
      sellerToken = await this.mpSeller.getSellerAccessToken();
    } catch {
      sellerToken = undefined;
    }

    const breakdown = await this.splitCalculator.calculate(
      amountInCents,
      paymentMethod,
      installments,
      sellerToken,
    );

    return {
      ...breakdown,
      estimated: breakdown.mpFeeSource !== 'mp_settlement',
    };
  }

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

    const split = await this.buildSplit(plan.priceInCents, paymentMethod, installments);

    const payment = await this.prisma.payment.create({
      data: {
        studentId,
        planId,
        amountInCents: plan.priceInCents,
        applicationFeeInCents: split.applicationFeeInCents,
        mpFeeInCents: split.mpFeeInCents,
        netAvailableInCents: split.netAvailableInCents,
        sellerAmountInCents: split.sellerAmountInCents,
        paymentMethod,
        purpose: 'plan',
        status: 'pending',
      },
    });

    if (this.isDevSimulate()) {
      return this.devSimulateResponse(payment.id);
    }

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
      mercadopagoMarketplace: split.marketplace,
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

    const unitPrice = await this.platformSettings.getCreditUnitPriceCents();
    const amountInCents = quantity * unitPrice;
    const split = await this.buildSplit(amountInCents, paymentMethod, installments);

    const payment = await this.prisma.payment.create({
      data: {
        studentId,
        amountInCents,
        applicationFeeInCents: split.applicationFeeInCents,
        mpFeeInCents: split.mpFeeInCents,
        netAvailableInCents: split.netAvailableInCents,
        sellerAmountInCents: split.sellerAmountInCents,
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
      mercadopagoMarketplace: split.marketplace,
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

  /**
   * Após aprovação no MP: lê taxa real e atualiza split gravado (auditoria).
   */
  async reconcileFeesFromMercadoPago(paymentId: string, externalId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) return;

    const sellerToken = await this.mpSeller.getSellerAccessToken();
    const settlement = await this.gateway.fetchPaymentSettlement(
      externalId,
      sellerToken,
    );
    if (!settlement) {
      this.logger.debug(`No settlement data for payment ${paymentId}`);
      return;
    }

    const breakdown = await this.splitCalculator.calculateFromNetReceived(
      settlement.grossInCents,
      settlement.netReceivedInCents,
    );

    await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        mpFeeInCents: breakdown.mpFeeInCents,
        netAvailableInCents: breakdown.netAvailableInCents,
        applicationFeeInCents: breakdown.applicationFeeInCents,
        sellerAmountInCents: breakdown.sellerAmountInCents,
        feeReconciledAt: new Date(),
      },
    });

    const estMp = payment.mpFeeInCents ?? 0;
    const delta = breakdown.mpFeeInCents - estMp;
    if (Math.abs(delta) > 1) {
      this.logger.warn(
        `Payment ${paymentId}: MP fee reconciled ${estMp} → ${breakdown.mpFeeInCents} cents (Δ${delta})`,
      );
    } else {
      this.logger.log(
        `Payment ${paymentId}: fees reconciled (mp=${breakdown.mpFeeInCents}, platform=${breakdown.applicationFeeInCents})`,
      );
    }
  }

  private async buildSplit(
    amountInCents: number,
    paymentMethod: 'pix' | 'card',
    installments?: number,
  ) {
    await this.mpSeller.requireMpConnected();
    const sellerToken = await this.mpSeller.getSellerAccessToken();
    const breakdown = await this.splitCalculator.calculate(
      amountInCents,
      paymentMethod,
      installments,
      sellerToken,
    );

    this.logger.log(
      `Split ${paymentMethod} (${breakdown.mpFeeSource}): gross=${breakdown.grossInCents} ` +
        `mp=${breakdown.mpFeeInCents} net=${breakdown.netAvailableInCents} ` +
        `platform=${breakdown.applicationFeeInCents} seller=${breakdown.sellerAmountInCents}`,
    );

    return {
      ...breakdown,
      marketplace: {
        applicationFeeInCents: breakdown.applicationFeeInCents,
        sellerAccessToken: sellerToken,
      },
    };
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
