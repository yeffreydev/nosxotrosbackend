import { IsInt, IsOptional, IsString, Min } from 'class-validator';

// Despacho de un ítem del inventario de un centro. Descuenta stock, registra la
// salida (InventoryMovement OUT) y crea un Dispatch (opcionalmente a una zona y/o
// entregado a un beneficiario).
export class DispatchItemDto {
  @IsString()
  itemId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsString()
  zoneId?: string;

  @IsOptional()
  @IsString()
  beneficiaryId?: string;

  @IsOptional()
  @IsString()
  driverName?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
