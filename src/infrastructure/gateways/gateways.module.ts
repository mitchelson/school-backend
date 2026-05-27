import { Global, Module } from '@nestjs/common';
import { MercadoPagoGateway } from './mercadopago/mercadopago.gateway';

@Global()
@Module({
  providers: [MercadoPagoGateway],
  exports: [MercadoPagoGateway],
})
export class GatewaysModule {}
