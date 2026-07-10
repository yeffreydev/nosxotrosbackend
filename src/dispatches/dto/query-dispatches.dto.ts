import { IsEnum, IsOptional, IsString } from 'class-validator';
import { DispatchStatus } from '@prisma/client';

export class QueryDispatchesDto {
  @IsOptional()
  @IsEnum(DispatchStatus)
  status?: DispatchStatus;

  @IsOptional()
  @IsString()
  emergencyId?: string;
}
