import { IsEnum, IsNumberString, IsOptional, IsString } from 'class-validator';
import { ShiftStatus, VolunteerSkill } from '@prisma/client';

export class QueryShiftsDto {
  @IsOptional()
  @IsEnum(VolunteerSkill)
  skill?: VolunteerSkill;

  @IsOptional()
  @IsString()
  emergencyId?: string;

  @IsOptional()
  @IsString()
  centerId?: string;

  @IsOptional()
  @IsEnum(ShiftStatus)
  status?: ShiftStatus;

  @IsOptional()
  @IsString()
  near?: string;

  @IsOptional()
  @IsNumberString()
  lat?: string;

  @IsOptional()
  @IsNumberString()
  lng?: string;
}
