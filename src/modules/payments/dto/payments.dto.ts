import { IsString, IsIn, IsInt, IsOptional, Min, Matches } from 'class-validator';

class PaymentCheckoutBaseDto {
  @IsIn(['pix', 'card'])
  paymentMethod: 'pix' | 'card';

  @IsOptional() @IsString()
  cardToken?: string;

  @IsOptional() @IsInt()
  installments?: number;

  @IsOptional() @IsString()
  paymentMethodId?: string;

  /** Device ID do Mercado Pago (header X-meli-session-id). */
  @IsOptional() @IsString()
  deviceSessionId?: string;

  @IsOptional() @IsIn(['CPF', 'CNPJ'])
  payerIdentificationType?: 'CPF' | 'CNPJ';

  @IsOptional()
  @IsString()
  @Matches(/^[\d.\-/]{11,18}$/, {
    message: 'Documento do pagador inválido',
  })
  payerIdentificationNumber?: string;
}

export class SubscribeDto extends PaymentCheckoutBaseDto {
  @IsString()
  planId: string;
}

export class PurchaseCreditsDto extends PaymentCheckoutBaseDto {
  @IsInt() @Min(1)
  quantity: number;
}
