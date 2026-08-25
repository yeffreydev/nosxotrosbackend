import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class DispatchItemDto {
  @IsString()
  @MinLength(1)
  description!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  // Unidad de medida de lo que se manda (cajas, kg, litros…): sin ella el
  // destino recibe "20 agua" y no sabe si son botellas o bidones.
  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string;

  @IsOptional()
  @IsString()
  donationId?: string;

  @IsOptional()
  @IsString()
  beneficiaryId?: string;
}

export class CreateDispatchDto {
  @IsString()
  fromCenterId!: string;

  @IsOptional()
  @IsString()
  emergencyId?: string;

  // Zona de atención a la que va la ayuda. De ella salen la dirección y el pin
  // del destino si no se escriben a mano.
  @IsOptional()
  @IsString()
  zoneId?: string;

  @IsOptional()
  @IsNumber()
  destLat?: number;

  @IsOptional()
  @IsNumber()
  destLng?: number;

  @IsOptional()
  @IsString()
  destAddress?: string;

  @IsOptional()
  @IsString()
  driverName?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DispatchItemDto)
  items!: DispatchItemDto[];
}
