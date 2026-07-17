import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  DonationStatus,
  DonationType,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  Role,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { CreateDonationDto, Weekday } from './dto/create-donation.dto';
import { UpdateDonationStatusDto } from './dto/update-donation-status.dto';
import { ConfirmPaymentDto } from './dto/confirm-payment.dto';
import { QueryDonationsDto } from './dto/query-donations.dto';

const DAY_LABEL: Record<Weekday, string> = {
  MON: 'Lun',
  TUE: 'Mar',
  WED: 'Mié',
  THU: 'Jue',
  FRI: 'Vie',
  SAT: 'Sáb',
  SUN: 'Dom',
};

@Injectable()
export class DonationsService {
  private readonly logger = new Logger(DonationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private resolvePaymentMethod(dto: CreateDonationDto): PaymentMethod {
    if (dto.type === DonationType.MONEY) {
      return dto.paymentMethod ?? PaymentMethod.YAPE;
    }
    // GOODS / TIME are received in kind
    return PaymentMethod.IN_KIND;
  }

  async create(dto: CreateDonationDto, user?: AuthUser) {
    // Voluntariado (TIME) requiere teléfono de contacto.
    if (dto.type === DonationType.TIME && !dto.donorPhone?.trim()) {
      throw new BadRequestException(
        'El teléfono es obligatorio para voluntariado',
      );
    }
    const method = this.resolvePaymentMethod(dto);
    const amount =
      dto.type === DonationType.MONEY ? dto.amount ?? 0 : dto.amount ?? 0;

    const donation = await this.prisma.donation.create({
      data: {
        type: dto.type,
        status: DonationStatus.PROMISED,
        amount: dto.type === DonationType.MONEY ? dto.amount ?? null : null,
        description: dto.description,
        quantity: dto.quantity,
        anonymous: dto.anonymous ?? false,
        donorName: dto.donorName,
        donorEmail: dto.donorEmail,
        donorPhone: dto.donorPhone,
        donorId: user?.id ?? null,
        emergencyId: dto.emergencyId,
        campaignId: dto.campaignId,
        categoryId: dto.categoryId,
        centerId: dto.centerId,
        payment: {
          create: {
            method,
            status: PaymentStatus.PENDING,
            amount,
          },
        },
        events: {
          create: {
            status: DonationStatus.PROMISED,
            title: 'Donación registrada',
            note: 'Tu donación ha sido registrada. ¡Gracias!',
          },
        },
      },
      include: { payment: true, events: { orderBy: { createdAt: 'asc' } } },
    });

    // Crowdfunding: el aporte monetario a una campaña suma al recaudado al instante.
    if (dto.campaignId && dto.type === DonationType.MONEY) {
      await this.applyCampaignContribution(dto.campaignId, dto.amount ?? 0);
    }

    // Voluntariado a una campaña: el donante entra a sus voluntarios. Sin esto la
    // oferta de ayuda moría como donación y el organizador nunca la veía.
    if (dto.campaignId && dto.type === DonationType.TIME) {
      await this.enrollCampaignVolunteer(dto, donation.id, user);
    }

    await this.audit.log(user?.id ?? null, 'create', 'Donation', donation.id, {
      type: donation.type,
      code: donation.code,
    });

    return donation;
  }

  /**
   * Inscribe al donante de voluntariado en los voluntarios de la campaña.
   *
   * Con sesión se engancha a su VolunteerProfile (así puede entrar a brigadas);
   * sin ella queda como invitado, con el contacto que declaró al donar. Falla en
   * silencio: la donación ya está registrada y no se pierde por no poder inscribir.
   */
  private async enrollCampaignVolunteer(
    dto: CreateDonationDto,
    donationId: string,
    user?: AuthUser,
  ) {
    const campaignId = dto.campaignId;
    if (!campaignId) return;

    const skills = dto.volunteerSkills ?? [];
    const note = this.buildVolunteerNote(dto);

    try {
      if (user?.id) {
        const profile = await this.prisma.volunteerProfile.upsert({
          where: { userId: user.id },
          update: {},
          create: { userId: user.id, skills },
        });
        // Si ya estaba inscrito se refresca con lo último que ofreció.
        await this.prisma.campaignVolunteer.upsert({
          where: {
            campaignId_volunteerId: { campaignId, volunteerId: profile.id },
          },
          update: { skills, note, donationId },
          create: { campaignId, volunteerId: profile.id, skills, note, donationId },
        });
        return;
      }

      await this.prisma.campaignVolunteer.create({
        data: {
          campaignId,
          donationId,
          guestName: dto.donorName?.trim() || null,
          guestEmail: dto.donorEmail?.trim() || null,
          guestPhone: dto.donorPhone?.trim() || null,
          skills,
          note,
        },
      });
    } catch (err) {
      this.logger.error(
        `No se pudo inscribir al voluntario de la donación ${donationId}: ${
          err instanceof Error ? err.message : err
        }`,
      );
    }
  }

  /** Disponibilidad + mensaje, en una línea legible para el organizador. */
  private buildVolunteerNote(dto: CreateDonationDto): string | undefined {
    const parts: string[] = [];
    if (dto.volunteerDays?.length) {
      const days = dto.volunteerDays.map((d) => DAY_LABEL[d]).join(', ');
      parts.push(`Días: ${days}`);
    }
    if (dto.volunteerStartTime && dto.volunteerEndTime) {
      parts.push(`Horario: ${dto.volunteerStartTime} a ${dto.volunteerEndTime}`);
    }
    const message = dto.description?.trim();
    if (message) parts.push(message);
    return parts.length ? parts.join(' · ') : undefined;
  }

  // Suma el aporte al total recaudado de la campaña y marca FUNDED si llega a la meta.
  private async applyCampaignContribution(campaignId: string, amount: number) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) return;

