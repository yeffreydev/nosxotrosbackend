import { IsEnum, IsOptional } from 'class-validator';
import { EmergencyStatus, Severity } from '@prisma/client';

export class QueryEmergenciesDto {
  @IsOptional()
  @IsEnum(EmergencyStatus)
  status?: EmergencyStatus;

  @IsOptional()
  @IsEnum(Severity)
  severity?: Severity;
}
