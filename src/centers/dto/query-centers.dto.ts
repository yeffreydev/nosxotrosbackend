import { IsEnum, IsOptional } from 'class-validator';
import { CenterStatus } from '@prisma/client';

export class QueryCentersDto {
  @IsOptional()
  @IsEnum(CenterStatus)
  status?: CenterStatus;
}
