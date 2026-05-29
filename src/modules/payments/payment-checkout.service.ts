import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { MercadoPagoGateway } from '../../infrastructure/gateways/mercadopago/mercadopago.gateway';
import type { MpPayerInput } from '../../infrastructure/gateways/mercadopago/mercadopago-payment.builder';
import { MpSellerService } from '../marketplace/mp-seller.service';
import { PlatformSettingsService } from '../marketplace/platform-settings.service';
import { SplitCalculatorService } from '../marketplace/split-calculator.service';
import { SubscriptionMaintenanceService } from '../subscriptions/subscription-maintenance.service';
import { computeRenewedValidUntil } from '../subscriptions/subscription.utils';

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
    private subscriptionMaintenance: SubscriptionMaintenanceService,
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
    deviceSessionId?: string,
    payerIdentificationType?: 'CPF' | 'CNPJ',
    payerIdentificationNumber?: string,
  ) {
    const plan = await this.prisma.plan.findUnique({ where: { id: planId } });
    if (!plan || !plan.active) {
      throw new BadRequestException('Plano não encontrado ou inativo');
    }

    await this.subscriptionMaintenance.assertCanPurchasePlan(studentId);

    const student = await this.prisma.user.findUnique({ where: { id: studentId } });
    if (!student) throw new BadRequestException('Aluno não encontrado');

    if (paymentMethod === 'card' && !cardToken?.trim()) {
      throw new BadRequestException('Token do cartão é obrigatório para pagamento com cartão');
    }

    const split = await this.buildSplit(plan.priceInCents, paymentMethod, installments);

    await this.cancelPendingPayments(studentId);

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
      paymentMethod,
      cardToken,
      installments,
      paymentMethodId,
      deviceSessionId,
      payer: this.buildPayer(student, payerIdentificationType, payerIdentificationNumber),
      items: [
        {
          title: `Plano ${plan.name} - CT095`,
          quantity: 1,
          unitPriceInCents: plan.priceInCents,
          externalCode: plan.id,
        },
      ],
      mercadopagoMarketplace: split.marketplace,
    });

    await this.saveCheckoutResult(payment.id, result, paymentMethod);

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
    deviceSessionId?: string,
    payerIdentificationType?: 'CPF' | 'CNPJ',
    payerIdentificationNumber?: string,
  ) {
    const student = await this.prisma.user.findUnique({ where: { id: studentId } });
    if (!student) throw new BadRequestException('Aluno não encontrado');

    if (paymentMethod === 'card' && !cardToken?.trim()) {
      throw new BadRequestException('Token do cartão é obrigatório para pagamento com cartão');
    }

    const unitPrice = await this.platformSettings.getCreditUnitPriceCents();
    const amountInCents = quantity * unitPrice;
    const split = await this.buildSplit(amountInCents, paymentMethod, installments);

    await this.cancelPendingPayments(studentId);

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
      paymentMethod,
      cardToken,
      installments,
      paymentMethodId,
      deviceSessionId,
      payer: this.buildPayer(student, payerIdentificationType, payerIdentificationNumber),
      items: [
        {
          title: 'Crédito avulso CT095',
          quantity,
          unitPriceInCents: unitPrice,
          externalCode: `credits-x${quantity}`,
        },
      ],
      mercadopagoMarketplace: split.marketplace,
    });

    await this.saveCheckoutResult(payment.id, result, paymentMethod);

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

  /** Cancela um Pix abandonado pelo aluno (não libera plano/créditos). */
  async cancelPendingPayment(studentId: string, paymentId: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, studentId },
    });
    if (!payment || payment.status !== 'pending') {
      return { ok: true };
    }

    await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: 'cancelled',
        pixQrCode: null,
        pixQrCodeBase64: null,
      },
    });

    this.logger.log(`Payment ${paymentId} cancelled by student ${studentId}`);
    return { ok: true };
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
        const existing = await tx.subscription.findUnique({
          where: { studentId: payment.studentId },
        });
        const validUntil = computeRenewedValidUntil(existing?.validUntil, now);

        await tx.subscription.upsert({
          where: { studentId: payment.studentId },
          update: {
            planId: payment.planId,
            status: 'active',
            validUntil,
            lastExpiryNoticeValidUntil: null,
          },
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

    const expectedPlatformFee = payment.applicationFeeInCents ?? 0;
    if (
      expectedPlatformFee > 0 &&
      settlement.marketplaceFeeInCents === 0
    ) {
      this.logger.warn(
        `Payment ${paymentId}: esperava application_fee ~${expectedPlatformFee}c no MP, mas fee_details não reportou comissão — verifique app Marketplace e OAuth da escola`,
      );
    }

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

    const totalFeePercent = await this.platformSettings.getTotalFeePercent();
    if (totalFeePercent > 0 && breakdown.applicationFeeInCents <= 0) {
      this.logger.warn(
        `Split ${paymentMethod}: taxa configurada ${totalFeePercent}% mas application_fee=0 ` +
          `(gross=${amountInCents}c net=${breakdown.netAvailableInCents}c seller=${breakdown.sellerAmountInCents}c)`,
      );
    } else if (breakdown.applicationFeeInCents > 0) {
      this.logger.log(
        `Split ${paymentMethod} (${breakdown.mpFeeSource}): gross=${breakdown.grossInCents} ` +
          `mp=${breakdown.mpFeeInCents} net=${breakdown.netAvailableInCents} ` +
          `platform=${breakdown.applicationFeeInCents} seller=${breakdown.sellerAmountInCents}`,
      );
    }

    return {
      ...breakdown,
      marketplace: {
        applicationFeeInCents: breakdown.applicationFeeInCents,
        sellerAccessToken: sellerToken,
      },
    };
  }

  private buildPayer(
    student: {
      email: string;
      fullName: string;
      phone: string | null;
      cpf?: string | null;
      createdAt: Date;
    },
    identificationType?: 'CPF' | 'CNPJ',
    identificationNumber?: string,
  ): MpPayerInput {
    const identification = this.resolvePayerIdentification(
      student,
      identificationType,
      identificationNumber,
    );
    if (!identification && !this.isDevSimulate()) {
      throw new BadRequestException(
        'Informe seu CPF para concluir o pagamento (perfil ou no checkout).',
      );
    }

    const payer: MpPayerInput = {
      email: student.email,
      fullName: student.fullName,
      phone: student.phone,
      createdAt: student.createdAt,
    };
    if (identification) {
      payer.identification = identification;
    }
    return payer;
  }

  private resolvePayerIdentification(
    student: { cpf?: string | null },
    identificationType?: 'CPF' | 'CNPJ',
    identificationNumber?: string,
  ): { type: string; number: string } | undefined {
    const digits =
      identificationNumber?.replace(/\D/g, '') || student.cpf?.replace(/\D/g, '') || '';
    if (!digits) return undefined;
    return {
      type: identificationType ?? 'CPF',
      number: digits,
    };
  }

  private async cancelPendingPayments(studentId: string) {
    await this.prisma.payment.updateMany({
      where: { studentId, status: 'pending' },
      data: {
        status: 'cancelled',
        pixQrCode: null,
        pixQrCodeBase64: null,
      },
    });
  }

  private async saveCheckoutResult(
    paymentId: string,
    result: { externalId: string; qrCode?: string; qrCodeBase64?: string },
    paymentMethod: 'pix' | 'card',
  ) {
    await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        mpPaymentId: result.externalId,
        ...(paymentMethod === 'pix'
          ? {
              pixQrCode: result.qrCode ?? null,
              pixQrCodeBase64: result.qrCodeBase64 ?? null,
            }
          : {}),
      },
    });
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
