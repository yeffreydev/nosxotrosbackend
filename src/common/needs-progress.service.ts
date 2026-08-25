import { Injectable } from '@nestjs/common';
import { InventoryMovementType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Progreso de las metas en especie de una campaña.
 *
 * La regla es una sola y vale igual para las metas de la campaña y para las
 * necesidades de cada zona: una meta se enlaza con el inventario por
 * `titleKey` (título normalizado) + `unit`. Todo lo que entra a un centro de
 * acopio de la campaña con ese mismo producto suma; todo lo que sale (despacho)
 * cuenta como entregado.
 *
 *   fulfilledQty = Σ movimientos IN   → "recolectado"
 *   deliveredQty = Σ movimientos OUT  → "entregado"
 *
 * Se recalcula desde los movimientos (no se acumula a mano) para que un ajuste
 * de inventario nunca deje las metas descuadradas.
 */
@Injectable()
export class NeedsProgressService {
  constructor(private readonly prisma: PrismaService) {}

  /** Recalcula las metas de una campaña (las suyas y las de sus zonas). */
  async syncCampaign(campaignId?: string | null) {
    if (!campaignId) return;

    const [needs, centers] = await Promise.all([
      this.prisma.need.findMany({
        where: {
          OR: [{ campaignId }, { zone: { campaignId } }],
        },
        select: { id: true, titleKey: true, unit: true, fulfilledQty: true, deliveredQty: true },
      }),
      this.prisma.center.findMany({
        where: { campaignId },
        select: { id: true },
      }),
    ]);
    if (needs.length === 0) return;

    const centerIds = centers.map((c) => c.id);
    const totals = await this.movementTotals(centerIds);

    await Promise.all(
      needs.map((need) => {
        const key = `${need.titleKey}|${need.unit}`;
        const t = totals.get(key) ?? { in: 0, out: 0 };
        if (t.in === need.fulfilledQty && t.out === need.deliveredQty) return null;
        return this.prisma.need.update({
          where: { id: need.id },
          data: { fulfilledQty: t.in, deliveredQty: t.out },
        });
      }),
    );
  }

  /** Recalcula a partir de un centro (tras un alta de inventario o un despacho). */
  async syncByCenter(centerId: string) {
    const center = await this.prisma.center.findUnique({
      where: { id: centerId },
      select: { campaignId: true },
    });
    await this.syncCampaign(center?.campaignId);
  }

  /**
   * Entradas y salidas acumuladas por producto (nameKey + unidad) en un conjunto
   * de centros. Es la única lectura pesada: se hace una vez por sincronización.
   */
  private async movementTotals(centerIds: string[]) {
    const totals = new Map<string, { in: number; out: number }>();
    if (centerIds.length === 0) return totals;

    const movements = await this.prisma.inventoryMovement.findMany({
      where: { centerId: { in: centerIds } },
      select: {
        type: true,
        quantity: true,
        item: { select: { nameKey: true, unit: true } },
      },
    });

    for (const m of movements) {
      if (!m.item) continue;
      const key = `${m.item.nameKey}|${m.item.unit}`;
      const acc = totals.get(key) ?? { in: 0, out: 0 };
      if (m.type === InventoryMovementType.IN) acc.in += m.quantity;
      else if (m.type === InventoryMovementType.OUT) acc.out += m.quantity;
      // ADJUST no suma a la meta: no es material que haya llegado ni salido.
      totals.set(key, acc);
    }
    return totals;
  }
}
