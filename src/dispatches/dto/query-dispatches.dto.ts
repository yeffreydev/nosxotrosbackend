import { IsEnum, IsOptional, IsString } from 'class-validator';
import { DispatchStatus } from '@prisma/client';

export class QueryDispatchesDto {
  @IsOptional()
  @IsEnum(DispatchStatus)
  status?: DispatchStatus;

  @IsOptional()
  @IsString()
  emergencyId?: string;

  // Despachos que van a una zona de atención concreta.
  @IsOptional()
  @IsString()
  zoneId?: string;
}
