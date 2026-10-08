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
  DonationStatus,
  DonationType,
  InventoryMovementType,
  Role,
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
import { TransferDto } from './dto/transfer.dto';

// Usuario opcional de las rutas públicas: con token válido llega poblado y
// permite mostrar también los almacenes internos (no públicos) al personal.
export interface OptionalViewer {
  id: string;
  role: Role;
}

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

  // Un almacén central que no acopia es bodega interna: existe para consolidar
  // y despachar, no para recibir donantes. No se publica.
  private canSeeInternal(viewer?: OptionalViewer): boolean {
    const staff: Role[] = [Role.ADMIN, Role.MANAGER, Role.REGISTRAR];
    return !!viewer && staff.includes(viewer.role);
  }

  private publicVisibilityWhere(viewer?: OptionalViewer) {
    if (this.canSeeInternal(viewer)) return {};
    return { NOT: { isCentral: true, acceptsDonations: false } };
  }

  /** Almacén central de una campaña, si lo tiene. */
  async findCampaignCentral(campaignId?: string | null) {
    if (!campaignId) return null;
    return this.prisma.center.findFirst({
      where: { campaignId, isCentral: true },
    });
  }

  // Máximo un almacén central por campaña: dos "centrales" romperían la regla
  // de que todo se consolida en un solo punto antes de entregar.
  private async assertSingleCentral(
    campaignId?: string | null,
    excludeCenterId?: string,
  ) {
    if (!campaignId) return;
    const other = await this.prisma.center.findFirst({
      where: {
        campaignId,
        isCentral: true,
        ...(excludeCenterId ? { id: { not: excludeCenterId } } : {}),
      },
      select: { name: true },
    });
    if (other) {
      throw new ConflictException(
        `La campaña ya tiene un almacén central ("${other.name}"). Quita esa marca primero si quieres cambiarlo.`,
      );
    }
  }

  /**
   * Resumen global de inventario para el panel del gestor.
   *
   * Suma el stock de todos los centros agrupando por producto (nameKey +
   * unidad) y lo separa en dos bolsas: centros de acopio (reciben donantes) y
   * almacén central (consolida y despacha). Cada producto se cruza con las
   * metas en especie de las campañas —mismo enlace titleKey + unidad que usa
   * NeedsProgressService— para saber cuánto falta o sobra del objetivo.
   *
   * Con `campaignId` el resumen se acota a los centros y metas de esa campaña;
   * sin él, abarca toda la plataforma.
   */
  async summary(campaignId?: string) {
    const [centers, items, needs] = await Promise.all([
      this.prisma.center.findMany({
        where: campaignId ? { campaignId } : {},
        select: {
          id: true,
          isCentral: true,
          status: true,
          capacity: true,
          currentLoad: true,
        },
      }),
      this.prisma.inventoryItem.findMany({
        where: {
          quantity: { gt: 0 },
          ...(campaignId ? { center: { campaignId } } : {}),
        },
        select: {
          name: true,
          nameKey: true,
          unit: true,
          quantity: true,
          center: { select: { isCentral: true } },
          category: { select: { name: true, icon: true } },
        },
      }),
      // Solo metas de campaña: las de zona reparten esa misma meta y sumarlas
      // duplicaría el objetivo.
      this.prisma.need.findMany({
        where: {
          ...(campaignId ? { campaignId } : { campaignId: { not: null } }),
          isBlocked: false,
        },
        select: { title: true, titleKey: true, unit: true, targetQty: true },
      }),
    ]);

    type Row = {
      nameKey: string;
      name: string;
      unit: string;
      icon: string | null;
      category: string | null;
      acopioQty: number;
      centralQty: number;
      targetQty: number;
    };
    const byProduct = new Map<string, Row>();
    const rowFor = (nameKey: string, unit: string, name: string): Row => {
      const key = `${nameKey}|${unit}`;
      let row = byProduct.get(key);
      if (!row) {
        row = {
          nameKey,
          name,
          unit,
          icon: null,
          category: null,
          acopioQty: 0,
          centralQty: 0,
          targetQty: 0,
        };
        byProduct.set(key, row);
      }
      return row;
    };

    for (const item of items) {
      // Ítems antiguos pueden tener nameKey vacío: se normaliza al vuelo para
      // que igual se crucen con la meta.
      const nameKey = item.nameKey || normalizeKey(item.name);
      const row = rowFor(nameKey, item.unit, item.name);
      row.name = item.name;
      row.icon ??= item.category?.icon ?? null;
      row.category ??= item.category?.name ?? null;
      if (item.center.isCentral) row.centralQty += item.quantity;
      else row.acopioQty += item.quantity;
    }
    // Las metas sin stock también aparecen: falta todo.
    for (const need of needs) {
      rowFor(need.titleKey, need.unit, need.title).targetQty += need.targetQty;
    }

    const products = [...byProduct.values()].map((r) => {
      const totalQty = r.acopioQty + r.centralQty;
      return {
        ...r,
        totalQty,
        // > 0 falta · < 0 sobra · null sin meta
        remaining: r.targetQty > 0 ? r.targetQty - totalQty : null,
      };
    });
    // Primero lo que tiene meta, con lo que más falta arriba; el resto por stock.
    products.sort((a, b) => {
      if ((a.remaining !== null) !== (b.remaining !== null)) {
        return a.remaining !== null ? -1 : 1;
      }
      if (a.remaining !== null && b.remaining !== null && a.remaining !== b.remaining) {
        return b.remaining - a.remaining;
      }
      return b.totalQty - a.totalQty;
    });

    const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
    const acopio = centers.filter((c) => !c.isCentral);
    const central = centers.filter((c) => c.isCentral);
    const withGoal = products.filter((r) => r.remaining !== null);

    return {
      centers: {
        total: centers.length,
        acopio: acopio.length,
        central: central.length,
        full: centers.filter((c) => c.status === CenterStatus.FULL).length,
        closed: centers.filter((c) => c.status === CenterStatus.CLOSED).length,
      },
      stock: {
        acopioQty: sum(products.map((r) => r.acopioQty)),
        centralQty: sum(products.map((r) => r.centralQty)),
        totalQty: sum(products.map((r) => r.totalQty)),
        capacity: sum(centers.map((c) => c.capacity)),
        currentLoad: sum(centers.map((c) => c.currentLoad)),
      },
      goals: {
        total: withGoal.length,
        reached: withGoal.filter((r) => (r.remaining ?? 0) <= 0).length,
      },
      products,
    };
  }

  async findAll(query: QueryCentersDto, viewer?: OptionalViewer) {
    const centers = await this.prisma.center.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...this.publicVisibilityWhere(viewer),
      },
      orderBy: [{ isCentral: 'desc' }, { name: 'asc' }],
    });
    return centers.map((c) => this.withLoadPct(c));
  }

  async findOne(id: string, viewer?: OptionalViewer) {
    const center = await this.prisma.center.findUnique({
      where: { id },
      include: {
        inventory: { include: { category: true }, orderBy: { name: 'asc' } },
        organization: true,
        campaign: { select: { id: true, title: true, slug: true } },
      },
    });
    if (!center) throw new NotFoundException('Centro no encontrado');
    if (
      center.isCentral &&
      !center.acceptsDonations &&
      !this.canSeeInternal(viewer)
    ) {
      // Bodega interna: para el público no existe.
      throw new NotFoundException('Centro no encontrado');
    }

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
    if (dto.isCentral) await this.assertSingleCentral(dto.campaignId);
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
        isCentral: dto.isCentral ?? false,
        // Un centro normal siempre acopia; la marca solo tiene sentido en el central.
        acceptsDonations: dto.isCentral ? dto.acceptsDonations ?? true : true,
      },
    });
    await this.audit.log(userId, 'create', 'Center', center.id);
    return this.withLoadPct(center);
  }

  async update(id: string, dto: UpdateCenterDto, userId: string) {
    const existing = await this.prisma.center.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Centro no encontrado');

    const willBeCentral = dto.isCentral ?? existing.isCentral;
    const campaignId =
      dto.campaignId !== undefined ? dto.campaignId : existing.campaignId;
    if (willBeCentral) await this.assertSingleCentral(campaignId, id);

    const capacity = dto.capacity ?? existing.capacity;
    const currentLoad = dto.currentLoad ?? existing.currentLoad;
    const center = await this.prisma.center.update({
      where: { id },
      data: {
        ...dto,
        // Solo el almacén central puede dejar de acopiar (bodega interna).
        acceptsDonations: willBeCentral
          ? dto.acceptsDonations ?? existing.acceptsDonations
          : true,
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

    // Donante presencial: con cualquier dato (o la marca de anónimo) el ingreso
    // se registra además como donación en especie ya recibida, con su código
    // público, para poder emitir el comprobante.
    const donorAnonymous = dto.donorAnonymous === true;
    const donorName = dto.donorName?.trim() || undefined;
    const donorPhone = dto.donorPhone?.trim() || undefined;
    const donorEmail = dto.donorEmail?.trim() || undefined;
    const wantsDonor =
      donorAnonymous || !!donorName || !!donorPhone || !!donorEmail;
    if (wantsDonor && !donorAnonymous && !donorName) {
      throw new BadRequestException(
        'Ingresa el nombre del donante o marca la donación como anónima',
      );
    }
    if (wantsDonor && quantity <= 0) {
      throw new BadRequestException(
        'Una donación registra lo entregado: la cantidad debe ser mayor que cero',
      );
    }
    if (wantsDonor && dto.donationId) {
      throw new BadRequestException(
        'El ingreso ya viene de una donación registrada: no registres otro donante',
      );
    }

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

      let donation: { id: string; code: string } | null = null;
      if (quantity > 0) {
        if (wantsDonor) {
          // La donación nace ya recibida: el donante la entregó en mano y su
          // código sirve para el comprobante y para rastrearla en la web.
          donation = await tx.donation.create({
            data: {
              type: DonationType.GOODS,
              status: DonationStatus.RECEIVED,
              description: name,
              quantity,
              anonymous: donorAnonymous,
              donorName: donorAnonymous ? null : donorName,
              donorPhone: donorAnonymous ? null : donorPhone,
              donorEmail: donorAnonymous ? null : donorEmail,
              categoryId: dto.categoryId,
              centerId,
              campaignId: center.campaignId,
              events: {
                create: {
                  status: DonationStatus.RECEIVED,
                  title: 'Recibida en acopio',
                  note: `Entregada en ${center.name}`,
                },
              },
            },
            select: { id: true, code: true },
          });
        }
        await tx.inventoryMovement.create({
          data: {
            itemId: item.id,
            centerId,
            type: InventoryMovementType.IN,
            quantity,
            reason:
              dto.note?.trim() ||
              (donation
                ? 'Donación recibida en acopio'
                : existing
                  ? 'Ingreso de producto'
                  : 'Alta de producto'),
            userId,
            donationId: donation?.id ?? dto.donationId,
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
      return { item, donation };
    });

    // Lo que entra hace avanzar las metas en especie de la campaña del centro.
    await this.needs.syncCampaign(center.campaignId);

    await this.audit.log(
      userId,
      existing ? 'stock-in' : 'create',
      'InventoryItem',
      result.item.id,
      {
        centerId,
        sku: result.item.sku,
        quantity,
        merged: !!existing,
        donationId: result.donation?.id,
      },
    );
    // `merged` le dice a la app si sumó a un producto que ya existía;
    // `donation` (id + code) permite emitir el comprobante del donante.
    return { ...result.item, merged: !!existing, donation: result.donation };
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
        // Quién trajo la donación (para mostrarlo y reimprimir su comprobante).
        // Es una vista de staff: el donante anónimo igual se muestra como tal
        // en la UI y su comprobante sale sin datos personales.
        donation: {
          select: {
            id: true,
            code: true,
            anonymous: true,
            donorName: true,
            donorPhone: true,
            donorEmail: true,
          },
        },
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

    // Con almacén central, las salidas (OUT = entrega) van solo desde el
    // central; el acopio transfiere, no entrega.
    if (dto.type === InventoryMovementType.OUT && !item.center.isCentral) {
      const central = await this.findCampaignCentral(item.center.campaignId);
      if (central) {
        throw new BadRequestException(
          `Esta campaña despacha desde su almacén central ("${central.name}"). Transfiere el stock al central en vez de dar salida aquí.`,
        );
      }
    }

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

    // Si la campaña tiene almacén central, las entregas a beneficiarios salen
    // solo de ahí: los centros de acopio primero transfieren lo recaudado.
    if (!item.center.isCentral) {
      const central = await this.findCampaignCentral(item.center.campaignId);
      if (central) {
        throw new BadRequestException(
          `Esta campaña despacha desde su almacén central ("${central.name}"). Transfiere el stock al central y despacha desde ahí.`,
        );
      }
    }

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

  /**
   * Transfiere stock de un centro de acopio al almacén central de su campaña.
   *
   * Sale del origen (TRANSFER_OUT) y entra al destino (TRANSFER_IN) en una sola
   * transacción; en el destino se fusiona por producto (nameKey + unidad), igual
   * que un ingreso normal. No toca las metas: el material ya se contó como
   * recolectado al entrar al acopio, y todavía no se entregó a nadie.
   */
  async transfer(centerId: string, dto: TransferDto, userId: string) {
    const from = await this.prisma.center.findUnique({
      where: { id: centerId },
      include: { inventory: true },
    });
    if (!from) throw new NotFoundException('Centro no encontrado');

    // Destino: el que venga en el DTO o el almacén central de la campaña.
    const to = dto.toCenterId
      ? await this.prisma.center.findUnique({ where: { id: dto.toCenterId } })
      : await this.findCampaignCentral(from.campaignId);
    if (!to) {
      throw new BadRequestException(
        dto.toCenterId
          ? 'Centro de destino no encontrado'
          : 'La campaña no tiene un almacén central. Márcalo en la pestaña Centros.',
      );
    }
    if (to.id === from.id) {
      throw new BadRequestException('El centro no puede transferirse a sí mismo');
    }
    if (!to.isCentral) {
      throw new BadRequestException(
        'Las transferencias van al almacén central de la campaña',
      );
    }
    if (from.campaignId && to.campaignId !== from.campaignId) {
      throw new BadRequestException(
        'El almacén central no pertenece a la campaña del centro de origen',
      );
    }

    // Qué se transfiere: todo el stock disponible o los ítems elegidos.
    let entries: { item: (typeof from.inventory)[number]; quantity: number }[];
    if (dto.all) {
      entries = from.inventory
        .filter((i) => i.quantity > 0)
        .map((item) => ({ item, quantity: item.quantity }));
    } else {
      if (!dto.items?.length) {
        throw new BadRequestException(
          'Indica los ítems a transferir o usa "all" para todo el stock',
        );
      }
      const byId = new Map(from.inventory.map((i) => [i.id, i]));
      entries = dto.items.map(({ itemId, quantity }) => {
        const item = byId.get(itemId);
        if (!item) {
          throw new NotFoundException('Ítem no encontrado en el centro');
        }
        if (quantity > item.quantity) {
          throw new BadRequestException(
            `Solo hay ${item.quantity} ${item.unit} de ${item.name} en el almacén.`,
          );
        }
        return { item, quantity };
      });
    }
    if (entries.length === 0) {
      throw new BadRequestException('No hay stock para transferir');
    }

    const totalQty = entries.reduce((s, e) => s + e.quantity, 0);
    const reason = dto.note?.trim() || `Transferencia a ${to.name}`;

    const result = await this.prisma.$transaction(async (tx) => {
      const created = await tx.transfer.create({
        data: {
          fromCenterId: from.id,
          toCenterId: to.id,
          note: dto.note?.trim() || undefined,
          userId,
          items: {
            create: entries.map((e) => ({
              name: e.item.name,
              quantity: e.quantity,
              unit: e.item.unit,
            })),
          },
        },
      });

      for (const { item, quantity } of entries) {
        // Sale del origen.
        await tx.inventoryItem.update({
          where: { id: item.id },
          data: { quantity: item.quantity - quantity },
        });
        await tx.inventoryMovement.create({
          data: {
            itemId: item.id,
            centerId: from.id,
            type: InventoryMovementType.TRANSFER_OUT,
            quantity,
            reason,
            userId,
            transferId: created.id,
          },
        });

        // Entra al destino, fusionando por producto+unidad como en createItem.
        const existing = await tx.inventoryItem.findFirst({
          where: { centerId: to.id, nameKey: item.nameKey, unit: item.unit },
        });
        const destItem = existing
          ? await tx.inventoryItem.update({
              where: { id: existing.id },
              data: {
                quantity: existing.quantity + quantity,
                ...(item.expiresAt &&
                (!existing.expiresAt || item.expiresAt < existing.expiresAt)
                  ? { expiresAt: item.expiresAt }
                  : {}),
              },
            })
          : await tx.inventoryItem.create({
              data: {
                centerId: to.id,
                categoryId: item.categoryId,
                name: item.name,
                nameKey: item.nameKey,
                quantity,
                unit: item.unit,
                expiresAt: item.expiresAt ?? undefined,
              },
            });
        await tx.inventoryMovement.create({
          data: {
            itemId: destItem.id,
            centerId: to.id,
            type: InventoryMovementType.TRANSFER_IN,
            quantity,
            reason: `Transferencia desde ${from.name}`,
            userId,
            transferId: created.id,
          },
        });
      }

      const fromLoad = Math.max(0, from.currentLoad - totalQty);
      await tx.center.update({
        where: { id: from.id },
        data: {
          currentLoad: fromLoad,
          status: this.computeStatus(fromLoad, from.capacity),
        },
      });
      const toLoad = to.currentLoad + totalQty;
      await tx.center.update({
        where: { id: to.id },
        data: {
          currentLoad: toLoad,
          status: this.computeStatus(toLoad, to.capacity),
        },
      });

      return tx.transfer.findUniqueOrThrow({
        where: { id: created.id },
        include: {
          items: true,
          fromCenter: { select: { id: true, name: true } },
          toCenter: { select: { id: true, name: true } },
        },
      });
    });

    await this.audit.log(userId, 'transfer', 'Center', from.id, {
      toCenterId: to.id,
      items: entries.length,
      totalQty,
    });
    return result;
  }

  /** Historial de transferencias de un centro (enviadas y recibidas). */
  async listTransfers(centerId: string, limit = 50) {
    const center = await this.prisma.center.findUnique({
      where: { id: centerId },
    });
    if (!center) throw new NotFoundException('Centro no encontrado');
    return this.prisma.transfer.findMany({
      where: { OR: [{ fromCenterId: centerId }, { toCenterId: centerId }] },
      include: {
        items: true,
        fromCenter: { select: { id: true, name: true } },
        toCenter: { select: { id: true, name: true } },
        user: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 200),
    });
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
