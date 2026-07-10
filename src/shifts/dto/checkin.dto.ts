import { IsNumber } from 'class-validator';

export class CheckinDto {
  @IsNumber()
  lat!: number;

  @IsNumber()
  lng!: number;
}
