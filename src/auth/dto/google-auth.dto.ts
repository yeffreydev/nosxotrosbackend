import { IsEnum, IsOptional, IsString } from 'class-validator';
import { Role } from '@prisma/client';

export class GoogleAuthDto {
  /** ID token (credential) devuelto por Google Identity Services en el frontend. */
  @IsString()
  idToken!: string;

  /** Rol deseado; sólo se usa al crear la cuenta por primera vez. */
  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}
