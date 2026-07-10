import { IsEnum, IsOptional } from 'class-validator';
import { EmergencyReportStatus } from '@prisma/client';

export class QueryEmergencyReportsDto {
  @IsOptional()
  @IsEnum(EmergencyReportStatus)
  status?: EmergencyReportStatus;
}
