/* eslint-disable no-console */
// Seed de PRODUCCIÓN: solo datos base (catálogo de categorías). No crea usuarios
// demo, campañas ni donaciones. El superadmin lo crea el backend al arrancar
// desde SUPERADMIN_USER / SUPERADMIN_PASSWORD del .env.
//
//   npm run seed:base
import { CategoryKind, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const categoryDefs = [
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

async function main() {
  for (const c of categoryDefs) {
    await prisma.category.upsert({
      where: { name: c.name },
      update: { unit: c.unit, icon: c.icon, kind: c.kind },
      create: c,
    });
  }
  console.log(`✓ ${categoryDefs.length} categorías base`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
