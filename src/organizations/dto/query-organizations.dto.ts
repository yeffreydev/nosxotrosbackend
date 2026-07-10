import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { OrgType } from '@prisma/client';

export class QueryOrganizationsDto {
  @IsOptional()
  @IsEnum(OrgType)
  type?: OrgType;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  verified?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  impactLens?: boolean;
}
