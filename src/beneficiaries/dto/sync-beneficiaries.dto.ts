import { Type } from 'class-transformer';
import { IsArray, ValidateNested } from 'class-validator';
import { CreateBeneficiaryDto } from './create-beneficiary.dto';

export class SyncBeneficiariesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateBeneficiaryDto)
  records!: CreateBeneficiaryDto[];
}
