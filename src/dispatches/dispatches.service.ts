import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DispatchStatus, DonationStatus, BeneficiaryStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { CreateDispatchDto } from './dto/create-dispatch.dto';
import { UpdateDispatchStatusDto } from './dto/update-dispatch-status.dto';
import { QueryDispatchesDto } from './dto/query-dispatches.dto';

// La zona de atención viaja siempre con el despacho: es a dónde va la ayuda y
// lo que la app pinta como destino.
const DISPATCH_INCLUDE = {
  items: true,
  fromCenter: true,
  emergency: true,
  zone: { select: { id: true, name: true, reference: true, mapUrl: true, severity: true } },
} as const;

@Injectable()
export class DispatchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateDispatchDto, userId: string) {
    const center = await this.prisma.center.findUnique({
      where: { id: dto.fromCenterId },
    });
    if (!center) throw new NotFoundException('Centro de origen no encontrado');

    // Zona de atención: es el destino. Si se elige, de ella salen la dirección y
    // el pin cuando no se escriben a mano, y tiene que ser de la misma campaña
    // que el centro de origen para no mandar ayuda a otra operación.
    const zone = dto.zoneId
      ? await this.prisma.zone.findUnique({ where: { id: dto.zoneId } })
      : null;
    if (dto.zoneId && !zone) throw new NotFoundException('Zona no encontrada');
    if (zone && center.campaignId && zone.campaignId !== center.campaignId) {
      throw new BadRequestException(
        'La zona de atención no pertenece a la campaña del centro de origen',
      );
    }

    const dispatch = await this.prisma.$transaction(async (tx) => {
      return tx.dispatch.create({
        data: {
          fromCenterId: dto.fromCenterId,
          emergencyId: dto.emergencyId ?? zone?.emergencyId ?? undefined,
          zoneId: zone?.id,
          destLat: dto.destLat ?? zone?.lat ?? undefined,
          destLng: dto.destLng ?? zone?.lng ?? undefined,
          destAddress: dto.destAddress ?? zone?.reference ?? undefined,
          driverName: dto.driverName,
          status: DispatchStatus.PREPARING,
          items: {
            create: dto.items.map((i) => ({
              description: i.description,
              quantity: i.quantity ?? 1,
              unit: i.unit,
              donationId: i.donationId,
              beneficiaryId: i.beneficiaryId,
            })),
          },
        },
        include: DISPATCH_INCLUDE,
      });
    });

    await this.audit.log(userId, 'create', 'Dispatch', dispatch.id, {
      items: dto.items.length,
      zoneId: zone?.id,
    });
    return dispatch;
  }

  async findAll(query: QueryDispatchesDto) {
    return this.prisma.dispatch.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.emergencyId ? { emergencyId: query.emergencyId } : {}),
        ...(query.zoneId ? { zoneId: query.zoneId } : {}),
      },
      include: DISPATCH_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateStatus(
    id: string,
    dto: UpdateDispatchStatusDto,
    userId: string,
  ) {
    const dispatch = await this.prisma.dispatch.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!dispatch) throw new NotFoundException('Despacho no encontrado');

    const result = await this.prisma.$transaction(async (tx) => {
      const data: any = { status: dto.status };

      if (dto.status === DispatchStatus.IN_TRANSIT && !dispatch.departedAt) {
        data.departedAt = new Date();
      }

      if (dto.status === DispatchStatus.DELIVERED) {
        data.deliveredAt = new Date();
        if (!dispatch.departedAt) data.departedAt = dispatch.departedAt ?? new Date();

        const donationIds = dispatch.items
          .map((i) => i.donationId)
          .filter((x): x is string => !!x);
        const beneficiaryIds = dispatch.items
          .map((i) => i.beneficiaryId)
          .filter((x): x is string => !!x);

        // mark items delivered
        await tx.dispatchItem.updateMany({
          where: { dispatchId: id },
          data: { delivered: true },
        });

        // mark donations DELIVERED + TraceEvent
        for (const donationId of donationIds) {
          await tx.donation.update({
            where: { id: donationId },
            data: {
              status: DonationStatus.DELIVERED,
              events: {
                create: {
                  status: DonationStatus.DELIVERED,
                  title: 'Entregada a beneficiarios',
                  note: `Entregada vía despacho ${dispatch.code}`,
                  lat: dispatch.destLat,
                  lng: dispatch.destLng,
                },
              },
            },
          });
        }

        // mark beneficiaries SERVED
        if (beneficiaryIds.length > 0) {
          await tx.beneficiary.updateMany({
            where: { id: { in: beneficiaryIds } },
            data: { status: BeneficiaryStatus.SERVED },
          });
        }
      }

      return tx.dispatch.update({
        where: { id },
        data,
        include: DISPATCH_INCLUDE,
      });
    });

    await this.audit.log(userId, 'update-status', 'Dispatch', id, {
      status: dto.status,
    });
    return result;
  }
}
