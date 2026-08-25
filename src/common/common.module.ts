import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { NeedsProgressService } from './needs-progress.service';
import { VolunteerAvailabilityService } from './volunteer-availability.service';

@Global()
@Module({
  providers: [AuditService, NeedsProgressService, VolunteerAvailabilityService],
  exports: [AuditService, NeedsProgressService, VolunteerAvailabilityService],
})
export class CommonModule {}
