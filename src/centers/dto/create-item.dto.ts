import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

// Alta de producto en el almacén de un centro.
//
// No crea siempre una línea nueva: si el centro ya tiene ese producto (mismo
// nombre normalizado y misma unidad de medida) suma la cantidad al existente.
export class CreateItemDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @IsString()
  categoryId!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  quantity?: number;

  // Unidad de medida (unidad, kg, litros, cajas…). Si no viene se usa la de la
  // categoría. Forma parte de la identidad del producto: "arroz · kg" y
  // "arroz · bolsas" son dos líneas distintas a propósito.
  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string; // queda en el movimiento de entrada (ej. "donación de X")

  @IsOptional()
  @IsString()
  donationId?: string; // entrada trazable a una donación

  // ── Donante que entrega en mano ─────────────────────────────────────────
  // Si el ingreso es una donación presencial, se registra quién la trajo y se
  // crea una Donation GOODS ya RECIBIDA (con código público rastreable) para
  // poder emitirle un comprobante. `donorAnonymous: true` registra la donación
  // sin datos personales; con datos, el nombre es obligatorio. Sin ninguno de
  // estos campos el ingreso es un alta de stock normal, como hasta ahora.
  @IsOptional()
  @IsBoolean()
  donorAnonymous?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  donorName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  donorPhone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(120)
  donorEmail?: string;
}
