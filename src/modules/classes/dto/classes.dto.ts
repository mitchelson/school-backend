import {
  IsString,
  IsInt,
  IsOptional,
  Min,
  Max,
  Matches,
  IsDateString,
  IsIn,
  IsArray,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

export type ClassMutationScope = 'single' | 'future';

export class CreateClassDto {
  @IsString()
  name: string;

  @IsString()
  teacherName: string;

  @IsDateString()
  date: string;

  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  startTime: string;

  @IsInt()
  @Min(1)
  durationMinutes: number;

  @IsInt()
  @Min(1)
  maxStudents: number;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsIn(['single', 'weekly', 'biweekly'])
  scheduleType?: 'single' | 'weekly' | 'biweekly';

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @Type(() => Number)
  weekdays?: number[];

  /**
   * Como o frontend envia weekdays:
   * - iso: 1=Seg … 7=Dom
   * - monday_zero: 0=Seg … 6=Dom (muitas UIs)
   * Omitido: inferido (0 → monday_zero; valores 1–7 → iso)
   */
  @IsOptional()
  @IsIn(['iso', 'monday_zero'])
  weekdaysConvention?: 'iso' | 'monday_zero';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(26)
  weeksAhead?: number;
}

export class UpdateClassDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  teacherName?: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  startTime?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxStudents?: number;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsIn(['single', 'future'])
  scope?: ClassMutationScope;
}

export class CancelClassDto {
  @IsOptional()
  @IsIn(['single', 'future'])
  scope?: ClassMutationScope;
}
