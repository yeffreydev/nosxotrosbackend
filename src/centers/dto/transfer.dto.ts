import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class TransferEntryDto {
  @IsString()
  itemId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;
}

// Transferencia de stock de un centro de acopio al almacén central de su
// campaña. Con `all: true` se transfiere todo el stock disponible; si no,
// se listan los ítems y cantidades. `toCenterId` es opcional: por defecto
// se resuelve al almacén central de la campaña del centro de origen.
export class TransferDto {
  @IsOptional()
  @IsString()
  toCenterId?: string;

  @IsOptional()
  @IsBoolean()
  all?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => TransferEntryDto)
  items?: TransferEntryDto[];

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
