import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateBrigadeDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  zoneId?: string;

  @IsOptional()
  @IsString()
  meetingPoint?: string;

  @IsOptional()
  @IsString()
  meetingPointMapUrl?: string;

  @IsOptional()
  @IsString()
  contactPhone?: string;
}
