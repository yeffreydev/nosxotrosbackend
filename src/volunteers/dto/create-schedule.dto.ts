import { IsDateString, IsOptional, IsString, MinLength } from 'class-validator';

// Registro de horario de trabajo de un voluntario (entrada/salida).
export class CreateScheduleDto {
  @IsString()
  @MinLength(1)
  startTime!: string; // "08:00"

  @IsString()
  @MinLength(1)
  endTime!: string; // "13:00"

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  campaignId?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
