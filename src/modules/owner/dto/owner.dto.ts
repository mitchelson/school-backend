import { IsIn, IsOptional, IsString } from 'class-validator';
import { Role } from '@prisma/client';

export class OwnerUsersQueryDto {
  @IsOptional() @IsString()
  search?: string;

  @IsOptional() @IsIn(['owner', 'admin', 'aluno'])
  role?: Role;

  @IsOptional() @IsString()
  page?: string;

  @IsOptional() @IsString()
  limit?: string;
}

export class UpdateUserRoleDto {
  @IsIn(['owner', 'admin', 'aluno'])
  role: Role;
}

export class OwnerListQueryDto {
  @IsOptional() @IsString()
  page?: string;

  @IsOptional() @IsString()
  limit?: string;

  @IsOptional() @IsString()
  status?: string;
}
