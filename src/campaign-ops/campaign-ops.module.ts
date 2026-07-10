import { Module } from '@nestjs/common';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { ZonesService } from './zones.service';
import { ZonesController } from './zones.controller';
import { BrigadesService } from './brigades.service';
import { BrigadesController } from './brigades.controller';

@Module({
  imports: [CampaignsModule],
  controllers: [ZonesController, BrigadesController],
  providers: [ZonesService, BrigadesService],
})
export class CampaignOpsModule {}
