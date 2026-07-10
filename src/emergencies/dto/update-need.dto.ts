import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Severity } from '@prisma/client';

export class UpdateNeedDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  targetQty?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  fulfilledQty?: number;

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
