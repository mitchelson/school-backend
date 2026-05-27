import { IsString, IsOptional, IsEmail, MinLength, Matches } from 'class-validator';

export class CreateStudentDto {
  @IsString() @MinLength(3)
  fullName: string;

  @IsEmail()
  email: string;

  @IsString() @Matches(/^\d{10,11}$/)
  phone: string;

  @IsString()
  firebaseUid: string;
}

export class UpdateStudentDto {
  @IsOptional() @IsString() @MinLength(3)
  fullName?: string;

  @IsOptional() @IsString() @Matches(/^\d{10,11}$/)
  phone?: string;
}

export class StudentQueryDto {
  @IsOptional() @IsString()
  search?: string;

  @IsOptional() @IsString()
  page?: string;

  @IsOptional() @IsString()
  limit?: string;
}
