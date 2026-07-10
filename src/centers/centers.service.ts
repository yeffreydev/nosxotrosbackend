import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CenterStatus, InventoryMovementType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { CreateCenterDto } from './dto/create-center.dto';
import { UpdateCenterDto } from './dto/update-center.dto';
import { QueryCentersDto } from './dto/query-centers.dto';
import { CreateItemDto } from './dto/create-item.dto';
import { ScanDto } from './dto/scan.dto';

@Injectable()
export class CentersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private computeStatus(load: number, capacity: number): CenterStatus {
    if (capacity <= 0) return CenterStatus.OPEN;
    const pct = (load / capacity) * 100;
    if (pct >= 100) return CenterStatus.FULL;
    if (pct >= 85) return CenterStatus.NEAR_FULL;
    return CenterStatus.OPEN;
  }

  private withLoadPct<T extends { currentLoad: number; capacity: number }>(
    c: T,
  ) {
    return {
      ...c,
      loadPct:
        c.capacity > 0 ? Math.round((c.currentLoad / c.capacity) * 100) : 0,
    };
  }

  async findAll(query: QueryCentersDto) {
    const centers = await this.prisma.center.findMany({
      where: query.status ? { status: query.status } : undefined,
      orderBy: { name: 'asc' },
    });
    return centers.map((c) => this.withLoadPct(c));
  }

  async findOne(id: string) {
    const center = await this.prisma.center.findUnique({
      where: { id },
      include: {
        inventory: { include: { category: true } },
        organization: true,
        campaign: { select: { id: true, title: true, slug: true } },
      },
    });
    if (!center) throw new NotFoundException('Centro no encontrado');

    const grouped: Record<string, any> = {};
    for (const item of center.inventory) {
      const key = item.category?.name ?? 'Sin categoría';
      if (!grouped[key]) {
        grouped[key] = {
          category: item.category?.name ?? 'Sin categoría',
          categoryId: item.categoryId,
          totalQuantity: 0,
          items: [],
        };
      }
      grouped[key].totalQuantity += item.quantity;
      grouped[key].items.push(item);
    }

    return {
      ...this.withLoadPct(center),
      inventoryByCategory: Object.values(grouped),
    };
  }

  async create(dto: CreateCenterDto, userId: string) {
    const currentLoad = dto.currentLoad ?? 0;
    const capacity = dto.capacity ?? 1000;
    const center = await this.prisma.center.create({
      data: {
        name: dto.name,
        address: dto.address,
        lat: dto.lat,
        lng: dto.lng,
        capacity,
        currentLoad,
        status: dto.status ?? this.computeStatus(currentLoad, capacity),
        contactPhone: dto.contactPhone,
        openingHours: dto.openingHours,
        organizationId: dto.organizationId,
        campaignId: dto.campaignId,
      },
    });
    await this.audit.log(userId, 'create', 'Center', center.id);
    return this.withLoadPct(center);
  }

  async update(id: string, dto: UpdateCenterDto, userId: string) {
    const existing = await this.prisma.center.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Centro no encontrado');

    const capacity = dto.capacity ?? existing.capacity;
    const currentLoad = dto.currentLoad ?? existing.currentLoad;
    const center = await this.prisma.center.update({
      where: { id },
      data: {
        ...dto,
        status: dto.status ?? this.computeStatus(currentLoad, capacity),
      },
    });
    await this.audit.log(userId, 'update', 'Center', id, { ...dto });
    return this.withLoadPct(center);
  }

  async getInventory(centerId: string) {
    const center = await this.prisma.center.findUnique({
      where: { id: centerId },
    });
    if (!center) throw new NotFoundException('Centro no encontrado');
    return this.prisma.inventoryItem.findMany({
      where: { centerId },
      include: { category: true },
      orderBy: { name: 'asc' },
    });
  }

  async createItem(centerId: string, dto: CreateItemDto, userId: string) {
    const center = await this.prisma.center.findUnique({
      where: { id: centerId },
    });
    if (!center) throw new NotFoundException('Centro no encontrado');

    const category = await this.prisma.category.findUnique({
      where: { id: dto.categoryId },
    });
    if (!category) throw new NotFoundException('Categoría no encontrada');

    const quantity = dto.quantity ?? 0;

    const result = await this.prisma.$transaction(async (tx) => {
      const item = await tx.inventoryItem.create({
        data: {
          centerId,
          categoryId: dto.categoryId,
          name: dto.name,
          quantity,
          unit: dto.unit ?? category.unit,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
        },
        include: { category: true },
      });

      if (quantity > 0) {
        await tx.inventoryMovement.create({
          data: {
            itemId: item.id,
            centerId,
            type: InventoryMovementType.IN,
            quantity,
            reason: 'Alta de item',
            userId,
          },
        });
        const newLoad = center.currentLoad + quantity;
        await tx.center.update({
          where: { id: centerId },
          data: {
            currentLoad: newLoad,
            status: this.computeStatus(newLoad, center.capacity),
          },
        });
      }
      return item;
    });

    await this.audit.log(userId, 'create', 'InventoryItem', result.id, {
      centerId,
      sku: result.sku,
    });
    return result;
  }

  async scan(dto: ScanDto, userId: string) {
    const item = await this.prisma.inventoryItem.findUnique({
      where: { sku: dto.sku },
      include: { center: true },
    });
    if (!item) throw new NotFoundException('SKU no encontrado');

    const center = item.center;
    let newQty = item.quantity;
    let loadDelta = 0;

    switch (dto.type) {
      case InventoryMovementType.IN:
        newQty = item.quantity + dto.quantity;
        loadDelta = dto.quantity;
        break;
      case InventoryMovementType.OUT: {
        const removed = Math.min(dto.quantity, item.quantity);
        newQty = item.quantity - removed;
        loadDelta = -removed;
        break;
      }
      case InventoryMovementType.ADJUST:
        newQty = dto.quantity;
        loadDelta = dto.quantity - item.quantity;
        break;
      default:
        throw new BadRequestException('Tipo de movimiento inválido');
    }

    const newLoad = Math.max(0, center.currentLoad + loadDelta);
    const newStatus = this.computeStatus(newLoad, center.capacity);

    const result = await this.prisma.$transaction(async (tx) => {
      const updatedItem = await tx.inventoryItem.update({
        where: { id: item.id },
        data: { quantity: newQty },
        include: { category: true },
      });
      const updatedCenter = await tx.center.update({
        where: { id: center.id },
        data: { currentLoad: newLoad, status: newStatus },
      });
      const movement = await tx.inventoryMovement.create({
        data: {
          itemId: item.id,
          centerId: center.id,
          type: dto.type,
          quantity: dto.quantity,
          reason: dto.reason,
          userId,
          donationId: dto.donationId,
        },
      });
      return { item: updatedItem, center: this.withLoadPct(updatedCenter), movement };
    });

    await this.audit.log(userId, 'scan', 'InventoryItem', item.id, {
      type: dto.type,
      quantity: dto.quantity,
      sku: dto.sku,
    });
    return result;
  }

  async listCategories() {
    return this.prisma.category.findMany({ orderBy: { name: 'asc' } });
  }
}
