import { IsBooleanString, IsEnum, IsOptional, IsString } from 'class-validator';
import { CampaignCategory, CampaignStatus } from '@prisma/client';

export class QueryCampaignsDto {
  @IsOptional()
  @IsEnum(CampaignStatus)
  status?: CampaignStatus;

  @IsOptional()
  @IsEnum(CampaignCategory)
  category?: CampaignCategory;

  @IsOptional()
  @IsString()
  q?: string; // búsqueda por título / resumen

  @IsOptional()
  @IsString()
  organizerId?: string;

  @IsOptional()
  @IsBooleanString()
  featured?: string; // "true" → solo destacadas
}
