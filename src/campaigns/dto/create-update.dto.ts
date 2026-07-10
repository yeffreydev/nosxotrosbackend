import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

// Publicación de avance de una campaña.
export class CreateCampaignUpdateDto {
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  title!: string;

  @IsString()
  @MinLength(3)
  body!: string;

  @IsOptional()
  @IsString()
  photoUrl?: string;
}
