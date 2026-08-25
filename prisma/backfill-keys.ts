/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';

/**
 * Rellena las claves normalizadas que agrupan inventario y metas
 * (`InventoryItem.nameKey` y `Need.titleKey`) en bases que ya tenían datos.
 *
 * Es idempotente: solo toca las filas cuya clave está vacía o desactualizada.
 * Ejecutar una vez después de `prisma db push`:
 *
 *   npx ts-node prisma/backfill-keys.ts
 */
function normalizeKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeUnit(value?: string | null): string {
  const unit = (value ?? '').trim().toLowerCase();
  return unit || 'unidad';
}

export async function backfillKeys(prisma: PrismaClient) {
  const items = await prisma.inventoryItem.findMany({
    select: { id: true, name: true, nameKey: true, unit: true },
  });
  let itemsFixed = 0;
  for (const item of items) {
    const nameKey = normalizeKey(item.name);
    const unit = normalizeUnit(item.unit);
    if (nameKey === item.nameKey && unit === item.unit) continue;
    await prisma.inventoryItem.update({
      where: { id: item.id },
      data: { nameKey, unit },
    });
    itemsFixed++;
  }

  const needs = await prisma.need.findMany({
    select: { id: true, title: true, titleKey: true, unit: true, zoneId: true, campaignId: true },
  });
  let needsFixed = 0;
  for (const need of needs) {
    const titleKey = normalizeKey(need.title);
    const unit = normalizeUnit(need.unit);
    // Una necesidad de zona también cuelga de la campaña: así entra en las metas.
    let campaignId = need.campaignId;
    if (!campaignId && need.zoneId) {
      const zone = await prisma.zone.findUnique({
        where: { id: need.zoneId },
        select: { campaignId: true },
      });
      campaignId = zone?.campaignId ?? null;
    }
    if (
      titleKey === need.titleKey &&
      unit === need.unit &&
      campaignId === need.campaignId
    ) {
      continue;
    }
    await prisma.need.update({
      where: { id: need.id },
      data: { titleKey, unit, campaignId },
    });
    needsFixed++;
  }

  return { itemsFixed, needsFixed };
}

if (require.main === module) {
  const prisma = new PrismaClient();
  backfillKeys(prisma)
    .then((r) =>
      console.log(
        `✓ Claves normalizadas: ${r.itemsFixed} ítems, ${r.needsFixed} necesidades`,
      ),
    )
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
