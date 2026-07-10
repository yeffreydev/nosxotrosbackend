import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateSurveyDto {
  @IsIn(['ease', 'nps'])
  kind!: string;

  @IsInt()
  @Min(0)
  @Max(10)
  score!: number;

  @IsOptional()
  @IsString()
  context?: string;

  @IsOptional()
  @IsString()
  comment?: string;
}
