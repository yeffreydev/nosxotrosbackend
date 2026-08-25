import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { NeedsProgressService } from '../common/needs-progress.service';
import { VolunteerAvailabilityService } from '../common/volunteer-availability.service';
import { normalizeKey, normalizeUnit } from '../common/text.util';
import { isMedicineText, NO_MEDICINE_MSG } from '../common/policy';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { CampaignsService } from '../campaigns/campaigns.service';
import {
  CreateCampaignNeedDto,
  UpdateCampaignNeedDto,
} from './dto/create-campaign-need.dto';

/**
 * Metas de una campaña: dinero, voluntarios y especies.
 *
 * Las metas en especie son `Need` colgadas de la campaña (o de una zona). Su
 * progreso no se escribe a mano: sale del inventario de los centros de la
 * campaña, enlazado por nombre normalizado + unidad de medida.
 */
@Injectable()
export class NeedsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly campaigns: CampaignsService,
    private readonly progress: NeedsProgressService,
    private readonly availability: VolunteerAvailabilityService,
  ) {}

  // ───────── metas en especie ─────────

  async listByCampaign(campaignId: string) {
    return this.prisma.need.findMany({
      where: { campaignId },
      include: { category: true },
      orderBy: [{ isBlocked: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async create(campaignId: string, dto: CreateCampaignNeedDto, user: AuthUser) {
    await this.campaigns.assertCanManage(campaignId, user);

    if (dto.zoneId) {
      const zone = await this.prisma.zone.findUnique({ where: { id: dto.zoneId } });
      if (!zone || zone.campaignId !== campaignId) {
        throw new NotFoundException('Zona no encontrada en esta campaña');
      }
    }

    const title = dto.title.trim();
    // La plataforma no recibe medicamentos: tampoco como meta de campaña.
    if (isMedicineText(title)) throw new BadRequestException(NO_MEDICINE_MSG);
    const titleKey = normalizeKey(title);
    if (!titleKey) throw new BadRequestException('Nombre de meta inválido');
    const unit = normalizeUnit(dto.unit ?? (await this.categoryUnit(dto.categoryId)));

    // Una misma meta no se duplica: si ya existe ese producto+unidad en la
    // campaña, se suma a la meta existente en vez de partirla en dos barras.
    const existing = await this.prisma.need.findFirst({
      where: {
        campaignId,
        zoneId: dto.zoneId ?? null,
        titleKey,
        unit,
      },
    });

    const need = existing
      ? await this.prisma.need.update({
          where: { id: existing.id },
          data: {
            targetQty: existing.targetQty + dto.targetQty,
            ...(dto.categoryId ? { categoryId: dto.categoryId } : {}),
            ...(dto.priority ? { priority: dto.priority } : {}),
            ...(dto.isBlocked !== undefined ? { isBlocked: dto.isBlocked } : {}),
          },
          include: { category: true },
        })
      : await this.prisma.need.create({
          data: {
            campaignId,
            zoneId: dto.zoneId,
            title,
            titleKey,
            unit,
            targetQty: dto.targetQty,
            categoryId: dto.categoryId,
            priority: dto.priority,
            isBlocked: dto.isBlocked ?? false,
          },
          include: { category: true },
        });

    await this.progress.syncCampaign(campaignId);
    await this.audit.log(user.id, existing ? 'update' : 'create', 'Need', need.id, {
      campaignId,
    });
    return this.prisma.need.findUnique({
      where: { id: need.id },
      include: { category: true },
    });
  }

  async update(id: string, dto: UpdateCampaignNeedDto, user: AuthUser) {
    const need = await this.loadOwned(id, user);
    const title = dto.title?.trim() ?? need.title;
    const titleKey = normalizeKey(title);
    if (!titleKey) throw new BadRequestException('Nombre de meta inválido');

    const updated = await this.prisma.need.update({
      where: { id },
      data: {
        title,
        titleKey,
        ...(dto.unit !== undefined ? { unit: normalizeUnit(dto.unit) } : {}),
        ...(dto.targetQty !== undefined ? { targetQty: dto.targetQty } : {}),
        ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
        ...(dto.isBlocked !== undefined ? { isBlocked: dto.isBlocked } : {}),
      },
      include: { category: true },
    });
    await this.progress.syncCampaign(need.campaignId ?? updated.campaignId);
    await this.audit.log(user.id, 'update', 'Need', id, { ...dto });
    return updated;
  }

  async remove(id: string, user: AuthUser) {
    await this.loadOwned(id, user);
    await this.prisma.need.delete({ where: { id } });
    await this.audit.log(user.id, 'delete', 'Need', id);
    return { deleted: true };
  }

  // ───────── tablero de metas (público) ─────────

  /**
   * Resumen de metas de la campaña: dinero, voluntarios y especies, todo con su
   * porcentaje. Es lo que ve el organizador en su panel y el donante en la
   * página pública ("faltan 120 frazadas").
   */
  async goals(idOrSlug: string, dateISO?: string) {
    const campaign = await this.prisma.campaign.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      select: {
        id: true,
        goalAmount: true,
        raisedAmount: true,
        currency: true,
        backersCount: true,
        volunteerGoal: true,
      },
    });
    if (!campaign) throw new NotFoundException('Campaña no encontrada');

    await this.progress.syncCampaign(campaign.id);

    const [needs, centers, enrollments] = await Promise.all([
      this.prisma.need.findMany({
        where: { OR: [{ campaignId: campaign.id }, { zone: { campaignId: campaign.id } }] },
        include: {
          category: true,
          zone: { select: { id: true, name: true } },
        },
        orderBy: [{ isBlocked: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.center.findMany({
        where: { campaignId: campaign.id },
        select: { id: true },
      }),
      this.prisma.campaignVolunteer.findMany({
        where: { campaignId: campaign.id },
        select: { volunteerId: true },
      }),
    ]);

    // Stock actual por producto+unidad en los centros de la campaña.
    const items = await this.prisma.inventoryItem.findMany({
      where: { centerId: { in: centers.map((c) => c.id) } },
      select: { nameKey: true, unit: true, quantity: true },
    });
    const stock = new Map<string, number>();
    for (const it of items) {
      const key = `${it.nameKey}|${it.unit}`;
      stock.set(key, (stock.get(key) ?? 0) + it.quantity);
    }

    const shaped = needs.map((n) => {
      const inStock = stock.get(`${n.titleKey}|${n.unit}`) ?? 0;
      const pct =
        n.targetQty > 0
          ? Math.min(100, Math.round((n.fulfilledQty / n.targetQty) * 100))
          : 0;
      return {
        id: n.id,
        title: n.title,
        unit: n.unit,
        targetQty: n.targetQty,
        collectedQty: n.fulfilledQty,
        deliveredQty: n.deliveredQty,
        inStock,
        remaining: Math.max(0, n.targetQty - n.fulfilledQty),
        pct,
        priority: n.priority,
        isBlocked: n.isBlocked,
        categoryId: n.categoryId,
        category: n.category,
        zone: n.zone,
      };
    });

    // Agrupado por categoría: "comida 60%", "herramientas 20%"…
    const byCategory = new Map<string, any>();
    for (const n of shaped) {
      const key = n.category?.id ?? 'sin-categoria';
      const row =
        byCategory.get(key) ??
        {
          id: n.category?.id ?? null,
          name: n.category?.name ?? 'Sin categoría',
          icon: n.category?.icon ?? null,
          kind: n.category?.kind ?? null,
          targetQty: 0,
          collectedQty: 0,
          needsCount: 0,
        };
      row.targetQty += n.targetQty;
      row.collectedQty += n.collectedQty;
      row.needsCount += 1;
      byCategory.set(key, row);
    }

    const volunteersEnrolled = enrollments.length;
    const availableToday = await this.availability.countForCampaign(
      campaign.id,
      dateISO,
    );

    return {
      money: {
        goal: campaign.goalAmount,
        raised: campaign.raisedAmount,
        currency: campaign.currency,
        backers: campaign.backersCount,
        pct:
          campaign.goalAmount && campaign.goalAmount > 0
            ? Math.min(100, Math.round((campaign.raisedAmount / campaign.goalAmount) * 100))
            : 0,
      },
      volunteers: {
        goal: campaign.volunteerGoal,
        enrolled: volunteersEnrolled,
        withAccount: enrollments.filter((e) => e.volunteerId).length,
        availableToday,
        pct:
          campaign.volunteerGoal && campaign.volunteerGoal > 0
            ? Math.min(100, Math.round((volunteersEnrolled / campaign.volunteerGoal) * 100))
            : 0,
      },
      items: shaped,
      byCategory: [...byCategory.values()].map((row) => ({
        ...row,
        pct:
          row.targetQty > 0
            ? Math.min(100, Math.round((row.collectedQty / row.targetQty) * 100))
            : 0,
      })),
    };
  }

  // ───────── helpers ─────────

  private async categoryUnit(categoryId?: string) {
    if (!categoryId) return undefined;
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
    });
    return category?.unit;
  }

  /** Carga una meta y verifica que el usuario pueda gestionar su campaña. */
  private async loadOwned(id: string, user: AuthUser) {
    const need = await this.prisma.need.findUnique({
      where: { id },
      include: { zone: { select: { campaignId: true } } },
    });
    if (!need) throw new NotFoundException('Meta no encontrada');
    const campaignId = need.campaignId ?? need.zone?.campaignId;
    if (!campaignId) {
      throw new BadRequestException('Esta necesidad no pertenece a una campaña');
    }
    await this.campaigns.assertCanManage(campaignId, user);
    return { ...need, campaignId };
  }
}
