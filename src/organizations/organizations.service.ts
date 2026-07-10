import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { QueryOrganizationsDto } from './dto/query-organizations.dto';

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(query: QueryOrganizationsDto) {
    return this.prisma.organization.findMany({
      where: {
        ...(query.type ? { type: query.type } : {}),
        ...(query.verified !== undefined ? { verified: query.verified } : {}),
        ...(query.impactLens !== undefined
          ? { impactLens: query.impactLens }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(dto: CreateOrganizationDto, userId: string) {
    const existing = await this.prisma.organization.findUnique({
      where: { ruc: dto.ruc },
    });
    if (existing) {
      throw new ConflictException('Ya existe una organización con ese RUC');
    }
    const org = await this.prisma.organization.create({
      data: { ...dto },
    });
    // Vincula al creador con su organización si aún no tiene una.
    const creator = await this.prisma.user.findUnique({ where: { id: userId } });
    if (creator && !creator.organizationId) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { organizationId: org.id },
      });
    }
    await this.audit.log(userId, 'create', 'Organization', org.id);
    return org;
  }

  async update(id: string, dto: UpdateOrganizationDto, userId: string) {
    const existing = await this.prisma.organization.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Organización no encontrada');
    const org = await this.prisma.organization.update({
      where: { id },
      data: { ...dto },
    });
    await this.audit.log(userId, 'update', 'Organization', id, { ...dto });
    return org;
  }

  async verify(id: string, userId: string) {
    const existing = await this.prisma.organization.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Organización no encontrada');
    const org = await this.prisma.organization.update({
      where: { id },
      data: { verified: true },
    });
    await this.audit.log(userId, 'verify', 'Organization', id);
    return org;
  }
}
