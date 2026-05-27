import { IsString, IsInt, IsOptional, IsBoolean, Min, IsIn } from 'class-validator';

export class CreatePlanDto {
  @IsString()
  name: string;

  @IsInt() @Min(1)
  priceInCents: number;

  @IsInt() @IsIn([0, 1, 2, 3])
  weeklyLimit: number;
}

export class UpdatePlanDto {
  @IsOptional() @IsString()
  name?: string;

  @IsOptional() @IsInt() @Min(1)
  priceInCents?: number;

  @IsOptional() @IsInt() @IsIn([0, 1, 2, 3])
  weeklyLimit?: number;

  @IsOptional() @IsBoolean()
  active?: boolean;
}
