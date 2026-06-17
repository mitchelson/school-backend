import { IsEmail, IsOptional, IsString, Matches, MinLength } from 'class-validator';

/** Perfil opcional no primeiro login (ex.: Google). */
export class EstablishSessionDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  fullName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{10,11}$/, { message: 'Telefone deve ter 10 ou 11 dígitos' })
  phone?: string;
}
