import { PartialType } from '@nestjs/swagger';
import { CreateCampaignDto } from './create-campaign.dto';

// Todos los campos opcionales; el organizador edita lo que quiera.
export class UpdateCampaignDto extends PartialType(CreateCampaignDto) {}
