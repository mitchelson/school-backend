import {
  Controller, Post, Get, Body, Query, Req, UseGuards, Param,
} from '@nestjs/common';
import { PaymentCheckoutService } from './payment-checkout.service';
import { PaymentWebhookService } from './payment-webhook.service';
import { SubscribeDto, PurchaseCreditsDto } from './dto/payments.dto';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Controller('payments')
export class PaymentsController {
  constructor(
    private checkoutService: PaymentCheckoutService,
    private webhookService: PaymentWebhookService,
    private prisma: PrismaService,
  ) {}

  @Post('subscribe')
  @UseGuards(FirebaseAuthGuard)
  subscribe(@CurrentUser('id') userId: string, @Body() dto: SubscribeDto) {
    return this.checkoutService.subscribeToPlan(
      userId,
      dto.planId,
      dto.paymentMethod,
      dto.cardToken,
      dto.installments,
      dto.paymentMethodId,
      dto.deviceSessionId,
      dto.payerIdentificationType,
      dto.payerIdentificationNumber,
    );
  }

  @Post('credits')
  @UseGuards(FirebaseAuthGuard)
  purchaseCredits(@CurrentUser('id') userId: string, @Body() dto: PurchaseCreditsDto) {
    return this.checkoutService.purchaseCredits(
      userId,
      dto.quantity,
      dto.paymentMethod,
      dto.cardToken,
      dto.installments,
      dto.paymentMethodId,
      dto.deviceSessionId,
      dto.payerIdentificationType,
      dto.payerIdentificationNumber,
    );
  }

  @Get()
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles('admin')
  async list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    const take = Math.min(Number(limit) || 20, 100);
    const skip = ((Number(page) || 1) - 1) * take;

    const where = status ? { status: status as any } : undefined;

    const [data, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          student: { select: { fullName: true, email: true } },
          plan: { select: { name: true } },
        },
      }),
      this.prisma.payment.count({ where }),
    ]);

    return { data, total, page: Number(page) || 1, limit: take, hasMore: skip + take < total };
  }

  @Get('split-preview')
  @UseGuards(FirebaseAuthGuard)
  previewSplit(
    @Query('amountInCents') amountInCents: string,
    @Query('paymentMethod') paymentMethod?: string,
    @Query('installments') installments?: string,
  ) {
    const amount = Math.max(100, parseInt(amountInCents, 10) || 0);
    const method = paymentMethod === 'card' ? 'card' : 'pix';
    const inst = Math.max(1, parseInt(installments ?? '1', 10) || 1);
    return this.checkoutService.previewSplit(amount, method, inst);
  }

  @Get('me/pending')
  @UseGuards(FirebaseAuthGuard)
  async myPending(@CurrentUser('id') userId: string) {
    return this.prisma.payment.findMany({
      where: { studentId: userId, status: 'pending' },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { plan: { select: { name: true } } },
    });
  }

  @Get('status/:id')
  @UseGuards(FirebaseAuthGuard)
  async getStatus(@CurrentUser('id') userId: string, @Param('id') id: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id, studentId: userId },
      select: { id: true, status: true, purpose: true, amountInCents: true },
    });
    if (!payment) return { paymentId: id, status: null, paid: false };
    return {
      paymentId: payment.id,
      status: payment.status,
      paid: payment.status === 'paid',
      purpose: payment.purpose,
      amountInCents: payment.amountInCents,
    };
  }

  @Post(':id/dev-confirm')
  @UseGuards(FirebaseAuthGuard)
  async devConfirm(@CurrentUser('id') userId: string, @Param('id') id: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id, studentId: userId, status: 'pending' },
    });
    if (!payment) return { ok: false };
    await this.checkoutService.fulfillPayment(id);
    return { ok: true, paid: true };
  }
}

/**
 * Webhook controller - separate, no auth guard (MP calls this directly).
 * Must receive raw body for HMAC validation.
 */
@Controller('webhooks')
export class WebhooksController {
  constructor(private webhookService: PaymentWebhookService) {}

  @Post('mercadopago')
  async handleMercadoPago(@Req() req: any) {
    const rawBody = req.rawBody?.toString() ?? JSON.stringify(req.body);
    const headers: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      headers[key] = Array.isArray(value) ? value[0] : value;
    }
    const query: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(req.query)) {
      query[key] = typeof value === 'string' ? value : undefined;
    }

    return this.webhookService.handleMercadoPagoWebhook(rawBody, headers, query);
  }
}
