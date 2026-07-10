import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { DonationStatus } from '@prisma/client';

export class UpdateDonationStatusDto {
  @IsEnum(DonationStatus)
  status!: DonationStatus;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsNumber()
  lat?: number;

  @IsOptional()
  @IsNumber()
  lng?: number;

  @IsOptional()
  @IsString()
  photoUrl?: string;
}
