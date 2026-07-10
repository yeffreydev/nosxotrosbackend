import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { VolunteerSkill } from '@prisma/client';

export class UpdateVolunteerDto {
  @IsOptional()
  @IsArray()
  @IsEnum(VolunteerSkill, { each: true })
  skills?: VolunteerSkill[];

  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  radiusKm?: number;

  @IsOptional()
  @IsNumber()
  baseLat?: number;

  @IsOptional()
  @IsNumber()
  baseLng?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  interests?: string[];
}
