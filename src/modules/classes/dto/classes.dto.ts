import { IsString, IsInt, IsOptional, Min, Matches, IsDateString } from 'class-validator';

export class CreateClassDto {
  @IsString()
  name: string;

  @IsString()
  teacherName: string;

  @IsDateString()
  date: string;

  @IsString() @Matches(/^\d{2}:\d{2}$/)
  startTime: string;

  @IsInt() @Min(1)
  durationMinutes: number;

  @IsInt() @Min(1)
  maxStudents: number;

  @IsOptional() @IsString()
  location?: string;
}

export class UpdateClassDto {
  @IsOptional() @IsString()
  name?: string;

  @IsOptional() @IsString()
  teacherName?: string;

  @IsOptional() @IsDateString()
  date?: string;

  @IsOptional() @IsString() @Matches(/^\d{2}:\d{2}$/)
  startTime?: string;

  @IsOptional() @IsInt() @Min(1)
  durationMinutes?: number;

  @IsOptional() @IsInt() @Min(1)
  maxStudents?: number;

  @IsOptional() @IsString()
  location?: string;
}
