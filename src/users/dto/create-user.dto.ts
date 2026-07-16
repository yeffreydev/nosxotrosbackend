import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { Role } from '@prisma/client';

// Alta de usuario con rol, hecha por un gestor/ADMIN. La contraseña es opcional
// (los voluntarios/colaboradores pueden no iniciar sesión).
export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(2)
  fullName!: string;

  @IsEnum(Role)
  role!: Role;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @IsOptional()
  @IsString()
  phone?: string;
}
