import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class CreateBeneficiaryDto {
  @IsOptional()
  @IsString()
  docType?: string;

  @IsString()
  @MinLength(3)
  docNumber!: string;

  @IsString()
  @MinLength(2)
  fullName!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  householdSize?: number;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsNumber()
  lat?: number;

  @IsOptional()
  @IsNumber()
  lng?: number;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  district?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  needs?: string[];

  @IsOptional()
  @IsString()
  emergencyId?: string;

  @IsOptional()
  @IsString()
  clientId?: string;
}
