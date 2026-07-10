import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { Severity } from '@prisma/client';

export class CreateNeedDto {
  @IsString()
  @MinLength(2)
  title!: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsInt()
  @Min(0)
  targetQty!: number;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsEnum(Severity)
  priority?: Severity;

  @IsOptional()
  @IsBoolean()
  isBlocked?: boolean;
}
