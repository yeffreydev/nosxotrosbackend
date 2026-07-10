import { IsEnum, IsOptional, IsString } from 'class-validator';
import { EmergencyReportStatus } from '@prisma/client';

export class UpdateEmergencyReportDto {
  @IsOptional()
  @IsEnum(EmergencyReportStatus)
  status?: EmergencyReportStatus;

  @IsOptional()
  @IsString()
  reviewNote?: string;
}
