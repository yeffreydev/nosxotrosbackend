import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { CenterStatus } from '@prisma/client';

export class CreateCenterDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @MinLength(2)
  address!: string;

  @IsNumber()
  lat!: number;

  @IsNumber()
  lng!: number;

  @IsOptional()
  @IsEnum(CenterStatus)
  status?: CenterStatus;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  currentLoad?: number;

  @IsOptional()
  @IsString()
  contactPhone?: string;

  @IsOptional()
  @IsString()
  openingHours?: string;

  // Enlace del mapa (Google Maps, Waze, OSM…). Se guarda tal cual para que el
  // donante abra la ruta en su app; lat/lng siguen siendo la fuente del mapa propio.
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  mapUrl?: string;

  // Foto del local: el donante reconoce a dónde llegar.
  @IsOptional()
  @IsString()
  @MaxLength(500)
  photoUrl?: string;

  // Referencia / hito para ubicarlo ("frente al mercado central").
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reference?: string;

  @IsOptional()
  @IsString()
  organizationId?: string;

  @IsOptional()
  @IsString()
  campaignId?: string;
}
