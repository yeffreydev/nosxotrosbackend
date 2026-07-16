import { IsEmail, IsOptional, IsString } from 'class-validator';

// Asigna un usuario como colaborador de la campaña (por id o por correo).
export class AddCollaboratorDto {
  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}
