import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma, Role, VolunteerProfile } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { startOfCalendarDay } from '../common/date.util';
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

  // ───────── Disponibilidad del propio voluntario ─────────
  // El voluntario declara cuándo puede venir sin depender de que el organizador
  // se lo pregunte. Es la misma tabla que ve el organizador en su panel.

  async listMySchedules(userId: string) {
    const profile = await this.ensureProfile(userId);
    return this.listSchedules(profile.id);
  }

  async addMySchedule(userId: string, dto: CreateScheduleDto) {
    const profile = await this.ensureProfile(userId);
    return this.addSchedule(profile.id, dto, userId);
  }

  async removeMySchedule(userId: string, scheduleId: string) {
    const profile = await this.ensureProfile(userId);
    return this.removeSchedule(profile.id, scheduleId, userId);
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

  /**
   * Registra disponibilidad: un día concreto (`date`) o días de la semana
   * recurrentes (`weekdays`). Si llegan los dos, manda la fecha: un día suelto
   * es más específico que "todos los martes".
   *
   * Las fechas se guardan como días del calendario (medianoche UTC del día
   * escrito). Si se guardaran como instantes, un horario del martes declarado
   * desde Perú se leería como del lunes al buscar quién viene hoy.
   */
  async addSchedule(volunteerId: string, dto: CreateScheduleDto, userId: string) {
    const profile = await this.prisma.volunteerProfile.findUnique({
      where: { id: volunteerId },
    });
    if (!profile) throw new NotFoundException('Voluntario no encontrado');

    if (dto.endTime <= dto.startTime) {
      throw new BadRequestException('La hora de fin debe ser posterior a la de inicio');
    }
    const weekdays = dto.date ? [] : dto.weekdays ?? [];
    if (!dto.date && weekdays.length === 0) {
      throw new BadRequestException(
        'Elige una fecha o marca los días de la semana en que puede venir',
      );
    }
    const day = this.calendarDay(dto.date, 'La fecha del horario no es válida');
    const validFrom = this.calendarDay(dto.validFrom, 'La fecha "desde" no es válida');
    const validTo = this.calendarDay(dto.validTo, 'La fecha "hasta" no es válida');
    if (validFrom && validTo && validTo < validFrom) {
      throw new BadRequestException('La fecha "hasta" debe ser posterior a la de inicio');
    }

    const schedule = await this.prisma.volunteerSchedule.create({
      data: {
        volunteerId,
        campaignId: dto.campaignId,
        date: day,
        weekdays,
        validFrom,
        validTo,
        startTime: dto.startTime,
        endTime: dto.endTime,
        note: dto.note,
      },
    });
    await this.audit.log(userId, 'create', 'VolunteerSchedule', schedule.id);
    return schedule;
  }

  /** Día del calendario de una fecha opcional del formulario. */
  private calendarDay(value: string | undefined, message: string): Date | null {
    if (!value) return null;
    const day = startOfCalendarDay(value);
    if (!day) throw new BadRequestException(message);
    return day;
  }

  listSchedules(volunteerId: string) {
    return this.prisma.volunteerSchedule.findMany({
      where: { volunteerId },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async removeSchedule(volunteerId: string, scheduleId: string, userId: string) {
    const schedule = await this.prisma.volunteerSchedule.findFirst({
      where: { id: scheduleId, volunteerId },
    });
    if (!schedule) throw new NotFoundException('Horario no encontrado');
    await this.prisma.volunteerSchedule.delete({ where: { id: scheduleId } });
    await this.audit.log(userId, 'delete', 'VolunteerSchedule', scheduleId);
    return { deleted: true };
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
