import { IsOptional, IsString } from 'class-validator';

export class AddBrigadeMemberDto {
  @IsOptional()
  @IsString()
  volunteerId?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  role?: string;
}
