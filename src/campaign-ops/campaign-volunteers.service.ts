import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { calendarWeekday } from '../common/date.util';
import { VolunteerAvailabilityService } from '../common/volunteer-availability.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { CampaignsService } from '../campaigns/campaigns.service';
import {
  AddCampaignVolunteerDto,
  EnrollVolunteerDto,
} from './dto/enroll-volunteer.dto';

const ENROLLMENT_INCLUDE = {
  volunteer: {
    include: {
      user: { select: { id: true, fullName: true, email: true, phone: true, avatarUrl: true } },
    },
  },
} as const;

@Injectable()
export class CampaignVolunteersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly campaigns: CampaignsService,
    private readonly availabilityService: VolunteerAvailabilityService,
  ) {}

  /** Voluntarios inscritos + la brigada de la campaña a la que pertenecen (si alguna). */
  async list(campaignId: string, user: AuthUser) {
    await this.campaigns.assertCanManage(campaignId, user);
    const [enrollments, members] = await Promise.all([
      this.prisma.campaignVolunteer.findMany({
        where: { campaignId },
        include: ENROLLMENT_INCLUDE,
        orderBy: { createdAt: 'asc' },
      }),
      // Miembros de brigadas de ESTA campaña, para saber quién ya está asignado.
      this.prisma.brigadeMember.findMany({
        where: { brigade: { campaignId }, volunteerId: { not: null } },
        include: { brigade: { select: { id: true, name: true } } },
      }),
    ]);

    const brigadeByVolunteer = new Map(
      members.map((m) => [
        m.volunteerId as string,
        { memberId: m.id, id: m.brigade.id, name: m.brigade.name, role: m.role },
      ]),
    );

    return enrollments.map((e) => {
      // Sin cuenta: se ofreció desde la web al donar voluntariado. Solo hay
      // contacto declarado, y no puede entrar a una brigada.
      const account = e.volunteer?.user ?? null;
      return {
        id: e.id,
        volunteerId: e.volunteerId,
        skills: e.skills,
        note: e.note,
        createdAt: e.createdAt,
        isGuest: !account,
        donationId: e.donationId,
        user: account,
        // Contacto unificado: da igual si viene de la cuenta o del formulario.
        fullName: account?.fullName ?? e.guestName ?? 'Voluntario',
        email: account?.email ?? e.guestEmail ?? null,
        phone: account?.phone ?? e.guestPhone ?? null,
        brigade: e.volunteerId
          ? brigadeByVolunteer.get(e.volunteerId) ?? null
          : null,
      };
    });
  }

  /** Estado de inscripción del usuario autenticado (para el botón "Inscribirme"). */
  async mine(campaignId: string, user: AuthUser) {
    const profile = await this.prisma.volunteerProfile.findUnique({
      where: { userId: user.id },
    });
    if (!profile) return { enrolled: false as const };
    const enrollment = await this.prisma.campaignVolunteer.findUnique({
      where: {
        campaignId_volunteerId: { campaignId, volunteerId: profile.id },
      },
    });
    if (!enrollment) return { enrolled: false as const };
    return {
      enrolled: true as const,
      id: enrollment.id,
      skills: enrollment.skills,
      note: enrollment.note,
      createdAt: enrollment.createdAt,
    };
  }

  /** El usuario autenticado se inscribe. Crea su perfil de voluntario si no tiene. */
  async enroll(campaignId: string, dto: EnrollVolunteerDto, user: AuthUser) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) throw new NotFoundException('Campaña no encontrada');

    const profile = await this.prisma.volunteerProfile.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id, skills: dto.skills ?? [] },
    });

    return this.createEnrollment(campaignId, profile.id, dto, user.id);
  }

  /** El organizador inscribe a un usuario existente por email. */
  async add(campaignId: string, dto: AddCampaignVolunteerDto, user: AuthUser) {
    await this.campaigns.assertCanManage(campaignId, user);
    const target = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: { volunteerProfile: true },
    });
    if (!target) {
      throw new NotFoundException(
        'No hay ningún usuario registrado con ese correo. Pídele que cree su cuenta.',
      );
    }
    const profile =
      target.volunteerProfile ??
      (await this.prisma.volunteerProfile.create({
        data: { userId: target.id, skills: dto.skills ?? [] },
      }));

    return this.createEnrollment(campaignId, profile.id, dto, user.id);
  }

  /** El usuario autenticado se da de baja (y sale de las brigadas de la campaña). */
  async leave(campaignId: string, user: AuthUser) {
    const profile = await this.prisma.volunteerProfile.findUnique({
      where: { userId: user.id },
    });
    if (!profile) throw new NotFoundException('No estás inscrito en esta campaña');
    return this.deleteEnrollment(campaignId, profile.id, user.id);
  }

  /**
   * El organizador quita a un voluntario de la campaña. Acepta el id del
   * VolunteerProfile o el de la inscripción: los invitados no tienen perfil, así
   * que su fila solo se puede señalar por el id de la inscripción.
   */
  async remove(campaignId: string, volunteerId: string, user: AuthUser) {
    await this.campaigns.assertCanManage(campaignId, user);
    const enrollment = await this.prisma.campaignVolunteer.findFirst({
      where: {
        campaignId,
        OR: [{ volunteerId }, { id: volunteerId }],
      },
    });
    if (!enrollment) throw new NotFoundException('Inscripción no encontrada');
    return this.deleteEnrollmentById(enrollment.id, enrollment.volunteerId, campaignId, user.id);
  }

  /**
   * "¿Con qué voluntarios cuento hoy?".
   *
   * Cruza los inscritos en la campaña con su disponibilidad declarada para un
   * día: horarios puntuales de esa fecha y horarios recurrentes que caen en ese
   * día de la semana. Devuelve disponibles y no disponibles por separado, ya
   * ordenados, para pintarlo sin más cálculo.
   */
  async availability(campaignId: string, user: AuthUser, dateISO?: string) {
    await this.campaigns.assertCanManage(campaignId, user);

    const day = this.availabilityService.resolveDay(dateISO);
    const enrollments = await this.prisma.campaignVolunteer.findMany({
      where: { campaignId },
      include: ENROLLMENT_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });

    const volunteerIds = enrollments
      .map((e) => e.volunteerId)
      .filter((id): id is string => !!id);
    const slotsByVolunteer = await this.availabilityService.slotsByVolunteer(
      volunteerIds,
      day,
    );

    const rows = enrollments.map((e) => {
      const account = e.volunteer?.user ?? null;
      const slots = e.volunteerId ? slotsByVolunteer.get(e.volunteerId) ?? [] : [];
      return {
        id: e.id,
        volunteerId: e.volunteerId,
        fullName: account?.fullName ?? e.guestName ?? 'Voluntario',
        phone: account?.phone ?? e.guestPhone ?? null,
        email: account?.email ?? e.guestEmail ?? null,
        isGuest: !account,
        skills: e.skills,
        available: slots.length > 0,
        slots,
      };
    });

    const available = rows.filter((r) => r.available);
    return {
      date: day.toISOString().slice(0, 10),
      weekday: calendarWeekday(day),
      total: rows.length,
      availableCount: available.length,
      volunteers: [...available, ...rows.filter((r) => !r.available)],
    };
  }

  private async createEnrollment(
    campaignId: string,
    volunteerId: string,
    dto: EnrollVolunteerDto,
    actorId: string,
  ) {
    try {
      const enrollment = await this.prisma.campaignVolunteer.create({
        data: {
          campaignId,
          volunteerId,
          skills: dto.skills ?? [],
          note: dto.note,
        },
        include: ENROLLMENT_INCLUDE,
      });
      await this.audit.log(actorId, 'create', 'CampaignVolunteer', enrollment.id, {
        campaignId,
      });
      return enrollment;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('El voluntario ya está inscrito en esta campaña');
      }
      throw e;
    }
  }

  private async deleteEnrollment(
    campaignId: string,
    volunteerId: string,
    actorId: string,
  ) {
    const enrollment = await this.prisma.campaignVolunteer.findUnique({
      where: { campaignId_volunteerId: { campaignId, volunteerId } },
    });
    if (!enrollment) throw new NotFoundException('Inscripción no encontrada');
    return this.deleteEnrollmentById(enrollment.id, volunteerId, campaignId, actorId);
  }

  private async deleteEnrollmentById(
    id: string,
    volunteerId: string | null,
    campaignId: string,
    actorId: string,
  ) {
    // Al salir de la campaña también deja de ser miembro de sus brigadas. Un
    // invitado nunca estuvo en una, así que no hay nada que limpiar.
    await this.prisma.$transaction([
      ...(volunteerId
        ? [
            this.prisma.brigadeMember.deleteMany({
              where: { volunteerId, brigade: { campaignId } },
            }),
          ]
        : []),
      this.prisma.campaignVolunteer.delete({ where: { id } }),
    ]);
    await this.audit.log(actorId, 'delete', 'CampaignVolunteer', id, {
      campaignId,
    });
    return { deleted: true };
  }
}
