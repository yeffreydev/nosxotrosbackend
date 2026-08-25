import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { CategoryKind } from '@prisma/client';

// Categoría de inventario / necesidades (Alimentos, Herramientas, Combustible…).
// El organizador puede crear las suyas desde las metas de la campaña.
export class CreateCategoryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string; // unidad por defecto de los ítems de esta categoría

  @IsOptional()
  @IsString()
  @MaxLength(8)
  icon?: string;

  // Qué tipo de ayuda representa: bienes, herramientas, transporte, combustible…
  @IsOptional()
  @IsEnum(CategoryKind)
  kind?: CategoryKind;
}
