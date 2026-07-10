import { IsOptional, IsString } from 'class-validator';

export class ConfirmPaymentDto {
  @IsOptional()
  @IsString()
  reference?: string;
}
