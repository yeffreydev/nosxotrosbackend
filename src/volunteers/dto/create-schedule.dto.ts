import {
  ArrayUnique,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Disponibilidad de un voluntario. Dos formas, no mezclables:
 *   - Puntual: `date` con el día concreto ("el sábado 12 vengo de 8 a 13").
 *   - Recurrente: `weekdays` con los días de la semana (0=domingo … 6=sábado),
 *     opcionalmente acotada con validFrom/validTo ("lunes y miércoles por la mañana").
 */
export class CreateScheduleDto {
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'Hora de inicio inválida (HH:mm)' })
  startTime!: string; // "08:00"

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'Hora de fin inválida (HH:mm)' })
  endTime!: string; // "13:00"

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  weekdays?: number[];

  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  validTo?: string;

  @IsOptional()
  @IsString()
  campaignId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
