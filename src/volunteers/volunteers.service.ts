import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma, Role, VolunteerProfile } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { UpdateVolunteerDto } from './dto/update-volunteer.dto';
import { CreateVolunteerDto } from './dto/create-volunteer.dto';
import { CreateScheduleDto } from './dto/create-schedule.dto';

@Injectable()
export class VolunteersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Ensures the volunteer profile exists (creates lazily for VOLUNTEER users). */
  async ensureProfile(userId: string): Promise<VolunteerProfile> {
    const existing = await this.prisma.volunteerProfile.findUnique({
      where: { userId },
    });
    if (existing) return existing;
    return this.prisma.volunteerProfile.create({ data: { userId } });
  }

  async getMe(userId: string) {
    const profile = await this.ensureProfile(userId);
    const full = await this.prisma.volunteerProfile.findUnique({
      where: { id: profile.id },
      include: {
        user: { select: { id: true, fullName: true, email: true } },
        brigadeMemberships: {
          include: {
            brigade: {
              include: {
                campaign: { select: { id: true, title: true, slug: true } },
                zone: { include: { needs: { include: { category: true } } } },
              },
            },
          },
        },
      },
    });
    if (!full) return full;

    // Aplana las brigadas del voluntario: zona, punto de encuentro, mapa, teléfono, necesidades.
    const brigades = full.brigadeMemberships.map((m) => ({
      memberId: m.id,
      role: m.role,
      brigadeId: m.brigade.id,
      name: m.brigade.name,
      meetingPoint: m.brigade.meetingPoint,
      meetingPointMapUrl: m.brigade.meetingPointMapUrl,
      contactPhone: m.brigade.contactPhone,
      campaign: m.brigade.campaign,
      zone: m.brigade.zone
        ? {
            id: m.brigade.zone.id,
            name: m.brigade.zone.name,
            mapUrl: m.brigade.zone.mapUrl,
            reference: m.brigade.zone.reference,
            severity: m.brigade.zone.severity,
            needs: m.brigade.zone.needs,
          }
        : null,
    }));

    const { brigadeMemberships: _omit, ...rest } = full;
    return { ...rest, brigades };
  }

  // ───────── Gestión por el gestor (nivel de sistema) ─────────

  /** Alta de voluntario sin cuenta: crea User stub (VOLUNTEER) + perfil. */
  async createByManager(dto: CreateVolunteerDto, managerId: string) {
    const email = dto.email?.trim() || `vol-${randomUUID()}@nosxotros.local`;
    try {
      const user = await this.prisma.user.create({
        data: {
          email,
          fullName: dto.fullName,
          phone: dto.phone?.trim() || undefined,
          role: Role.VOLUNTEER,
          volunteerProfile: {
            create: {
              availability: dto.availability?.trim() || undefined,
              skills: dto.skills ?? [],
            },
          },
        },
        include: { volunteerProfile: true },
      });
      await this.audit.log(
        managerId,
        'create',
        'VolunteerProfile',
        user.volunteerProfile?.id ?? user.id,
      );
      return user;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya existe un usuario con ese correo o teléfono');
      }
      throw e;
    }
  }

  /** Lista de voluntarios del sistema (para el gestor). */
  listAll(q?: string) {
    return this.prisma.volunteerProfile.findMany({
      where: q
        ? { user: { fullName: { contains: q, mode: 'insensitive' } } }
        : undefined,
      include: {
        user: {
          select: { id: true, fullName: true, email: true, phone: true },
        },
        _count: { select: { schedules: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addSchedule(volunteerId: string, dto: CreateScheduleDto, userId: string) {
    const profile = await this.prisma.volunteerProfile.findUnique({
      where: { id: volunteerId },
    });
    if (!profile) throw new NotFoundException('Voluntario no encontrado');
    const schedule = await this.prisma.volunteerSchedule.create({
      data: {
        volunteerId,
        campaignId: dto.campaignId,
        date: dto.date ? new Date(dto.date) : undefined,
        startTime: dto.startTime,
        endTime: dto.endTime,
        note: dto.note,
      },
    });
    await this.audit.log(userId, 'create', 'VolunteerSchedule', schedule.id);
    return schedule;
  }

  listSchedules(volunteerId: string) {
    return this.prisma.volunteerSchedule.findMany({
      where: { volunteerId },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async updateMe(userId: string, dto: UpdateVolunteerDto) {
    const profile = await this.ensureProfile(userId);
    const updated = await this.prisma.volunteerProfile.update({
      where: { id: profile.id },
      data: { ...dto },
    });
    await this.audit.log(userId, 'update', 'VolunteerProfile', profile.id);
    return updated;
  }

  async getPassport(userId: string) {
    const profile = await this.ensureProfile(userId);
    const full = await this.prisma.volunteerProfile.findUnique({
      where: { id: profile.id },
      include: {
        assignments: {
          include: {
            shift: {
              include: { emergency: true, center: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!full) {
      return {
        passportCode: profile.passportCode,
        totalHours: profile.totalHours,
        impactPoints: profile.impactPoints,
        badges: profile.badges,
        history: [],
      };
    }
    return {
      passportCode: full.passportCode,
      totalHours: full.totalHours,
      impactPoints: full.impactPoints,
      badges: full.badges,
      skills: full.skills,
      shiftsCount: full.assignments.length,
      history: full.assignments.map((a) => ({
        assignmentId: a.id,
        status: a.status,
        hours: a.hours,
        checkInAt: a.checkInAt,
        checkOutAt: a.checkOutAt,
        shift: {
          id: a.shift.id,
          title: a.shift.title,
          startsAt: a.shift.startsAt,
          endsAt: a.shift.endsAt,
          skill: a.shift.skill,
          emergency: a.shift.emergency
            ? { id: a.shift.emergency.id, title: a.shift.emergency.title }
            : null,
          center: a.shift.center
            ? { id: a.shift.center.id, name: a.shift.center.name }
            : null,
        },
      })),
    };
  }
}
