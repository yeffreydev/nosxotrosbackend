import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { CampaignCategory, CampaignStatus, VolunteerSkill } from '@prisma/client';

export class CreateCampaignDto {
  @IsString()
  @MinLength(4)
  @MaxLength(120)
  title!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(280)
  summary!: string;

  @IsString()
  @MinLength(20)
  story!: string;

  @IsOptional()
  @IsEnum(CampaignCategory)
  category?: CampaignCategory;

  // Meta obligatoria con mínimo de 10,000 soles (configurable por variable de entorno)
  @IsNumber()
  @IsPositive()
  @Min(10000)
  goalAmount!: number;

  // Tipos de voluntarios que busca (habilidades). Vacío = no busca voluntarios.
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(VolunteerSkill, { each: true })
  volunteerSkills?: VolunteerSkill[];

  // Meta de voluntarios: cuántas personas necesita la campaña.
  @IsOptional()
  @IsInt()
  @Min(1)
  volunteerGoal?: number;

  @IsOptional()
  @IsString()
  coverPhoto?: string;

  @IsOptional()
  @IsISO8601()
  deadline?: string;

  @IsOptional()
  @IsNumber()
  lat?: number;

  @IsOptional()
  @IsNumber()
  lng?: number;

  // Ubicación principal de la campaña. Con ella se crea sola la "zona principal"
  // en Zonas al publicar la campaña.
  @IsOptional()
  @IsString()
  @MaxLength(500)
  mapUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;

  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsString()
  province?: string;

  @IsOptional()
  @IsString()
  district?: string;

  // Datos de pago para donantes (Yape / cuenta bancaria).
  @IsOptional()
  @IsString()
  yapeNumber?: string;

  @IsOptional()
  @IsString()
  yapePhone?: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  bankAccount?: string;

  @IsOptional()
  @IsString()
  cci?: string;

  @IsOptional()
  @IsString()
  accountHolder?: string;

  @IsOptional()
  @IsString()
  qrImageUrl?: string;

  @IsOptional()
  @IsString()
  emergencyId?: string;

  // Permite publicar directamente (ACTIVE) o guardar como DRAFT.
  @IsOptional()
  @IsEnum(CampaignStatus)
  status?: CampaignStatus;
}
