import { IsString, IsIn, IsInt, IsOptional, Min } from 'class-validator';

export class SubscribeDto {
  @IsString()
  planId: string;

  @IsIn(['pix', 'card'])
  paymentMethod: 'pix' | 'card';

  @IsOptional() @IsString()
  cardToken?: string;

  @IsOptional() @IsInt()
  installments?: number;

  @IsOptional() @IsString()
  paymentMethodId?: string;
}

export class PurchaseCreditsDto {
  @IsInt() @Min(1)
  quantity: number;

  @IsIn(['pix', 'card'])
  paymentMethod: 'pix' | 'card';

  @IsOptional() @IsString()
  cardToken?: string;

  @IsOptional() @IsInt()
  installments?: number;

  @IsOptional() @IsString()
  paymentMethodId?: string;
}
