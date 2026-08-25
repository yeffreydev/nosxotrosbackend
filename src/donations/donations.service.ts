import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  CategoryKind,
  CenterStatus,
  Donation,
  DonationStatus,
  DonationType,
  InventoryMovementType,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  Role,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { NeedsProgressService } from '../common/needs-progress.service';
import { normalizeKey } from '../common/text.util';
import { isMedicineText, NO_MEDICINE_MSG } from '../common/policy';
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
    private readonly needs: NeedsProgressService,
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
    // Especies (GOODS): sin centro destino la donación nunca llega a un
    // almacén concreto y se pierde el rastro de a dónde entregarla.
    if (dto.type === DonationType.GOODS && !dto.centerId?.trim()) {
      throw new BadRequestException(
        'Elige un centro de acopio para tu donación en especie',
      );
    }
    // Política de plataforma: no se reciben medicamentos en especie.
    if (dto.type === DonationType.GOODS && isMedicineText(dto.description)) {
      throw new BadRequestException(NO_MEDICINE_MSG);
    }
    // Dinero (MONEY): la cuenta de origen es lo único que le permite al
    // administrador cotejar la transferencia contra el estado de cuenta real
    // antes de acreditarla.
    if (dto.type === DonationType.MONEY && !dto.donorAccountNumber?.trim()) {
      throw new BadRequestException(
        'Indica el número de cuenta desde el que transferiste',
      );
    }
    // Sin número de operación ni voucher, el administrador no tiene con qué
    // cotejar el abono contra el estado de cuenta: la donación quedaría
    // atrapada para siempre en "no acreditada".
    if (
      dto.type === DonationType.MONEY &&
      !dto.operationNumber?.trim() &&
      !dto.receiptUrl?.trim()
    ) {
      throw new BadRequestException(
        'Adjunta el número de operación o la captura de tu comprobante',
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
            payerAccountNumber:
              dto.type === DonationType.MONEY
                ? dto.donorAccountNumber?.trim()
                : undefined,
            operationNumber: dto.operationNumber?.trim() || undefined,
            receiptUrl: dto.receiptUrl?.trim() || undefined,
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

    // Crowdfunding: el aporte monetario solo suma al recaudado cuando un
    // administrador lo acredita (ver confirmPayment) — mientras tanto es una
    // promesa sin verificar y no debe inflar la meta pública de la campaña.

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

    // Al marcar como recibida, la especie deja de ser una promesa y pasa a
    // ser stock real del centro de acopio.
    if (
      dto.status === DonationStatus.RECEIVED &&
      donation.type === DonationType.GOODS &&
      donation.centerId
    ) {
      await this.registerGoodsInInventory(donation, user.id);
    }

    return updated;
  }

  /**
   * Registra una donación en especie ya recibida como stock del centro.
   *
   * Idempotente por `donationId`: si un manager cambia el estado varias veces
   * (o lo revierte y lo vuelve a marcar), el ingreso al almacén no se duplica.
   */
  private async registerGoodsInInventory(donation: Donation, userId: string) {
    if (!donation.centerId) return;
    const already = await this.prisma.inventoryMovement.findFirst({
      where: { donationId: donation.id },
    });
    if (already) return;

    const center = await this.prisma.center.findUnique({
      where: { id: donation.centerId },
    });
    if (!center) return;

    const categoryId = donation.categoryId ?? (await this.defaultCategoryId());
    const name = donation.description?.trim() || 'Donación en especie';
    const nameKey = normalizeKey(name) || 'donacion en especie';
    const unit = 'unidad';
    const quantity = donation.quantity ?? 1;

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.inventoryItem.findFirst({
        where: { centerId: donation.centerId!, nameKey, unit },
      });
      const item = existing
        ? await tx.inventoryItem.update({
            where: { id: existing.id },
            data: { quantity: existing.quantity + quantity },
          })
        : await tx.inventoryItem.create({
            data: {
              centerId: donation.centerId!,
              categoryId,
              name,
              nameKey,
              quantity,
              unit,
            },
          });

      await tx.inventoryMovement.create({
        data: {
          itemId: item.id,
          centerId: donation.centerId!,
          type: InventoryMovementType.IN,
          quantity,
          reason: 'Donación recibida',
          userId,
          donationId: donation.id,
        },
      });

      const newLoad = center.currentLoad + quantity;
      await tx.center.update({
        where: { id: donation.centerId! },
        data: {
          currentLoad: newLoad,
          status: this.computeCenterStatus(newLoad, center.capacity),
        },
      });
    });

    await this.needs.syncCampaign(donation.campaignId);
  }

  private computeCenterStatus(load: number, capacity: number): CenterStatus {
    if (capacity <= 0) return CenterStatus.OPEN;
    const pct = (load / capacity) * 100;
    if (pct >= 100) return CenterStatus.FULL;
    if (pct >= 85) return CenterStatus.NEAR_FULL;
    return CenterStatus.OPEN;
  }

  private async defaultCategoryId(): Promise<string> {
    const existing = await this.prisma.category.findUnique({
      where: { name: 'Otros' },
    });
    if (existing) return existing.id;
    const created = await this.prisma.category.create({
      data: { name: 'Otros', unit: 'unidad', icon: '📦', kind: CategoryKind.SUPPLY },
    });
    return created.id;
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

  /**
   * Acredita el pago de una donación en dinero.
   *
   * Solo un manager/admin la llama (ver controller), después de cotejar la
   * transferencia contra `payerAccountNumber` y el estado de cuenta real. Es
   * el único momento en que el aporte suma al recaudado público de la
   * campaña — antes de esto la donación es una promesa sin verificar.
   */
  async confirmPayment(id: string, dto: ConfirmPaymentDto, user: AuthUser) {
    const donation = await this.prisma.donation.findUnique({
      where: { id },
      include: { payment: true },
    });
    if (!donation) throw new NotFoundException('Donación no encontrada');
    if (!donation.payment) {
      throw new NotFoundException('La donación no tiene un pago asociado');
    }
    if (donation.type !== DonationType.MONEY) {
      throw new BadRequestException('Solo se acreditan donaciones en dinero');
    }
    if (donation.payment.status === PaymentStatus.PAID) {
      throw new BadRequestException('Esta donación ya fue acreditada');
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

    // Crowdfunding: recién acreditado el pago, el aporte suma al recaudado
    // público de la campaña (antes de esto era una promesa sin verificar).
    if (donation.campaignId) {
      await this.applyCampaignContribution(donation.campaignId, donation.amount ?? 0);
    }

    await this.audit.log(user.id, 'confirm-payment', 'Donation', id, {
      reference: dto.reference,
    });

    return updated;
  }
}
