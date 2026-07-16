import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BeneficiaryStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { CreateBeneficiaryDto } from './dto/create-beneficiary.dto';
import { SyncBeneficiariesDto } from './dto/sync-beneficiaries.dto';
import { QueryBeneficiariesDto } from './dto/query-beneficiaries.dto';
import { UpdateBeneficiaryStatusDto } from './dto/update-status.dto';
import { UpdateBeneficiaryDto } from './dto/update-beneficiary.dto';

@Injectable()
export class BeneficiariesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateBeneficiaryDto, userId: string) {
    const existing = await this.prisma.beneficiary.findUnique({
      where: { docNumber: dto.docNumber },
    });
    if (existing) {
      throw new ConflictException({
        message: 'El beneficiario ya está registrado (DNI duplicado)',
        existing,
      });
    }

    const beneficiary = await this.prisma.beneficiary.create({
      data: {
        docType: dto.docType ?? 'DNI',
        docNumber: dto.docNumber,
        fullName: dto.fullName,
        householdSize: dto.householdSize,
        phone: dto.phone,
        lat: dto.lat,
        lng: dto.lng,
        address: dto.address,
        district: dto.district,
        notes: dto.notes,
        needs: dto.needs ?? [],
        photoUrl: dto.photoUrl,
        emergencyId: dto.emergencyId,
        campaignId: dto.campaignId,
        zoneId: dto.zoneId,
        clientId: dto.clientId,
        registeredById: userId,
        status: BeneficiaryStatus.VALIDATED,
      },
    });

    await this.audit.log(userId, 'create', 'Beneficiary', beneficiary.id, {
      docNumber: beneficiary.docNumber,
    });
    return beneficiary;
  }

  async sync(dto: SyncBeneficiariesDto, userId: string) {
    let created = 0;
    let duplicates = 0;
    const errors: { record: any; error: string }[] = [];
    const seenClientIds = new Set<string>();
    const seenDocNumbers = new Set<string>();

    for (const record of dto.records) {
      try {
        // in-batch dedupe
        if (record.clientId && seenClientIds.has(record.clientId)) {
          duplicates++;
          continue;
        }
        if (seenDocNumbers.has(record.docNumber)) {
          duplicates++;
          continue;
        }

        // persisted dedupe by clientId or docNumber
        const existing = await this.prisma.beneficiary.findFirst({
          where: {
            OR: [
              record.clientId ? { clientId: record.clientId } : undefined,
              { docNumber: record.docNumber },
            ].filter(Boolean) as any,
          },
        });
        if (existing) {
          duplicates++;
          seenDocNumbers.add(record.docNumber);
          if (record.clientId) seenClientIds.add(record.clientId);
          continue;
        }

        await this.prisma.beneficiary.create({
          data: {
            docType: record.docType ?? 'DNI',
            docNumber: record.docNumber,
            fullName: record.fullName,
            householdSize: record.householdSize,
            phone: record.phone,
            lat: record.lat,
            lng: record.lng,
            address: record.address,
            district: record.district,
            notes: record.notes,
            needs: record.needs ?? [],
            emergencyId: record.emergencyId,
            campaignId: record.campaignId,
            clientId: record.clientId,
            registeredById: userId,
            status: BeneficiaryStatus.VALIDATED,
            syncedAt: new Date(),
          },
        });
        created++;
        seenDocNumbers.add(record.docNumber);
        if (record.clientId) seenClientIds.add(record.clientId);
      } catch (err) {
        errors.push({
          record: { docNumber: record.docNumber, clientId: record.clientId },
          error: (err as Error).message,
        });
      }
    }

    await this.audit.log(userId, 'sync', 'Beneficiary', null, {
      created,
      duplicates,
      errors: errors.length,
    });

    return { created, duplicates, errors };
  }

  async findAll(query: QueryBeneficiariesDto) {
    return this.prisma.beneficiary.findMany({
      where: {
        ...(query.emergencyId ? { emergencyId: query.emergencyId } : {}),
        ...(query.campaignId ? { campaignId: query.campaignId } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.q
          ? {
              OR: [
                { fullName: { contains: query.q, mode: 'insensitive' } },
                { docNumber: { contains: query.q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(id: string, dto: UpdateBeneficiaryDto, userId: string) {
    const existing = await this.prisma.beneficiary.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Beneficiario no encontrado');

    // El DNI es único: si cambia, no puede chocar con otro beneficiario.
    if (dto.docNumber && dto.docNumber !== existing.docNumber) {
      const dupe = await this.prisma.beneficiary.findUnique({
        where: { docNumber: dto.docNumber },
      });
      if (dupe) {
        throw new ConflictException('Ya existe otro beneficiario con ese documento');
      }
    }

    const beneficiary = await this.prisma.beneficiary.update({
      where: { id },
      data: {
        ...(dto.docType !== undefined ? { docType: dto.docType } : {}),
        ...(dto.docNumber !== undefined ? { docNumber: dto.docNumber } : {}),
        ...(dto.fullName !== undefined ? { fullName: dto.fullName } : {}),
        ...(dto.householdSize !== undefined
          ? { householdSize: dto.householdSize }
          : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.lat !== undefined ? { lat: dto.lat } : {}),
        ...(dto.lng !== undefined ? { lng: dto.lng } : {}),
        ...(dto.address !== undefined ? { address: dto.address } : {}),
        ...(dto.district !== undefined ? { district: dto.district } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(dto.needs !== undefined ? { needs: dto.needs } : {}),
        ...(dto.photoUrl !== undefined ? { photoUrl: dto.photoUrl } : {}),
        ...(dto.zoneId !== undefined ? { zoneId: dto.zoneId } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
    });
    await this.audit.log(userId, 'update', 'Beneficiary', id, {
      docNumber: beneficiary.docNumber,
    });
    return beneficiary;
  }

  async remove(id: string, userId: string) {
    const existing = await this.prisma.beneficiary.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Beneficiario no encontrado');
    await this.prisma.beneficiary.delete({ where: { id } });
    await this.audit.log(userId, 'delete', 'Beneficiary', id, {
      docNumber: existing.docNumber,
    });
    return { deleted: true };
  }

  async updateStatus(
    id: string,
    dto: UpdateBeneficiaryStatusDto,
    userId: string,
  ) {
    const existing = await this.prisma.beneficiary.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Beneficiario no encontrado');

    const beneficiary = await this.prisma.beneficiary.update({
      where: { id },
      data: { status: dto.status },
    });
    await this.audit.log(userId, 'update-status', 'Beneficiary', id, {
      status: dto.status,
    });
    return beneficiary;
  }
}