    const raised = campaign.raisedAmount + amount;
    const reachedGoal =
      campaign.goalAmount != null &&
      campaign.goalAmount > 0 &&
      raised >= campaign.goalAmount;

    await this.prisma.campaign.update({
      where: { id: campaignId },
      data: {
        raisedAmount: raised,
        backersCount: { increment: 1 },
        ...(reachedGoal && campaign.status === 'ACTIVE'
          ? { status: 'FUNDED' }
          : {}),
      },
    });
  }

  async findAll(query: QueryDonationsDto, user: AuthUser) {
    const isPrivileged =
      user.role === Role.MANAGER || user.role === Role.ADMIN;
    const donations = await this.prisma.donation.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.type ? { type: query.type } : {}),
        ...(query.emergencyId ? { emergencyId: query.emergencyId } : {}),
        ...(query.campaignId ? { campaignId: query.campaignId } : {}),
        ...(isPrivileged ? {} : { donorId: user.id }),
      },
      include: {
        payment: true,
        events: { orderBy: { createdAt: 'asc' } },
        emergency: true,
        campaign: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return donations;
  }

  async findOne(id: string, user: AuthUser) {
    const donation = await this.prisma.donation.findUnique({
      where: { id },
      include: {
        payment: true,
        events: { orderBy: { createdAt: 'asc' } },
        emergency: true,
        campaign: true,
      },
    });
    if (!donation) throw new NotFoundException('Donación no encontrada');
    const isPrivileged =
      user.role === Role.MANAGER || user.role === Role.ADMIN;
    if (!isPrivileged && donation.donorId !== user.id) {
      throw new ForbiddenException('No autorizado a ver esta donación');
    }
    return donation;
  }

  async track(code: string) {
    const donation = await this.prisma.donation.findUnique({
      where: { code },
      include: {
        events: { orderBy: { createdAt: 'asc' } },
        emergency: true,
        campaign: true,
        payment: true,
      },
    });
    if (!donation) throw new NotFoundException('Código de donación no válido');

    const category = donation.categoryId
      ? await this.prisma.category.findUnique({
          where: { id: donation.categoryId },
        })
      : null;

    // Strip donor PII if anonymous
    const safe = { ...donation } as any;
    if (donation.anonymous) {
      safe.donorName = null;
      safe.donorEmail = null;
      safe.donorPhone = null;
      safe.donorId = null;
    }
    return { ...safe, category };
  }

  async lookupByEmail(email: string) {
    return this.lookupDonations({
      donorEmail: { equals: email, mode: 'insensitive' },
    });
  }

  async lookupByPhone(phone: string) {
    return this.lookupDonations({ donorPhone: phone });
  }

  private async lookupDonations(where: Prisma.DonationWhereInput) {
    const donations = await this.prisma.donation.findMany({
      where,
      include: {
        payment: true,
        emergency: { select: { id: true, title: true } },
        campaign: { select: { id: true, title: true, slug: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return donations.map((d) => ({
      id: d.id,
      code: d.code,
      type: d.type,
      status: d.status,
      amount: d.amount,
      currency: d.currency,
      description: d.description,
      quantity: d.quantity,
      anonymous: d.anonymous,
      createdAt: d.createdAt,
      emergency: d.emergency,
      campaign: d.campaign,
      paymentStatus: d.payment?.status ?? null,
    }));
  }

  async updateStatus(id: string, dto: UpdateDonationStatusDto, user: AuthUser) {
    const donation = await this.prisma.donation.findUnique({ where: { id } });
    if (!donation) throw new NotFoundException('Donación no encontrada');

    const updated = await this.prisma.donation.update({
      where: { id },
      data: {
        status: dto.status,
        events: {
          create: {
            status: dto.status,
            title: this.statusTitle(dto.status),
            note: dto.note,
            lat: dto.lat,
            lng: dto.lng,
            photoUrl: dto.photoUrl,
          },
        },
      },
      include: {
        payment: true,
        events: { orderBy: { createdAt: 'asc' } },
        emergency: true,
        campaign: true,
      },
    });

    await this.audit.log(user.id, 'update-status', 'Donation', id, {
      status: dto.status,
    });

    return updated;
  }

  private statusTitle(status: DonationStatus): string {
    switch (status) {
      case DonationStatus.PROMISED:
        return 'Donación prometida';
      case DonationStatus.RECEIVED:
        return 'Recibida en acopio';
      case DonationStatus.IN_TRANSIT:
        return 'En camino';
      case DonationStatus.DELIVERED:
        return 'Entregada a beneficiarios';
      case DonationStatus.CANCELLED:
        return 'Donación cancelada';
      default:
        return 'Actualización';
    }
  }

  async confirmPayment(
    id: string,
    dto: ConfirmPaymentDto,
    user?: AuthUser,
  ) {
    const donation = await this.prisma.donation.findUnique({
      where: { id },
      include: { payment: true },
    });
    if (!donation) throw new NotFoundException('Donación no encontrada');
    if (!donation.payment) {
      throw new NotFoundException('La donación no tiene un pago asociado');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { donationId: id },
        data: {
          status: PaymentStatus.PAID,
          paidAt: new Date(),
          reference: dto.reference,
        },
      });
      return tx.donation.update({
        where: { id },
        data: {
          status: DonationStatus.RECEIVED,
          events: {
            create: {
              status: DonationStatus.RECEIVED,
              title: 'Pago confirmado / recibida',
              note: 'El pago fue confirmado e ingresó al acopio.',
            },
          },
        },
        include: {
          payment: true,
          events: { orderBy: { createdAt: 'asc' } },
          emergency: true,
        campaign: true,
        },
      });
    });

    await this.audit.log(user?.id ?? null, 'confirm-payment', 'Donation', id, {
      reference: dto.reference,
    });

    return updated;
  }
}
