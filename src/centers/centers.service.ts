import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BeneficiaryStatus,
  CategoryKind,
  CenterStatus,
  DispatchStatus,
  InventoryMovementType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { NeedsProgressService } from '../common/needs-progress.service';
import { normalizeKey, normalizeUnit } from '../common/text.util';
import { isMedicineText, NO_MEDICINE_MSG } from '../common/policy';
import { CreateCenterDto } from './dto/create-center.dto';
import { UpdateCenterDto } from './dto/update-center.dto';
import { QueryCentersDto } from './dto/query-centers.dto';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { ScanDto } from './dto/scan.dto';
import { DispatchItemDto } from './dto/dispatch-item.dto';

// Categorías base de inventario / necesidades (idénticas a prisma/seed.ts).
// Cubren lo que se acopia y también lo que una campaña suele necesitar sin ser
// un bien de almacén: herramientas, transporte, combustible o mano de obra.
export const DEFAULT_CATEGORIES = [
  { name: 'Alimentos', unit: 'kg', icon: '🍚', kind: CategoryKind.SUPPLY },
  { name: 'Agua', unit: 'litro', icon: '💧', kind: CategoryKind.SUPPLY },
  { name: 'Abrigo', unit: 'unidad', icon: '🧥', kind: CategoryKind.SUPPLY },
  { name: 'Higiene', unit: 'kit', icon: '🧼', kind: CategoryKind.SUPPLY },
  { name: 'Botiquín', unit: 'unidad', icon: '🩹', kind: CategoryKind.SUPPLY },
  { name: 'Ropa', unit: 'unidad', icon: '👕', kind: CategoryKind.SUPPLY },
  { name: 'Limpieza', unit: 'unidad', icon: '🧴', kind: CategoryKind.SUPPLY },
  { name: 'Herramientas', unit: 'unidad', icon: '🛠️', kind: CategoryKind.TOOL },
  { name: 'Materiales', unit: 'unidad', icon: '🧱', kind: CategoryKind.TOOL },
  { name: 'Transporte', unit: 'viaje', icon: '🚚', kind: CategoryKind.TRANSPORT },
  { name: 'Combustible', unit: 'galón', icon: '⛽', kind: CategoryKind.FUEL },
  { name: 'Mano de obra', unit: 'hora', icon: '🤝', kind: CategoryKind.SERVICE },
];

