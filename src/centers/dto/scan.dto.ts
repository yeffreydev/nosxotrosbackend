import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { InventoryMovementType } from '@prisma/client';

export class ScanDto {
  @IsString()
  sku!: string;

  @IsEnum(InventoryMovementType)
  type!: InventoryMovementType;

  @IsInt()
  @Min(0)
  quantity!: number;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  donationId?: string;
}
