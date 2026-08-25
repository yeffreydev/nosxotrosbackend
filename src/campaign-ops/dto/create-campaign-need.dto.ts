import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Severity } from '@prisma/client';

/**
 * Meta en especie de una campaña: "se necesitan 200 frazadas".
 *
 * El título es el nombre del producto tal cual se va a registrar en el almacén:
 * lo que entre a un centro de la campaña con ese nombre y esa unidad hace
 * avanzar la meta sola.
 */
export class CreateCampaignNeedDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  title!: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsInt()
  @Min(0)
  targetQty!: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string;

  @IsOptional()
  @IsEnum(Severity)
  priority?: Severity;

  // "No traer X": una necesidad bloqueada avisa al donante que ya no hace falta.
  @IsOptional()
  @IsBoolean()
  isBlocked?: boolean;

  // Meta de una zona concreta en vez de toda la campaña.
  @IsOptional()
  @IsString()
  zoneId?: string;
}

export class UpdateCampaignNeedDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  title?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  targetQty?: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string;

  @IsOptional()
  @IsEnum(Severity)
  priority?: Severity;

  @IsOptional()
  @IsBoolean()
  isBlocked?: boolean;
}
