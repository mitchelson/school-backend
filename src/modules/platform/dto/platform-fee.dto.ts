import { IsInt, Max, Min } from 'class-validator';

/** Percentual total retirado do valor bruto (MP + plataforma). Mínimo recomendado: 7. */
export class UpdatePlatformFeeDto {
  @IsInt()
  @Min(0)
  @Max(50)
  platformFeePercent!: number;
}
