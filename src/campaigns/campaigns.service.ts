import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CampaignStatus, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { QueryCampaignsDto } from './dto/query-campaigns.dto';
import { CreateCampaignUpdateDto } from './dto/create-update.dto';

@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ───────── helpers ─────────

  private slugify(title: string): string {
    return title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, "") // quita acentos
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
  }

  private async uniqueSlug(title: string): Promise<string> {
    const base = this.slugify(title) || 'campana';
    let slug = base;
    let n = 1;
    // colisiones improbables, pero garantizamos unicidad
    while (await this.prisma.campaign.findUnique({ where: { slug } })) {
      slug = `${base}-${++n}`;
    }
    return slug;
  }

  private progress(c: { goalAmount: number | null; raisedAmount: number }) {
    const pct =
      c.goalAmount && c.goalAmount > 0
        ? Math.min(100, Math.round((c.raisedAmount / c.goalAmount) * 100))
        : 0;
    return pct;
  }

  private isPrivileged(user: AuthUser) {
    return user.role === Role.ADMIN || user.role === Role.MANAGER;
  }

  // ───────── create ─────────

  async create(dto: CreateCampaignDto, user: AuthUser) {
    const slug = await this.uniqueSlug(dto.title);

    const campaign = await this.prisma.campaign.create({
      data: {
        slug,
        title: dto.title,
        summary: dto.summary,
        story: dto.story,
        category: dto.category,
        status: dto.status ?? CampaignStatus.ACTIVE,
        coverPhoto: dto.coverPhoto,
        goalAmount: dto.goalAmount ?? null,
        volunteerSkills: dto.volunteerSkills ?? [],
        deadline: dto.deadline ? new Date(dto.deadline) : null,
        lat: dto.lat,
        lng: dto.lng,
        district: dto.district,
        yapeNumber: dto.yapeNumber,
        yapePhone: dto.yapePhone,
        bankName: dto.bankName,
        bankAccount: dto.bankAccount,
        accountHolder: dto.accountHolder,
        qrImageUrl: dto.qrImageUrl,
        emergencyId: dto.emergencyId,
        organizerId: user.id,
      },
    });

    await this.audit.log(user.id, 'create', 'Campaign', campaign.id, {
      slug,
      goalAmount: campaign.goalAmount,
    });

    return this.shape(campaign);
  }

  // ───────── lists ─────────

  async findAll(query: QueryCampaignsDto) {
    const where: Prisma.CampaignWhereInput = {
      // Por defecto solo se muestran campañas públicas (no borradores).
      status: query.status ?? { not: CampaignStatus.DRAFT },
      ...(query.category ? { category: query.category } : {}),
      ...(query.organizerId ? { organizerId: query.organizerId } : {}),
      ...(query.featured === 'true' ? { featured: true } : {}),
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: 'insensitive' } },
              { summary: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const campaigns = await this.prisma.campaign.findMany({
      where,
      include: {
        organizer: { select: { id: true, fullName: true, avatarUrl: true } },
        _count: { select: { donations: true, updates: true } },
      },
      orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }],
    });
    return campaigns.map((c) => this.shape(c));
  }

  async mine(user: AuthUser) {
    const campaigns = await this.prisma.campaign.findMany({
      where: { organizerId: user.id },
      include: { _count: { select: { donations: true, updates: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return campaigns.map((c) => this.shape(c));
  }

  // ───────── detail ─────────

  async findOne(idOrSlug: string) {
    const campaign = await this.prisma.campaign.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      include: {
        organizer: {
          select: { id: true, fullName: true, avatarUrl: true, createdAt: true },
        },
        updates: { orderBy: { createdAt: 'desc' } },
        _count: { select: { donations: true, updates: true } },
      },
    });
    if (!campaign) throw new NotFoundException('Campaña no encontrada');

    // Donantes recientes (respeta anonimato).
    const recent = await this.prisma.donation.findMany({
      where: { campaignId: campaign.id, type: 'MONEY' },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: {
        id: true,
        amount: true,
        anonymous: true,
        donorName: true,
        createdAt: true,
        donor: { select: { fullName: true } },
      },
    });
    const recentDonors = recent.map((d) => ({
      id: d.id,
      amount: d.amount,
      createdAt: d.createdAt,
      name: d.anonymous
        ? 'Anónimo'
        : d.donor?.fullName ?? d.donorName ?? 'Donante',
    }));

    return { ...this.shape(campaign), recentDonors };
  }

  // ───────── update ─────────

  async assertOwner(id: string, user: AuthUser) {
    const campaign = await this.prisma.campaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundException('Campaña no encontrada');
    if (campaign.organizerId !== user.id && !this.isPrivileged(user)) {
      throw new ForbiddenException('No eres el organizador de esta campaña');
    }
    return campaign;
  }

  async update(id: string, dto: UpdateCampaignDto, user: AuthUser) {
    await this.assertOwner(id, user);

    const data: Prisma.CampaignUpdateInput = {
      ...(dto.title !== undefined ? { title: dto.title } : {}),
      ...(dto.summary !== undefined ? { summary: dto.summary } : {}),
      ...(dto.story !== undefined ? { story: dto.story } : {}),
      ...(dto.category !== undefined ? { category: dto.category } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.coverPhoto !== undefined ? { coverPhoto: dto.coverPhoto } : {}),
      ...(dto.goalAmount !== undefined ? { goalAmount: dto.goalAmount ?? null } : {}),
      ...(dto.volunteerSkills !== undefined ? { volunteerSkills: dto.volunteerSkills } : {}),
      ...(dto.deadline !== undefined
        ? { deadline: dto.deadline ? new Date(dto.deadline) : null }
        : {}),
      ...(dto.lat !== undefined ? { lat: dto.lat } : {}),
      ...(dto.lng !== undefined ? { lng: dto.lng } : {}),
      ...(dto.district !== undefined ? { district: dto.district } : {}),
      ...(dto.yapeNumber !== undefined ? { yapeNumber: dto.yapeNumber } : {}),
      ...(dto.yapePhone !== undefined ? { yapePhone: dto.yapePhone } : {}),
      ...(dto.bankName !== undefined ? { bankName: dto.bankName } : {}),
      ...(dto.bankAccount !== undefined ? { bankAccount: dto.bankAccount } : {}),
      ...(dto.accountHolder !== undefined ? { accountHolder: dto.accountHolder } : {}),
      ...(dto.qrImageUrl !== undefined ? { qrImageUrl: dto.qrImageUrl } : {}),
    };

    const updated = await this.prisma.campaign.update({ where: { id }, data });
    await this.audit.log(user.id, 'update', 'Campaign', id, { ...dto });
    return this.shape(updated);
  }

  // ───────── updates (avances) ─────────

  async addUpdate(id: string, dto: CreateCampaignUpdateDto, user: AuthUser) {
    await this.assertOwner(id, user);
    const update = await this.prisma.campaignUpdate.create({
      data: {
        campaignId: id,
        title: dto.title,
        body: dto.body,
        photoUrl: dto.photoUrl,
      },
    });
    await this.audit.log(user.id, 'create', 'CampaignUpdate', update.id, {
      campaignId: id,
    });
    return update;
  }

  // ───────── shaping ─────────

  private shape<T extends { goalAmount: number | null; raisedAmount: number }>(c: T) {
    return { ...c, progressPct: this.progress(c) };
  }
}
