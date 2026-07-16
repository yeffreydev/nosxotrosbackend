import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { CampaignsService } from '../campaigns/campaigns.service';
import { CreateCampaignDto } from '../campaigns/dto/create-campaign.dto';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { CreateEmergencyDto } from './dto/create-emergency.dto';
import { UpdateEmergencyDto } from './dto/update-emergency.dto';
import { QueryEmergenciesDto } from './dto/query-emergencies.dto';
import { CreateNeedDto } from './dto/create-need.dto';
import { UpdateNeedDto } from './dto/update-need.dto';
import { CreateEmergencyReportDto } from './dto/create-emergency-report.dto';
import { UpdateEmergencyReportDto } from './dto/update-emergency-report.dto';
import { QueryEmergencyReportsDto } from './dto/query-emergency-reports.dto';

@Injectable()
export class EmergenciesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly campaigns: CampaignsService,
  ) {}

  /** Crea una campaña a partir de una emergencia (la lanza el gestor). */
  async createCampaignFromEmergency(id: string, user: AuthUser) {
    const emergency = await this.prisma.emergency.findUnique({
      where: { id },
      include: { campaigns: { select: { id: true }, take: 1 } },
    });
    if (!emergency) throw new NotFoundException('Emergencia no encontrada');
    if (emergency.campaigns.length > 0) {
      throw new BadRequestException('Esta emergencia ya tiene una campaña');
    }

    const desc = emergency.description?.trim() || '';
    const summary =
      desc.length >= 10
        ? desc.slice(0, 280)
        : `Campaña de respuesta a la emergencia "${emergency.title}".`;
    const story =
      desc.length >= 20
        ? desc
        : `${desc}\n\nCampaña de respuesta a la emergencia "${emergency.title}" en ${emergency.district ?? 'Arequipa'}.`;

    const campaign = await this.campaigns.create(
      {
        title: emergency.title,
        summary,
        story,
        category: 'EMERGENCY' as CreateCampaignDto['category'],
        district: emergency.district ?? undefined,
        lat: emergency.lat,
        lng: emergency.lng,
        emergencyId: emergency.id,
      } as CreateCampaignDto,
      user,
    );

    await this.audit.log(user.id, 'create_from_emergency', 'Campaign', campaign.id, {
      emergencyId: id,
    });
    return campaign;
  }

  private haversineKm(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  async findAll(query: QueryEmergenciesDto) {
    const emergencies = await this.prisma.emergency.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.severity ? { severity: query.severity } : {}),
      },
      include: {
        needs: { include: { category: true } },
        campaigns: { select: { id: true, slug: true, title: true } },
        _count: {
          select: {
            needs: true,
            beneficiaries: true,
            donations: true,
            shifts: true,
          },
        },
      },
      orderBy: [{ severity: 'desc' }, { startedAt: 'desc' }],
    });
    return emergencies;
  }

  async findOne(id: string) {
    const emergency = await this.prisma.emergency.findUnique({
      where: { id },
      include: {
        needs: { include: { category: true } },
        primaryCenter: true,
        _count: {
          select: {
            needs: true,
            beneficiaries: true,
            donations: true,
            shifts: true,
          },
        },
      },
    });
    if (!emergency) throw new NotFoundException('Emergencia no encontrada');

    const allCenters = await this.prisma.center.findMany();
    const nearbyCenters = allCenters
      .map((c) => ({
        ...c,
        distanceKm:
          Math.round(
            this.haversineKm(emergency.lat, emergency.lng, c.lat, c.lng) * 10,
          ) / 10,
        loadPct:
          c.capacity > 0
            ? Math.round((c.currentLoad / c.capacity) * 100)
            : 0,
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 5);

    const beneficiariesServed = await this.prisma.beneficiary.count({
      where: { emergencyId: id, status: 'SERVED' },
    });

    return {
      ...emergency,
      centers: nearbyCenters,
      stats: {
        needs: emergency._count.needs,
        beneficiaries: emergency._count.beneficiaries,
        beneficiariesServed,
        donations: emergency._count.donations,
        shifts: emergency._count.shifts,
      },
    };
  }

  async map() {
    const emergencies = await this.prisma.emergency.findMany({
      include: {
        _count: { select: { needs: true, beneficiaries: true } },
      },
    });
    return emergencies.map((e) => ({
      id: e.id,
      title: e.title,
      lat: e.lat,
      lng: e.lng,
      severity: e.severity,
      status: e.status,
      needsCount: e._count.needs,
      beneficiariesCount: e._count.beneficiaries,
    }));
  }

  async create(dto: CreateEmergencyDto, userId: string) {
    const emergency = await this.prisma.emergency.create({
      data: {
        title: dto.title,
        description: dto.description,
        status: dto.status,
        severity: dto.severity,
        lat: dto.lat,
        lng: dto.lng,
        address: dto.address,
        district: dto.district,
        coverPhoto: dto.coverPhoto,
        mapUrl: dto.mapUrl,
        primaryCenterId: dto.primaryCenterId,
      },
    });
    await this.audit.log(userId, 'create', 'Emergency', emergency.id);
    return emergency;
  }

  async update(id: string, dto: UpdateEmergencyDto, userId: string) {
    const existing = await this.prisma.emergency.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Emergencia no encontrada');

    const data: any = { ...dto };
    if (dto.status === 'CLOSED' && !existing.closedAt) {
      data.closedAt = new Date();
    }

    const emergency = await this.prisma.emergency.update({
      where: { id },
      data,
    });
    await this.audit.log(userId, 'update', 'Emergency', id, { ...dto });
    return emergency;
  }

  // ───────── Needs ─────────

  async listNeeds(emergencyId: string) {
    const emergency = await this.prisma.emergency.findUnique({
      where: { id: emergencyId },
    });
    if (!emergency) throw new NotFoundException('Emergencia no encontrada');
    return this.prisma.need.findMany({
      where: { emergencyId },
      include: { category: true },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async createNeed(emergencyId: string, dto: CreateNeedDto, userId: string) {
    const emergency = await this.prisma.emergency.findUnique({
      where: { id: emergencyId },
    });
    if (!emergency) throw new NotFoundException('Emergencia no encontrada');

    const need = await this.prisma.need.create({
      data: {
        emergencyId,
        title: dto.title,
        categoryId: dto.categoryId,
        targetQty: dto.targetQty,
        unit: dto.unit,
        priority: dto.priority,
        isBlocked: dto.isBlocked ?? false,
      },
      include: { category: true },
    });
    await this.audit.log(userId, 'create', 'Need', need.id, { emergencyId });
    return need;
  }

  async updateNeed(id: string, dto: UpdateNeedDto, userId: string) {
    const existing = await this.prisma.need.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Necesidad no encontrada');

    const need = await this.prisma.need.update({
      where: { id },
      data: { ...dto },
      include: { category: true },
    });
    await this.audit.log(userId, 'update', 'Need', id, { ...dto });
    return need;
  }

  // ───────── Reportes ciudadanos (anónimos) ─────────

  async createReport(dto: CreateEmergencyReportDto) {
    const report = await this.prisma.emergencyReport.create({
      data: {
        title: dto.title,
        description: dto.description,
        severity: dto.severity,
        lat: dto.lat,
        lng: dto.lng,
        address: dto.address,
        district: dto.district,
        photoUrl: dto.photoUrl,
        reporterName: dto.reporterName,
        reporterPhone: dto.reporterPhone,
        anonymous: dto.anonymous ?? true,
      },
    });
    // Sin auditoría: reporte anónimo, sin userId.
    return {
      id: report.id,
      code: report.code,
      status: report.status,
      createdAt: report.createdAt,
    };
  }

  async trackReport(code: string) {
    const report = await this.prisma.emergencyReport.findUnique({
      where: { code },
      include: { emergency: { select: { id: true, title: true, status: true } } },
    });
    if (!report) throw new NotFoundException('Código de reporte no válido');

    const safe = { ...report } as any;
    if (report.anonymous) {
      safe.reporterName = null;
      safe.reporterPhone = null;
    }
    return safe;
  }

  async listReports(query: QueryEmergencyReportsDto) {
    return this.prisma.emergencyReport.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
      },
      include: { emergency: { select: { id: true, title: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateReport(
    id: string,
    dto: UpdateEmergencyReportDto,
    userId: string,
  ) {
    const existing = await this.prisma.emergencyReport.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Reporte no encontrado');

    const data: any = { ...dto };
    if (
      (dto.status === 'REVIEWED' || dto.status === 'REJECTED') &&
      !existing.reviewedAt
    ) {
      data.reviewedAt = new Date();
    }

    const report = await this.prisma.emergencyReport.update({
      where: { id },
      data,
    });
    await this.audit.log(userId, 'update', 'EmergencyReport', id, { ...dto });
    return report;
  }

  async convertReport(id: string, userId: string) {
    const report = await this.prisma.emergencyReport.findUnique({
      where: { id },
    });
    if (!report) throw new NotFoundException('Reporte no encontrado');
    if (report.status === 'CONVERTED') {
      throw new BadRequestException('El reporte ya fue convertido');
    }

    const emergency = await this.prisma.emergency.create({
      data: {
        title: report.title,
        description: report.description,
        severity: report.severity,
        lat: report.lat ?? -16.409047,
        lng: report.lng ?? -71.537451,
        address: report.address,
        district: report.district,
        coverPhoto: report.photoUrl,
      },
    });

    await this.prisma.emergencyReport.update({
      where: { id },
      data: {
        status: 'CONVERTED',
        reviewedAt: new Date(),
        emergencyId: emergency.id,
      },
    });

    await this.audit.log(userId, 'convert', 'EmergencyReport', id, {
      emergencyId: emergency.id,
    });

    return emergency;
  }
}
