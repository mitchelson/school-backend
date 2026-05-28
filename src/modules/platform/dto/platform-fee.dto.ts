import { IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';

/** Configuração de split e taxas estimadas do Mercado Pago (owner). */
export class UpdatePlatformFeeDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(50)
  platformFeePercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(20)
  mpFeePercentPix?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(20)
  mpFeePercentCard?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(20)
  mpFeePercentCardInstallments?: number;
}
