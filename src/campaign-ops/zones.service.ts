import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { CampaignsService } from '../campaigns/campaigns.service';
import { CreateZoneDto } from './dto/create-zone.dto';
import { UpdateZoneDto } from './dto/update-zone.dto';
import { CreateNeedDto } from '../emergencies/dto/create-need.dto';

const ZONE_INCLUDE = {
  needs: { include: { category: true } },
  brigades: {
    include: {
      members: {
        include: {
          volunteer: { include: { user: { select: { id: true, fullName: true } } } },
          user: { select: { id: true, fullName: true } },
        },
      },
    },
  },
} as const;

@Injectable()
export class ZonesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly campaigns: CampaignsService,
  ) {}

  /** Zonas de una campaña (lectura pública para voluntarios/donantes). */
  listByCampaign(campaignId: string) {
    return this.prisma.zone.findMany({
      where: { campaignId },
      include: ZONE_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Panel de operaciones del organizador: campaña + zonas + brigadas + centros. */
  async operations(idOrSlug: string) {
    const campaign = await this.prisma.campaign.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      include: {
        centers: true,
        organizer: { select: { id: true, fullName: true } },
      },
    });
    if (!campaign) throw new NotFoundException('Campaña no encontrada');

    const zones = await this.listByCampaign(campaign.id);
    return {
      campaign: {
        id: campaign.id,
        slug: campaign.slug,
        title: campaign.title,
        organizerId: campaign.organizerId,
        organizer: campaign.organizer,
      },
      zones,
      centers: campaign.centers,
    };
  }

  async create(campaignId: string, dto: CreateZoneDto, user: AuthUser) {
    await this.campaigns.assertOwner(campaignId, user);
    const zone = await this.prisma.zone.create({
      data: {
        campaignId,
        name: dto.name,
        mapUrl: dto.mapUrl,
        reference: dto.reference,
        description: dto.description,
        severity: dto.severity,
        lat: dto.lat,
        lng: dto.lng,
        emergencyId: dto.emergencyId,
      },
      include: ZONE_INCLUDE,
    });
    await this.audit.log(user.id, 'create', 'Zone', zone.id, { campaignId });
    return zone;
  }

  async update(id: string, dto: UpdateZoneDto, user: AuthUser) {
    const existing = await this.loadOwned(id, user);
    const zone = await this.prisma.zone.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.mapUrl !== undefined ? { mapUrl: dto.mapUrl } : {}),
        ...(dto.reference !== undefined ? { reference: dto.reference } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.severity !== undefined ? { severity: dto.severity } : {}),
        ...(dto.lat !== undefined ? { lat: dto.lat } : {}),
        ...(dto.lng !== undefined ? { lng: dto.lng } : {}),
        ...(dto.emergencyId !== undefined ? { emergencyId: dto.emergencyId } : {}),
      },
      include: ZONE_INCLUDE,
    });
    await this.audit.log(user.id, 'update', 'Zone', id, {
      campaignId: existing.campaignId,
    });
    return zone;
  }

  async remove(id: string, user: AuthUser) {
    const existing = await this.loadOwned(id, user);
    await this.prisma.zone.delete({ where: { id } });
    await this.audit.log(user.id, 'delete', 'Zone', id, {
      campaignId: existing.campaignId,
    });
    return { deleted: true };
  }

  async addNeed(zoneId: string, dto: CreateNeedDto, user: AuthUser) {
    await this.loadOwned(zoneId, user);
    const need = await this.prisma.need.create({
      data: {
        zoneId,
        title: dto.title,
        categoryId: dto.categoryId,
        targetQty: dto.targetQty,
        unit: dto.unit,
        priority: dto.priority,
        isBlocked: dto.isBlocked,
      },
      include: { category: true },
    });
    await this.audit.log(user.id, 'create', 'Need', need.id, { zoneId });
    return need;
  }

  /** Carga una zona y verifica que el usuario sea dueño de su campaña. */
  private async loadOwned(id: string, user: AuthUser) {
    const zone = await this.prisma.zone.findUnique({ where: { id } });
    if (!zone) throw new NotFoundException('Zona no encontrada');
    await this.campaigns.assertOwner(zone.campaignId, user);
    return zone;
  }
}
