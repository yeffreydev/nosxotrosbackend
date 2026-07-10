import { PartialType } from '@nestjs/swagger';
import { CreateBrigadeDto } from './create-brigade.dto';

export class UpdateBrigadeDto extends PartialType(CreateBrigadeDto) {}
