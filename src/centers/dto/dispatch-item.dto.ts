import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

// Despacho de un ítem del inventario de un centro. Descuenta stock, registra la
// salida (InventoryMovement OUT) y crea un Dispatch.
//
// Siempre tiene destino: la zona de atención a la que va la ayuda. Puede además
// entregarse a un beneficiario concreto (entonces el despacho queda DELIVERED).
// Si solo se elige beneficiario, la zona se toma de su ficha.
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
  @MaxLength(120)
  driverName?: string;

  // Dirección / punto exacto de entrega dentro de la zona.
  @IsOptional()
  @IsString()
  @MaxLength(200)
  destAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
