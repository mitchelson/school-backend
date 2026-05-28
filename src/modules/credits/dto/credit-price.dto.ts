import { IsInt, Max, Min } from 'class-validator';

export class UpdateCreditPriceDto {
  @IsInt()
  @Min(100)
  @Max(500000)
  unitPriceInCents!: number;
}
