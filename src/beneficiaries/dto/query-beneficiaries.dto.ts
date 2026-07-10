import { IsEnum, IsOptional, IsString } from 'class-validator';
import { BeneficiaryStatus } from '@prisma/client';

export class QueryBeneficiariesDto {
  @IsOptional()
  @IsString()
  emergencyId?: string;

  @IsOptional()
  @IsEnum(BeneficiaryStatus)
  status?: BeneficiaryStatus;

  @IsOptional()
  @IsString()
  q?: string;
}
