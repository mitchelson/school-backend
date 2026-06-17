import { Test, TestingModule } from '@nestjs/testing';
import { PaymentCheckoutService } from './payment-checkout.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { MercadoPagoGateway } from '../../infrastructure/gateways/mercadopago/mercadopago.gateway';
import { ConfigService } from '@nestjs/config';
import { MpSellerService } from '../marketplace/mp-seller.service';
import { PlatformSettingsService } from '../marketplace/platform-settings.service';
import { SplitCalculatorService } from '../marketplace/split-calculator.service';
import { SubscriptionMaintenanceService } from '../subscriptions/subscription-maintenance.service';

describe('PaymentCheckoutService.fulfillPayment', () => {
  let service: PaymentCheckoutService;

  const tx = {
    payment: { updateMany: jest.fn(), findUniqueOrThrow: jest.fn() },
    subscription: { findUnique: jest.fn(), upsert: jest.fn() },
    studentTokenBalance: { upsert: jest.fn() },
  };

  const prisma = {
    $transaction: jest.fn(async (fn: (inner: typeof tx) => Promise<unknown>) => fn(tx)),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentCheckoutService,
        { provide: PrismaService, useValue: prisma },
        { provide: MercadoPagoGateway, useValue: {} },
        { provide: ConfigService, useValue: { get: () => undefined } },
        { provide: MpSellerService, useValue: {} },
        { provide: PlatformSettingsService, useValue: {} },
        { provide: SplitCalculatorService, useValue: {} },
        { provide: SubscriptionMaintenanceService, useValue: {} },
      ],
    }).compile();

    service = module.get(PaymentCheckoutService);
    jest.clearAllMocks();
  });

  it('skips fulfillment when payment is not pending', async () => {
    tx.payment.updateMany.mockResolvedValue({ count: 0 });

    await service.fulfillPayment('pay-1');

    expect(tx.subscription.upsert).not.toHaveBeenCalled();
    expect(tx.studentTokenBalance.upsert).not.toHaveBeenCalled();
  });

  it('fulfills plan payment once when pending', async () => {
    tx.payment.updateMany.mockResolvedValue({ count: 1 });
    tx.payment.findUniqueOrThrow.mockResolvedValue({
      id: 'pay-1',
      purpose: 'plan',
      planId: 'plan-1',
      studentId: 'student-1',
      creditQuantity: null,
    });
    tx.subscription.findUnique.mockResolvedValue(null);

    await service.fulfillPayment('pay-1');

    expect(tx.subscription.upsert).toHaveBeenCalledTimes(1);
  });
});
