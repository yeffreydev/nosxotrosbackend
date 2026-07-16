import { Module } from '@nestjs/common';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { ZonesService } from './zones.service';
import { ZonesController } from './zones.controller';
import { BrigadesService } from './brigades.service';
import { BrigadesController } from './brigades.controller';
import { CampaignVolunteersService } from './campaign-volunteers.service';
import { CampaignVolunteersController } from './campaign-volunteers.controller';

@Module({
  imports: [CampaignsModule],
  controllers: [
    ZonesController,
    BrigadesController,
    CampaignVolunteersController,
  ],
  providers: [ZonesService, BrigadesService, CampaignVolunteersService],
})
export class CampaignOpsModule {}