@Injectable()
export class CentersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly needs: NeedsProgressService,
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
        inventory: { include: { category: true }, orderBy: { name: 'asc' } },
        organization: true,
        campaign: { select: { id: true, title: true, slug: true } },
      },
    });
    if (!center) throw new NotFoundException('Centro no encontrado');

    // Inventario agrupado por categoría. Dentro de cada una, un ítem por
    // producto+unidad: los ingresos repetidos ya vienen sumados en `quantity`.
    const grouped: Record<string, any> = {};
    for (const item of center.inventory) {
      const key = item.category?.name ?? 'Sin categoría';
      if (!grouped[key]) {
        grouped[key] = {
          category: item.category?.name ?? 'Sin categoría',
          categoryId: item.categoryId,
          icon: item.category?.icon ?? null,
          kind: item.category?.kind ?? null,
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
        mapUrl: dto.mapUrl,
        photoUrl: dto.photoUrl,
        reference: dto.reference,
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

  /**
   * Ingresa producto al almacén de un centro.
   *
   * Agrupa por producto en vez de crear una línea por cada ingreso: si el centro
   * ya tiene ese nombre (normalizado) con la misma unidad de medida, suma la
   * cantidad al ítem existente y registra igualmente la entrada. Así "Frazadas"
   * ingresadas tres veces son un solo ítem con la cantidad acumulada, y su SKU
   * (código QR) sigue siendo el mismo.
   */
  async createItem(centerId: string, dto: CreateItemDto, userId: string) {
    const center = await this.prisma.center.findUnique({
      where: { id: centerId },
    });
    if (!center) throw new NotFoundException('Centro no encontrado');

    const category = await this.prisma.category.findUnique({
      where: { id: dto.categoryId },
    });
    if (!category) throw new NotFoundException('Categoría no encontrada');

    const name = dto.name.trim();
    if (isMedicineText(category.name) || isMedicineText(name)) {
      throw new BadRequestException(NO_MEDICINE_MSG);
    }
    const nameKey = normalizeKey(name);
    if (!nameKey) throw new BadRequestException('Nombre de producto inválido');
    const unit = normalizeUnit(dto.unit ?? category.unit);
    const quantity = dto.quantity ?? 0;

    const existing = await this.prisma.inventoryItem.findFirst({
      where: { centerId, nameKey, unit },
    });

    const result = await this.prisma.$transaction(async (tx) => {
      const item = existing
        ? await tx.inventoryItem.update({
            where: { id: existing.id },
            data: {
              quantity: existing.quantity + quantity,
              // La fecha de vencimiento más próxima manda: es la que hay que vigilar.
              ...(dto.expiresAt &&
              (!existing.expiresAt || new Date(dto.expiresAt) < existing.expiresAt)
                ? { expiresAt: new Date(dto.expiresAt) }
                : {}),
            },
            include: { category: true },
          })
        : await tx.inventoryItem.create({
            data: {
              centerId,
              categoryId: dto.categoryId,
              name,
              nameKey,
              quantity,
              unit,
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
            reason: dto.note?.trim() || (existing ? 'Ingreso de producto' : 'Alta de producto'),
            userId,
            donationId: dto.donationId,
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

    // Lo que entra hace avanzar las metas en especie de la campaña del centro.
    await this.needs.syncCampaign(center.campaignId);

    await this.audit.log(
      userId,
      existing ? 'stock-in' : 'create',
      'InventoryItem',
      result.id,
      { centerId, sku: result.sku, quantity, merged: !!existing },
    );
    // `merged` le dice a la app si sumó a un producto que ya existía.
    return { ...result, merged: !!existing };
  }

  /** Corrige un producto: nombre, categoría, unidad, vencimiento y stock real. */
  async updateItem(
    centerId: string,
    itemId: string,
    dto: UpdateItemDto,
    userId: string,
  ) {
    const item = await this.prisma.inventoryItem.findFirst({
      where: { id: itemId, centerId },
      include: { center: true },
    });
    if (!item) throw new NotFoundException('Ítem no encontrado en el centro');

    if (dto.categoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: dto.categoryId },
      });
      if (!category) throw new NotFoundException('Categoría no encontrada');
    }

    const name = dto.name?.trim() ?? item.name;
    const nameKey = normalizeKey(name);
    if (!nameKey) throw new BadRequestException('Nombre de producto inválido');
    const unit = normalizeUnit(dto.unit ?? item.unit);

    // Renombrar sobre un producto que ya existe fusionaría dos líneas y falsearía
    // el histórico de movimientos: se avisa en vez de mezclarlas en silencio.
    if (nameKey !== item.nameKey || unit !== item.unit) {
      const clash = await this.prisma.inventoryItem.findFirst({
        where: { centerId, nameKey, unit, id: { not: itemId } },
      });
      if (clash) {
        throw new ConflictException(
          `El centro ya tiene "${clash.name}" en ${unit}. Ingresa la cantidad ahí en vez de renombrar este producto.`,
        );
      }
    }

    const newQty = dto.quantity ?? item.quantity;
    const delta = newQty - item.quantity;
    const newLoad = Math.max(0, item.center.currentLoad + delta);

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.inventoryItem.update({
        where: { id: itemId },
        data: {
          name,
          nameKey,
          unit,
          quantity: newQty,
          ...(dto.categoryId ? { categoryId: dto.categoryId } : {}),
          ...(dto.expiresAt !== undefined
            ? { expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null }
            : {}),
        },
        include: { category: true },
      });
      if (delta !== 0) {
        await tx.inventoryMovement.create({
          data: {
            itemId,
            centerId,
            type: InventoryMovementType.ADJUST,
            quantity: newQty,
            reason: dto.reason?.trim() || 'Ajuste de inventario',
            userId,
          },
        });
        await tx.center.update({
          where: { id: centerId },
          data: {
            currentLoad: newLoad,
            status: this.computeStatus(newLoad, item.center.capacity),
          },
        });
      }
      return row;
    });

    await this.needs.syncCampaign(item.center.campaignId);
    await this.audit.log(userId, 'update', 'InventoryItem', itemId, { ...dto });
    return updated;
  }

  /** Historial de movimientos de un centro (entradas, salidas y ajustes). */
  async getMovements(centerId: string, limit = 100) {
    const center = await this.prisma.center.findUnique({
      where: { id: centerId },
    });
    if (!center) throw new NotFoundException('Centro no encontrado');
    return this.prisma.inventoryMovement.findMany({
      where: { centerId },
      include: {
        item: { select: { id: true, name: true, unit: true } },
        user: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 300),
    });
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

    await this.needs.syncCampaign(center.campaignId);
    await this.audit.log(userId, 'scan', 'InventoryItem', item.id, {
      type: dto.type,
      quantity: dto.quantity,
      sku: dto.sku,
    });
    return result;
  }

  // Despacha un ítem: descuenta stock del almacén, registra la salida (OUT) y crea
  // un Dispatch. Si viene beneficiaryId, queda DELIVERED y marca al beneficiario
  // como SERVED; si solo viene zoneId, queda PREPARING (asignado a la zona).
  async dispatchItem(centerId: string, dto: DispatchItemDto, userId: string) {
    const item = await this.prisma.inventoryItem.findFirst({
      where: { id: dto.itemId, centerId },
      include: { center: true },
    });
    if (!item) throw new NotFoundException('Ítem no encontrado en el centro');

    if (dto.quantity > item.quantity) {
      throw new BadRequestException(
        `Solo hay ${item.quantity} ${item.unit} de ${item.name} en el almacén.`,
      );
    }
    const removed = Math.min(dto.quantity, item.quantity);
    if (removed <= 0) throw new BadRequestException('Sin stock disponible para despachar');

    // Zona de atención: es el destino del despacho. Si el organizador eligió un
    // beneficiario sin zona, se toma la zona de la ficha del beneficiario.
    let zoneId = dto.zoneId;
    let ben: { id: string; zoneId: string | null } | null = null;
    if (dto.beneficiaryId) {
      ben = await this.prisma.beneficiary.findUnique({
        where: { id: dto.beneficiaryId },
        select: { id: true, zoneId: true },
      });
      if (!ben) throw new NotFoundException('Beneficiario no encontrado');
      if (!zoneId) zoneId = ben.zoneId ?? undefined;
    }
    if (!zoneId) {
      throw new BadRequestException(
        'Elige la zona de atención a la que va el despacho.',
      );
    }
    const zone = await this.prisma.zone.findUnique({ where: { id: zoneId } });
    if (!zone) throw new NotFoundException('Zona no encontrada');
    if (item.center.campaignId && zone.campaignId !== item.center.campaignId) {
      throw new BadRequestException('La zona no pertenece a la campaña del centro');
    }

    const center = item.center;
    const newQty = item.quantity - removed;
    const newLoad = Math.max(0, center.currentLoad - removed);
    const newStatus = this.computeStatus(newLoad, center.capacity);
    const delivered = !!dto.beneficiaryId;
    const now = new Date();

    const dispatch = await this.prisma.$transaction(async (tx) => {
      await tx.inventoryItem.update({
        where: { id: item.id },
        data: { quantity: newQty },
      });
      await tx.center.update({
        where: { id: center.id },
        data: { currentLoad: newLoad, status: newStatus },
      });
      await tx.inventoryMovement.create({
        data: {
          itemId: item.id,
          centerId: center.id,
          type: InventoryMovementType.OUT,
          quantity: removed,
          reason: dto.note ?? 'Despacho',
          userId,
        },
      });
      const created = await tx.dispatch.create({
        data: {
          fromCenterId: center.id,
          zoneId,
          driverName: dto.driverName,
          destAddress: dto.destAddress ?? zone.reference ?? undefined,
          destLat: zone.lat ?? undefined,
          destLng: zone.lng ?? undefined,
          status: delivered ? DispatchStatus.DELIVERED : DispatchStatus.PREPARING,
          departedAt: delivered ? now : undefined,
          deliveredAt: delivered ? now : undefined,
          items: {
            create: [
              {
                description: item.name,
                quantity: removed,
                unit: item.unit,
                beneficiaryId: dto.beneficiaryId,
                delivered,
              },
            ],
          },
        },
        include: { items: true, zone: true, fromCenter: true },
      });
      if (delivered && dto.beneficiaryId) {
        await tx.beneficiary.update({
          where: { id: dto.beneficiaryId },
          data: { status: BeneficiaryStatus.SERVED },
        });
      }
      return created;
    });

    await this.needs.syncCampaign(center.campaignId);
    await this.audit.log(userId, 'dispatch', 'InventoryItem', item.id, {
      quantity: removed,
      zoneId,
      beneficiaryId: dto.beneficiaryId,
    });
    return dispatch;
  }

  async listCategories() {
    // Las categorías de medicamentos no se ofrecen: la plataforma no los recibe.
    // Se filtran aquí (y no solo en la UI) para que ningún selector las muestre,
    // aunque existan en bases de datos antiguas.
    const noMeds = <T extends { name: string }>(cats: T[]): T[] =>
      cats.filter((c) => !isMedicineText(c.name));
    const categories = await this.prisma.category.findMany({
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
    });
    // Sin categorías no se puede registrar inventario ni metas: sembramos las
    // básicas la primera vez (idempotente, mismas que prisma/seed.ts).
    if (categories.length === 0) {
      await this.prisma.category.createMany({
        data: DEFAULT_CATEGORIES,
        skipDuplicates: true,
      });
      return noMeds(
        await this.prisma.category.findMany({
          orderBy: [{ kind: 'asc' }, { name: 'asc' }],
        }),
      );
    }
    return noMeds(categories);
  }

  async createCategory(dto: CreateCategoryDto, userId: string) {
    const name = dto.name.trim();
    if (isMedicineText(name)) throw new BadRequestException(NO_MEDICINE_MSG);
    // Comparación sin distinguir mayúsculas ni acentos: "Combustible" y
    // "combustible" son la misma categoría.
    const existing = await this.prisma.category.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
    });
    if (existing) throw new ConflictException('Ya existe una categoría con ese nombre');
    const category = await this.prisma.category.create({
      data: {
        name,
        unit: normalizeUnit(dto.unit),
        icon: dto.icon,
        kind: dto.kind ?? CategoryKind.SUPPLY,
      },
    });
    await this.audit.log(userId, 'create', 'Category', category.id, {
      name: category.name,
    });
    return category;
  }
}
