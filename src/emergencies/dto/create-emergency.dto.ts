import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { EmergencyStatus, Severity } from '@prisma/client';

export class CreateEmergencyDto {
  @IsString()
  @MinLength(3)
  title!: string;

  @IsString()
  @MinLength(3)
  description!: string;

  @IsOptional()
  @IsEnum(EmergencyStatus)
  status?: EmergencyStatus;

  @IsOptional()
  @IsEnum(Severity)
  severity?: Severity;

  @IsNumber()
  lat!: number;

  @IsNumber()
  lng!: number;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  district?: string;

  @IsOptional()
  @IsString()
  coverPhoto?: string;

  @IsOptional()
  @IsString()
  primaryCenterId?: string;
}
