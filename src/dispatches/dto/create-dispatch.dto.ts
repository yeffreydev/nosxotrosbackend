import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class DispatchItemDto {
  @IsString()
  @MinLength(1)
  description!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @IsString()
  donationId?: string;

  @IsOptional()
  @IsString()
  beneficiaryId?: string;
}

export class CreateDispatchDto {
  @IsString()
  fromCenterId!: string;

  @IsOptional()
  @IsString()
  emergencyId?: string;

  @IsOptional()
  @IsNumber()
  destLat?: number;

  @IsOptional()
  @IsNumber()
  destLng?: number;

  @IsOptional()
  @IsString()
  destAddress?: string;

  @IsOptional()
  @IsString()
  driverName?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DispatchItemDto)
  items!: DispatchItemDto[];
}
