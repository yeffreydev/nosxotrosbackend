import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(
    userId: string | null | undefined,
    action: string,
    entity: string,
    entityId?: string | null,
    meta?: Prisma.InputJsonValue,
  ): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: userId ?? null,
          action,
          entity,
          entityId: entityId ?? null,
          meta: meta === undefined ? undefined : meta,
        },
      });
    } catch (err) {
      this.logger.warn(`AuditLog failed: ${(err as Error).message}`);
    }
  }
}
