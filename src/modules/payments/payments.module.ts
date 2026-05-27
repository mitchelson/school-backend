import { Module } from '@nestjs/common';
import { PaymentsController, WebhooksController } from './payments.controller';
import { PaymentCheckoutService } from './payment-checkout.service';
import { PaymentWebhookService } from './payment-webhook.service';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';

@Module({
  controllers: [PaymentsController, WebhooksController],
  providers: [PaymentCheckoutService, PaymentWebhookService, FirebaseAuthGuard],
  exports: [PaymentCheckoutService],
})
export class PaymentsModule {}
