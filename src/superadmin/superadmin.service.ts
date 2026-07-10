import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { SuperadminLoginDto } from './dto/superadmin-login.dto';

@Injectable()
export class SuperadminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  /** Login por credenciales de entorno (SUPERADMIN_USER / SUPERADMIN_PASSWORD). */
  login(dto: SuperadminLoginDto) {
    const user = this.config.get<string>('SUPERADMIN_USER');
    const pass = this.config.get<string>('SUPERADMIN_PASSWORD');
    if (!user || !pass) {
      throw new ServiceUnavailableException(
        'Superadmin no está configurado en el servidor',
      );
    }
    if (dto.username !== user || dto.password !== pass) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    const token = this.jwt.sign(
      { sub: 'superadmin', superadmin: true },
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
