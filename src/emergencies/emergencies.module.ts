import { Module } from '@nestjs/common';
import { EmergenciesService } from './emergencies.service';
import { EmergenciesController } from './emergencies.controller';
import { NeedsController } from './needs.controller';
import { CampaignsModule } from '../campaigns/campaigns.module';

@Module({
  imports: [CampaignsModule],
  controllers: [EmergenciesController, NeedsController],
  providers: [EmergenciesService],
  exports: [EmergenciesService],
})
export class EmergenciesModule {}
