import { IsEmail, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class SendOwnerEmailDto {
  @IsEmail()
  to!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  subject!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  message!: string;
}

export class OwnerInboxQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
