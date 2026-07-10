import { IsEnum, IsOptional, IsString } from 'class-validator';
import { DonationStatus, DonationType } from '@prisma/client';

export class QueryDonationsDto {
  @IsOptional()
  @IsEnum(DonationStatus)
  status?: DonationStatus;

  @IsOptional()
  @IsEnum(DonationType)
  type?: DonationType;

  @IsOptional()
  @IsString()
  emergencyId?: string;

  @IsOptional()
  @IsString()
  campaignId?: string;
}
