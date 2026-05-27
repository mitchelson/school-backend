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

  @Get('status/:id')
  @UseGuards(FirebaseAuthGuard)
  async getStatus(@Query('id') id: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    return { paymentId: payment?.id, status: payment?.status, paid: payment?.status === 'paid' };
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
