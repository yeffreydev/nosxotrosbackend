import {
  ArrayUnique,
  IsArray,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { VolunteerSkill } from '@prisma/client';

// Un voluntario se inscribe a sí mismo en una campaña.
export class EnrollVolunteerDto {
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(VolunteerSkill, { each: true })
  skills?: VolunteerSkill[];

  @IsOptional()
  @IsString()
  @MaxLength(280)
  note?: string;
}

// El organizador inscribe a alguien: por email de usuario existente.
export class AddCampaignVolunteerDto extends EnrollVolunteerDto {
  @IsEmail()
  email!: string;
}
