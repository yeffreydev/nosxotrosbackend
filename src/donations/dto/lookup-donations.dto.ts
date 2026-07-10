import { IsEmail, IsOptional, IsString } from 'class-validator';

export class LookupDonationsDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;
}
