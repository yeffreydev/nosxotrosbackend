import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { WebRevalidateService } from './web-revalidate.service';

@Global()
@Module({
  providers: [AuditService, WebRevalidateService],
  exports: [AuditService, WebRevalidateService],
})
export class CommonModule {}
