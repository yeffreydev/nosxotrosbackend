import {
  IsArray,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { VolunteerSkill } from '@prisma/client';

// Alta de un voluntario por un gestor. No requiere cuenta: se crea un User stub
// (rol VOLUNTEER, sin contraseña) más su VolunteerProfile.
export class CreateVolunteerDto {
  @IsString()
  @MinLength(2)
  fullName!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  availability?: string;

  @IsOptional()
  @IsArray()
  @IsEnum(VolunteerSkill, { each: true })
  skills?: VolunteerSkill[];
}
