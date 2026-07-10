import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AssignmentStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { VolunteersService } from '../volunteers/volunteers.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { CreateShiftDto } from './dto/create-shift.dto';
import { QueryShiftsDto } from './dto/query-shifts.dto';
import { CheckinDto } from './dto/checkin.dto';

@Injectable()
export class ShiftsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly volunteers: VolunteersService,
  ) {}

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

  async findAll(query: QueryShiftsDto, user?: AuthUser) {
    let shifts = await this.prisma.shift.findMany({
      where: {
        ...(query.skill ? { skill: query.skill } : {}),
        ...(query.emergencyId ? { emergencyId: query.emergencyId } : {}),
        ...(query.centerId ? { centerId: query.centerId } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      include: {
        emergency: { select: { id: true, title: true } },
        center: { select: { id: true, name: true } },
        _count: { select: { assignments: true } },
      },
      orderBy: { startsAt: 'asc' },
    });

    // Near filtering by radius (default radius from volunteer profile or 10km)
    if (query.near === '1' && query.lat && query.lng) {
      const lat = parseFloat(query.lat);
      const lng = parseFloat(query.lng);
      let radiusKm = 10;
      if (user) {
        const profile = await this.prisma.volunteerProfile.findUnique({
          where: { userId: user.id },
        });
        if (profile?.radiusKm) radiusKm = profile.radiusKm;
      }
      shifts = shifts.filter((s) => {
        if (s.lat == null || s.lng == null) return false;
        return this.haversineKm(lat, lng, s.lat, s.lng) <= radiusKm;
      });
    }

    // enrolled flag for volunteers
    if (user && user.role === Role.VOLUNTEER) {
      const profile = await this.prisma.volunteerProfile.findUnique({
        where: { userId: user.id },
      });
      const enrolledIds = new Set<string>();
      if (profile) {
        const assignments = await this.prisma.shiftAssignment.findMany({
          where: {
            volunteerId: profile.id,
            shiftId: { in: shifts.map((s) => s.id) },
          },
          select: { shiftId: true },
        });
        assignments.forEach((a) => enrolledIds.add(a.shiftId));
      }
      return shifts.map((s) => ({
        ...s,
        enrolled: enrolledIds.has(s.id),
        enrolledCount: s._count.assignments,
      }));
    }

    return shifts.map((s) => ({
      ...s,
      enrolledCount: s._count.assignments,
    }));
  }

  async findOne(id: string) {
    const shift = await this.prisma.shift.findUnique({
      where: { id },
      include: {
        emergency: true,
        center: true,
        assignments: {
          include: {
            volunteer: {
              include: {
                user: { select: { id: true, fullName: true, email: true } },
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!shift) throw new NotFoundException('Turno no encontrado');
    return shift;
  }

  async create(dto: CreateShiftDto, userId: string) {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (endsAt <= startsAt) {
      throw new BadRequestException(
        'endsAt debe ser posterior a startsAt',
      );
    }
    const shift = await this.prisma.shift.create({
      data: {
        title: dto.title,
        description: dto.description,
        skill: dto.skill,
        startsAt,
        endsAt,
        capacity: dto.capacity,
        status: dto.status,
        lat: dto.lat,
        lng: dto.lng,
        address: dto.address,
        emergencyId: dto.emergencyId,
        centerId: dto.centerId,
      },
    });
    await this.audit.log(userId, 'create', 'Shift', shift.id);
    return shift;
  }

  async enroll(shiftId: string, user: AuthUser) {
    const shift = await this.prisma.shift.findUnique({
      where: { id: shiftId },
      include: { _count: { select: { assignments: true } } },
    });
    if (!shift) throw new NotFoundException('Turno no encontrado');

    const profile = await this.volunteers.ensureProfile(user.id);

    const existing = await this.prisma.shiftAssignment.findUnique({
      where: {
        shiftId_volunteerId: { shiftId, volunteerId: profile.id },
      },
    });
    if (existing) {
      throw new ConflictException('Ya estás inscrito en este turno');
    }

    const assignment = await this.prisma.shiftAssignment.create({
      data: {
        shiftId,
        volunteerId: profile.id,
        status: AssignmentStatus.ENROLLED,
      },
    });

    // mark shift FULL if capacity reached
    if (shift._count.assignments + 1 >= shift.capacity) {
      await this.prisma.shift.update({
        where: { id: shiftId },
        data: { status: 'FULL' },
      });
    }

    await this.audit.log(user.id, 'enroll', 'ShiftAssignment', assignment.id, {
      shiftId,
    });
    return assignment;
  }

  async checkin(shiftId: string, dto: CheckinDto, user: AuthUser) {
    const profile = await this.volunteers.ensureProfile(user.id);
    const assignment = await this.prisma.shiftAssignment.findUnique({
      where: {
        shiftId_volunteerId: { shiftId, volunteerId: profile.id },
      },
    });
    if (!assignment) {
      throw new NotFoundException('No estás inscrito en este turno');
    }
    const updated = await this.prisma.shiftAssignment.update({
      where: { id: assignment.id },
      data: {
        status: AssignmentStatus.CHECKED_IN,
        checkInAt: new Date(),
        checkInLat: dto.lat,
        checkInLng: dto.lng,
      },
    });
    await this.audit.log(user.id, 'checkin', 'ShiftAssignment', assignment.id, {
      shiftId,
    });
    return updated;
  }

  async checkout(shiftId: string, user: AuthUser) {
    const profile = await this.volunteers.ensureProfile(user.id);
    const assignment = await this.prisma.shiftAssignment.findUnique({
      where: {
        shiftId_volunteerId: { shiftId, volunteerId: profile.id },
      },
    });
    if (!assignment) {
      throw new NotFoundException('No estás inscrito en este turno');
    }
    if (!assignment.checkInAt) {
      throw new BadRequestException(
        'Debes hacer check-in antes de hacer check-out',
      );
    }
    if (assignment.status === AssignmentStatus.CHECKED_OUT) {
      throw new ConflictException('Ya hiciste check-out de este turno');
    }

    const checkOutAt = new Date();
    const hours =
      Math.round(
        ((checkOutAt.getTime() - assignment.checkInAt.getTime()) / 3600000) *
          10,
      ) / 10;
    const points = Math.round(hours * 10);

    const newTotalHours =
      Math.round((profile.totalHours + hours) * 10) / 10;
    const newPoints = profile.impactPoints + points;

    // Award badges
    const badges = new Set<string>(profile.badges);
    badges.add('Primer turno');
    if (newTotalHours >= 10) badges.add('10 horas');
    if (newTotalHours >= 50) badges.add('Voluntario de oro');

    const result = await this.prisma.$transaction(async (tx) => {
      const updatedAssignment = await tx.shiftAssignment.update({
        where: { id: assignment.id },
        data: {
          status: AssignmentStatus.CHECKED_OUT,
          checkOutAt,
          hours,
        },
      });
      const updatedProfile = await tx.volunteerProfile.update({
        where: { id: profile.id },
        data: {
          totalHours: newTotalHours,
          impactPoints: newPoints,
          badges: Array.from(badges),
        },
      });
      return { assignment: updatedAssignment, profile: updatedProfile };
    });

    await this.audit.log(
      user.id,
      'checkout',
      'ShiftAssignment',
      assignment.id,
      { shiftId, hours, points },
    );

    return {
      ...result.assignment,
      earnedHours: hours,
      earnedPoints: points,
      passport: {
        totalHours: result.profile.totalHours,
        impactPoints: result.profile.impactPoints,
        badges: result.profile.badges,
      },
    };
  }
}
