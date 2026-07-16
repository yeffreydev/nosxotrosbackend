import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { CampaignsService } from '../campaigns/campaigns.service';
import { CreateBrigadeDto } from './dto/create-brigade.dto';
import { UpdateBrigadeDto } from './dto/update-brigade.dto';
import { AddBrigadeMemberDto } from './dto/add-brigade-member.dto';

const BRIGADE_INCLUDE = {
  zone: { select: { id: true, name: true, mapUrl: true, severity: true } },
  members: {
    include: {
      volunteer: { include: { user: { select: { id: true, fullName: true } } } },
      user: { select: { id: true, fullName: true } },
    },
  },
} as const;

@Injectable()
export class BrigadesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly campaigns: CampaignsService,
  ) {}

  /** Brigadas de una campaña (lectura pública). */
  listByCampaign(campaignId: string) {
    return this.prisma.brigade.findMany({
      where: { campaignId },
      include: BRIGADE_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(campaignId: string, dto: CreateBrigadeDto, user: AuthUser) {
    await this.campaigns.assertCanManage(campaignId, user);
    const brigade = await this.prisma.brigade.create({
      data: {
        campaignId,
        name: dto.name,
        zoneId: dto.zoneId,
        meetingPoint: dto.meetingPoint,
        meetingPointMapUrl: dto.meetingPointMapUrl,
        contactPhone: dto.contactPhone,
      },
      include: BRIGADE_INCLUDE,
    });
    await this.audit.log(user.id, 'create', 'Brigade', brigade.id, {
      campaignId,
    });
    return brigade;
  }

  async update(id: string, dto: UpdateBrigadeDto, user: AuthUser) {
    const existing = await this.loadOwned(id, user);
    const brigade = await this.prisma.brigade.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.zoneId !== undefined ? { zoneId: dto.zoneId } : {}),
        ...(dto.meetingPoint !== undefined ? { meetingPoint: dto.meetingPoint } : {}),
        ...(dto.meetingPointMapUrl !== undefined
          ? { meetingPointMapUrl: dto.meetingPointMapUrl }
          : {}),
        ...(dto.contactPhone !== undefined ? { contactPhone: dto.contactPhone } : {}),
      },
      include: BRIGADE_INCLUDE,
    });
    await this.audit.log(user.id, 'update', 'Brigade', id, {
      campaignId: existing.campaignId,
    });
    return brigade;
  }

  async remove(id: string, user: AuthUser) {
    const existing = await this.loadOwned(id, user);
    await this.prisma.brigade.delete({ where: { id } });
    await this.audit.log(user.id, 'delete', 'Brigade', id, {
      campaignId: existing.campaignId,
    });
    return { deleted: true };
  }

  async addMember(brigadeId: string, dto: AddBrigadeMemberDto, user: AuthUser) {
    const brigade = await this.loadOwned(brigadeId, user);
    if (!dto.volunteerId && !dto.userId) {
      throw new BadRequestException('Indica volunteerId o userId');
    }
    if (dto.volunteerId && dto.userId) {
      throw new BadRequestException('Indica solo volunteerId o userId, no ambos');
    }
    // Solo se puede sumar a la brigada gente inscrita como voluntaria en la campaña.
    if (dto.volunteerId) {
      const enrolled = await this.prisma.campaignVolunteer.findUnique({
        where: {
          campaignId_volunteerId: {
            campaignId: brigade.campaignId,
            volunteerId: dto.volunteerId,
          },
        },
      });
      if (!enrolled) {
        throw new BadRequestException(
          'El voluntario no está inscrito en esta campaña',
        );
      }
      // Un voluntario pertenece a una sola brigada dentro de la campaña.
      const otherBrigade = await this.prisma.brigadeMember.findFirst({
        where: {
          volunteerId: dto.volunteerId,
          brigade: { campaignId: brigade.campaignId },
        },
      });
      if (otherBrigade) {
        throw new ConflictException('El voluntario ya pertenece a una brigada');
      }
    }
    try {
      const member = await this.prisma.brigadeMember.create({
        data: {
          brigadeId,
          volunteerId: dto.volunteerId,
          userId: dto.userId,
          role: dto.role,
        },
        include: {
          volunteer: { include: { user: { select: { id: true, fullName: true } } } },
          user: { select: { id: true, fullName: true } },
        },
      });
      await this.audit.log(user.id, 'create', 'BrigadeMember', member.id, {
        brigadeId,
      });
      return member;
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException('El voluntario ya pertenece a esta brigada');
      }
      throw e;
    }
  }

  async removeMember(brigadeId: string, memberId: string, user: AuthUser) {
    await this.loadOwned(brigadeId, user);
    const member = await this.prisma.brigadeMember.findUnique({
      where: { id: memberId },
    });
    if (!member || member.brigadeId !== brigadeId) {
      throw new NotFoundException('Miembro no encontrado');
    }
    await this.prisma.brigadeMember.delete({ where: { id: memberId } });
    await this.audit.log(user.id, 'delete', 'BrigadeMember', memberId, {
      brigadeId,
    });
    return { deleted: true };
  }

  private async loadOwned(id: string, user: AuthUser) {
    const brigade = await this.prisma.brigade.findUnique({ where: { id } });
    if (!brigade) throw new NotFoundException('Brigada no encontrada');
    await this.campaigns.assertCanManage(brigade.campaignId, user);
    return brigade;
  }
}
