import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { CampaignStatus, DonationType, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { DonationsService } from '../donations/donations.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { SuperadminLoginDto } from './dto/superadmin-login.dto';

@Injectable()
export class SuperadminService implements OnModuleInit {
  private readonly logger = new Logger(SuperadminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly donations: DonationsService,
  ) {}

  async onModuleInit() {
    await this.ensureSuperadmin();
  }

  /**
   * Bootstrap: SUPERADMIN_USER / SUPERADMIN_PASSWORD del entorno se materializan
   * como un User real con role ADMIN. El .env es la fuente de la contraseña: en
   * cada arranque se re-sincroniza el hash, así cambiar el .env cambia el acceso.
   */
  private async ensureSuperadmin() {
    const email = this.config.get<string>('SUPERADMIN_USER')?.trim().toLowerCase();
    const pass = this.config.get<string>('SUPERADMIN_PASSWORD');
    if (!email || !pass) {
      this.logger.warn(
        'SUPERADMIN_USER / SUPERADMIN_PASSWORD sin definir: no se creó el usuario ADMIN.',
      );
      return;
    }
    try {
      const passwordHash = await bcrypt.hash(pass, 10);
      const user = await this.prisma.user.upsert({
        where: { email },
        create: {
          email,
          passwordHash,
          fullName: 'Superadmin',
          role: Role.ADMIN,
          emailVerified: true,
        },
        update: { passwordHash, role: Role.ADMIN, isActive: true },
      });
      this.logger.log(`Superadmin listo: ${user.email} (${user.id})`);
    } catch (err) {
      this.logger.error(
        `No se pudo preparar el superadmin: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  /** Login contra la base: usuario con role ADMIN + contraseña bcrypt. */
  async login(dto: SuperadminLoginDto) {
    const email = dto.username.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (
      !user ||
      !user.isActive ||
      user.role !== Role.ADMIN ||
      !user.passwordHash
    ) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    await this.audit.log(user.id, 'login_superadmin', 'User', user.id);

    const token = this.jwt.sign(
      { sub: user.id, email: user.email, role: user.role, superadmin: true },
      { expiresIn: '12h' },
    );
    return { token };
  }

  /** Organizadores (usuarios MANAGER) con su organización y estado de verificación. */
  async listOrganizers() {
    const users = await this.prisma.user.findMany({
      where: { role: Role.MANAGER },
      include: {
        organization: {
          select: { id: true, name: true, ruc: true, verified: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return users.map((u) => ({
      id: u.id,
      fullName: u.fullName,
      email: u.email,
      phone: u.phone,
      emailVerified: u.emailVerified,
      isActive: u.isActive,
      createdAt: u.createdAt,
      organization: u.organization,
    }));
  }

  /** Verifica la cuenta del organizador (marca su organización y su email como verificados). */
  async verifyOrganizer(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { organization: true },
    });
    if (!user) throw new UnauthorizedException('Usuario no encontrado');

    if (user.organizationId) {
      await this.prisma.organization.update({
        where: { id: user.organizationId },
        data: { verified: true },
      });
    }
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { emailVerified: true },
      include: {
        organization: {
          select: { id: true, name: true, ruc: true, verified: true },
        },
      },
    });
    await this.audit.log(null, 'superadmin_verify', 'User', userId);
    return {
      id: updated.id,
      emailVerified: updated.emailVerified,
      organization: updated.organization,
    };
  }

  /**
   * Quita la verificación de la organización del organizador.
   *
   * Solo toca `organization.verified`: `emailVerified` se deja intacto a
   * propósito, porque es la señal de que el correo existe, no de que NOSXOTROS
   * haya validado a la organización.
   */
  async unverifyOrganizer(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { organization: true },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    if (!user.organizationId) {
      throw new BadRequestException(
        'El organizador no tiene una organización que desverificar',
      );
    }

    await this.prisma.organization.update({
      where: { id: user.organizationId },
      data: { verified: false },
    });
    await this.audit.log(null, 'superadmin_unverify', 'User', userId);

    const updated = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        organization: {
          select: { id: true, name: true, ruc: true, verified: true },
        },
      },
    });
    return {
      id: updated!.id,
      emailVerified: updated!.emailVerified,
      organization: updated!.organization,
    };
  }

  /**
   * Publica o despublica una campaña. Publicada = ACTIVE; despublicada = DRAFT,
   * el único estado que el listado público oculta.
   */
  async setCampaignPublished(id: string, published: boolean) {
    const campaign = await this.prisma.campaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundException('Campaña no encontrada');

    const status = published ? CampaignStatus.ACTIVE : CampaignStatus.DRAFT;
    if (campaign.status === status) {
      return { id: campaign.id, status: campaign.status };
    }

    const updated = await this.prisma.campaign.update({
      where: { id },
      data: { status },
      select: { id: true, status: true },
    });
    await this.audit.log(
      null,
      published ? 'superadmin_publish' : 'superadmin_unpublish',
      'Campaign',
      id,
      { from: campaign.status, to: status },
    );
    return updated;
  }

  async listCampaigns() {
    const campaigns = await this.prisma.campaign.findMany({
      include: {
        organizer: { select: { id: true, fullName: true, email: true } },
        _count: { select: { donations: true, zones: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return campaigns.map((c) => ({
      id: c.id,
      slug: c.slug,
      title: c.title,
      status: c.status,
      raisedAmount: c.raisedAmount,
      backersCount: c.backersCount,
      createdAt: c.createdAt,
      organizer: c.organizer,
      donationsCount: c._count.donations,
      zonesCount: c._count.zones,
    }));
  }

  /**
   * Todos los pagos en dinero que llegan a la plataforma, para verificarlos
   * desde el panel: PENDING = por cotejar contra el estado de cuenta,
   * PAID = ya acreditado. Incluye la prueba que dejó el donante (nro. de
   * operación y/o captura del voucher).
   */
  async listPayments() {
    const donations = await this.prisma.donation.findMany({
      where: { type: DonationType.MONEY, payment: { isNot: null } },
      include: {
        payment: true,
        campaign: { select: { id: true, slug: true, title: true } },
        donor: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
    return donations.map((d) => ({
      id: d.id,
      code: d.code,
      amount: d.amount,
      currency: d.currency,
      createdAt: d.createdAt,
      anonymous: d.anonymous,
      donorName: d.anonymous ? null : (d.donor?.fullName ?? d.donorName ?? null),
      donorEmail: d.anonymous ? null : (d.donor?.email ?? d.donorEmail ?? null),
      campaign: d.campaign,
      payment: d.payment && {
        status: d.payment.status,
        method: d.payment.method,
        payerAccountNumber: d.payment.payerAccountNumber,
        operationNumber: d.payment.operationNumber,
        receiptUrl: d.payment.receiptUrl,
        reference: d.payment.reference,
        paidAt: d.payment.paidAt,
      },
    }));
  }

  /**
   * Acredita un pago desde el panel superadmin. Reutiliza el flujo real de
   * acreditación (evento de trazabilidad + recaudado de la campaña) firmando
   * con el usuario ADMIN materializado por ensureSuperadmin.
   */
  async confirmPayment(donationId: string, reference?: string) {
    const email = this.config
      .get<string>('SUPERADMIN_USER')
      ?.trim()
      .toLowerCase();
    const admin = email
      ? await this.prisma.user.findUnique({ where: { email } })
      : await this.prisma.user.findFirst({ where: { role: Role.ADMIN } });
    if (!admin) {
      throw new UnauthorizedException('No hay usuario superadmin materializado');
    }
    return this.donations.confirmPayment(
      donationId,
      { reference },
      admin as unknown as AuthUser,
    );
  }

  /** Elimina una campaña, desligando donaciones y centros (zonas/brigadas/updates caen en cascada). */
  async deleteCampaign(id: string) {
    const campaign = await this.prisma.campaign.findUnique({ where: { id } });
    if (!campaign) throw new UnauthorizedException('Campaña no encontrada');

    await this.prisma.$transaction([
      this.prisma.donation.updateMany({
        where: { campaignId: id },
        data: { campaignId: null },
      }),
      this.prisma.center.updateMany({
        where: { campaignId: id },
        data: { campaignId: null },
      }),
      this.prisma.campaign.delete({ where: { id } }),
    ]);
    await this.audit.log(null, 'superadmin_delete', 'Campaign', id, {
      title: campaign.title,
    });
    return { deleted: true };
  }
}
