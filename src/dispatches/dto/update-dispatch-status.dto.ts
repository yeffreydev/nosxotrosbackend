import { IsEnum } from 'class-validator';
import { DispatchStatus } from '@prisma/client';

export class UpdateDispatchStatusDto {
  @IsEnum(DispatchStatus)
  status!: DispatchStatus;
}
