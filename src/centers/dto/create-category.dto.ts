import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

// Categoría de inventario / necesidades (Alimentos, Agua, …).
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
}
