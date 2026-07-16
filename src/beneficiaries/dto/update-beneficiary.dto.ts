import { PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { BeneficiaryStatus } from '@prisma/client';
import { CreateBeneficiaryDto } from './create-beneficiary.dto';

// Edición de un beneficiario ya censado: todos los campos opcionales + estado.
export class UpdateBeneficiaryDto extends PartialType(CreateBeneficiaryDto) {
  @IsOptional()
  @IsEnum(BeneficiaryStatus)
  status?: BeneficiaryStatus;
}
