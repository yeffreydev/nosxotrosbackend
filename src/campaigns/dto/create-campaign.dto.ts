import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
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

  // Meta opcional: la campaña puede tener o no una meta de recaudación.
  @IsOptional()
  @IsNumber()
  @IsPositive()
  goalAmount?: number;

  // Tipos de voluntarios que busca (habilidades). Vacío = no busca voluntarios.
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(VolunteerSkill, { each: true })
  volunteerSkills?: VolunteerSkill[];

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
