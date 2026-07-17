import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Min,
} from 'class-validator';
import { DonationType, PaymentMethod, VolunteerSkill } from '@prisma/client';

// "08:00" — hora del día en 24h.
const TIME_24H = /^([01]\d|2[0-3]):[0-5]\d$/;

// Disponibilidad recurrente del voluntario. No es un enum de Prisma: se guarda
// redactada en la nota de la inscripción, no en una columna propia.
export const WEEKDAYS = {
  MON: 'MON',
  TUE: 'TUE',
  WED: 'WED',
  THU: 'THU',
  FRI: 'FRI',
  SAT: 'SAT',
  SUN: 'SUN',
} as const;
export type Weekday = keyof typeof WEEKDAYS;

export class CreateDonationDto {
  @IsEnum(DonationType)
  type!: DonationType;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  amount?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  emergencyId?: string;

  @IsOptional()
  @IsString()
  campaignId?: string;

  @IsOptional()
  @IsString()
  centerId?: string;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsBoolean()
  anonymous?: boolean;

  @IsOptional()
  @IsString()
  donorName?: string;

  @IsOptional()
  @IsEmail()
  donorEmail?: string;

  @IsOptional()
  @IsString()
  donorPhone?: string;

  // ── Voluntariado (type = TIME) ──
  // Con campaignId, estos campos inscriben al donante en los voluntarios de la
  // campaña. Se ignoran en cualquier otro tipo de donación.

  /** Habilidades que ofrece en la campaña. */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(VolunteerSkill, { each: true })
  volunteerSkills?: VolunteerSkill[];

  /** Días disponibles: 'MON'…'SUN'. */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(WEEKDAYS, { each: true })
  volunteerDays?: Weekday[];

  @IsOptional()
  @Matches(TIME_24H, { message: 'volunteerStartTime debe ser HH:mm' })
  volunteerStartTime?: string;

  @IsOptional()
  @Matches(TIME_24H, { message: 'volunteerEndTime debe ser HH:mm' })
  volunteerEndTime?: string;
}
