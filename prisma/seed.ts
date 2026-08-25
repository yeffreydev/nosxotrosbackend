/* eslint-disable no-console */
import {
  AssignmentStatus,
  BeneficiaryStatus,
  CampaignCategory,
  CampaignStatus,
  CategoryKind,
  CenterStatus,
  DispatchStatus,
  DonationStatus,
  DonationType,
  EmergencyStatus,
  InventoryMovementType,
  NotificationType,
  OrgType,
  PaymentMethod,
  PaymentStatus,
  PrismaClient,
  Role,
  Severity,
  VolunteerSkill,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { backfillKeys } from './backfill-keys';

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'nosxotros123';

function daysFromNow(days: number, hour = 9): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d;
}

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 3600000);
}

async function main() {
  console.log('🌱 Seeding NOSXOTROS database...');

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // ───────── Categories (upsert by unique name) ─────────
  const categoryDefs = [
    { name: 'Alimentos', unit: 'kg', icon: '🍚', kind: CategoryKind.SUPPLY },
    { name: 'Agua', unit: 'litro', icon: '💧', kind: CategoryKind.SUPPLY },
    { name: 'Abrigo', unit: 'unidad', icon: '🧥', kind: CategoryKind.SUPPLY },
    { name: 'Higiene', unit: 'kit', icon: '🧼', kind: CategoryKind.SUPPLY },
    // Sin "Medicinas": la plataforma no recibe medicamentos (sí botiquines).
    { name: 'Botiquín', unit: 'unidad', icon: '🩹', kind: CategoryKind.SUPPLY },
    { name: 'Ropa', unit: 'unidad', icon: '👕', kind: CategoryKind.SUPPLY },
    { name: 'Limpieza', unit: 'unidad', icon: '🧴', kind: CategoryKind.SUPPLY },
    { name: 'Herramientas', unit: 'unidad', icon: '🛠️', kind: CategoryKind.TOOL },
    { name: 'Materiales', unit: 'unidad', icon: '🧱', kind: CategoryKind.TOOL },
    { name: 'Transporte', unit: 'viaje', icon: '🚚', kind: CategoryKind.TRANSPORT },
    { name: 'Combustible', unit: 'galón', icon: '⛽', kind: CategoryKind.FUEL },
    { name: 'Mano de obra', unit: 'hora', icon: '🤝', kind: CategoryKind.SERVICE },
  ];
  const categories: Record<string, { id: string; unit: string }> = {};
  for (const c of categoryDefs) {
    const cat = await prisma.category.upsert({
      where: { name: c.name },
      update: { unit: c.unit, icon: c.icon, kind: c.kind },
      create: c,
    });
    categories[c.name] = { id: cat.id, unit: cat.unit };
  }
  console.log(`  ✓ ${categoryDefs.length} categorías`);

  // ───────── Clean transactional data (dependency-safe order) ─────────
  await prisma.traceEvent.deleteMany();
  await prisma.inventoryMovement.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.dispatchItem.deleteMany();
  await prisma.shiftAssignment.deleteMany();
  await prisma.need.deleteMany();
  await prisma.dispatch.deleteMany();
  await prisma.donation.deleteMany();
  await prisma.campaignUpdate.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.beneficiary.deleteMany();
  await prisma.inventoryItem.deleteMany();
  await prisma.shift.deleteMany();
  await prisma.center.deleteMany();
  await prisma.emergency.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.surveyResponse.deleteMany();
  await prisma.auditLog.deleteMany();
  console.log('  ✓ datos transaccionales limpiados');

  // ───────── Organizations ─────────
  const ngo = await prisma.organization.upsert({
    where: { ruc: '20100000001' },
    update: {
      name: 'Cáritas Arequipa',
      type: OrgType.NGO,
      verified: true,
      description: 'ONG de ayuda humanitaria en la región Arequipa.',
      contactEmail: 'contacto@caritasaqp.pe',
      lat: -16.3989,
      lng: -71.535,
    },
    create: {
      name: 'Cáritas Arequipa',
      type: OrgType.NGO,
      ruc: '20100000001',
      verified: true,
      impactLens: false,
      description: 'ONG de ayuda humanitaria en la región Arequipa.',
      contactEmail: 'contacto@caritasaqp.pe',
      lat: -16.3989,
      lng: -71.535,
    },
  });

  const startup = await prisma.organization.upsert({
    where: { ruc: '20600000002' },
    update: {
      name: 'ImpactaLab',
      type: OrgType.STARTUP,
      impactLens: true,
      verified: false,
      description: 'Emprendimiento con lente de impacto social y logístico.',
      website: 'https://impactalab.pe',
      lat: -16.409,
      lng: -71.537,
    },
    create: {
      name: 'ImpactaLab',
      type: OrgType.STARTUP,
      ruc: '20600000002',
      impactLens: true,
      verified: false,
      description: 'Emprendimiento con lente de impacto social y logístico.',
      website: 'https://impactalab.pe',
      lat: -16.409,
      lng: -71.537,
    },
  });
  console.log('  ✓ 2 organizaciones');

  // ───────── Users (upsert by email) ─────────
  const donor = await prisma.user.upsert({
    where: { email: 'donor@nosxotros.pe' },
    update: { passwordHash, fullName: 'Diana Donante', role: Role.DONOR },
    create: {
      email: 'donor@nosxotros.pe',
      passwordHash,
      fullName: 'Diana Donante',
      role: Role.DONOR,
      phone: '+51999000001',
    },
  });

  const volunteer = await prisma.user.upsert({
    where: { email: 'volunteer@nosxotros.pe' },
    update: { passwordHash, fullName: 'Víctor Voluntario', role: Role.VOLUNTEER },
    create: {
      email: 'volunteer@nosxotros.pe',
      passwordHash,
      fullName: 'Víctor Voluntario',
      role: Role.VOLUNTEER,
      phone: '+51999000002',
    },
  });

  const manager = await prisma.user.upsert({
    where: { email: 'manager@nosxotros.pe' },
    update: {
      passwordHash,
      fullName: 'Marta Gestora',
      role: Role.MANAGER,
      organizationId: ngo.id,
    },
    create: {
      email: 'manager@nosxotros.pe',
      passwordHash,
      fullName: 'Marta Gestora',
      role: Role.MANAGER,
      phone: '+51999000003',
      organizationId: ngo.id,
    },
  });

  const registrar = await prisma.user.upsert({
    where: { email: 'registrar@nosxotros.pe' },
    update: { passwordHash, fullName: 'Renzo Empadronador', role: Role.REGISTRAR },
    create: {
      email: 'registrar@nosxotros.pe',
      passwordHash,
      fullName: 'Renzo Empadronador',
      role: Role.REGISTRAR,
      phone: '+51999000004',
    },
  });

  const admin = await prisma.user.upsert({
    where: { email: 'admin@nosxotros.pe' },
    update: { passwordHash, fullName: 'Ana Admin', role: Role.ADMIN },
    create: {
      email: 'admin@nosxotros.pe',
      passwordHash,
      fullName: 'Ana Admin',
      role: Role.ADMIN,
      phone: '+51999000005',
    },
  });

  // Limpia el usuario "organizer" de seeds previos (el rol se fusionó con MANAGER).
  await prisma.user.deleteMany({ where: { email: 'organizer@nosxotros.pe' } });

  // Volunteer profile (upsert)
  const volunteerProfile = await prisma.volunteerProfile.upsert({
    where: { userId: volunteer.id },
    update: {
      skills: [VolunteerSkill.LOGISTICS, VolunteerSkill.GENERAL],
      totalHours: 0,
      impactPoints: 0,
      badges: [],
      radiusKm: 15,
      baseLat: -16.4,
      baseLng: -71.53,
    },
    create: {
      userId: volunteer.id,
      skills: [VolunteerSkill.LOGISTICS, VolunteerSkill.GENERAL],
      radiusKm: 15,
      baseLat: -16.4,
      baseLng: -71.53,
      interests: ['logistics', 'comunidad'],
    },
  });
  console.log('  ✓ 5 usuarios demo (password: nosxotros123)');

  // ───────── Emergencies + needs ─────────
  const emergency1 = await prisma.emergency.create({
    data: {
      title: 'Huaico en Alto Selva Alegre',
      description:
        'Lluvias intensas provocaron un huaico que afectó a más de 300 familias.',
      status: EmergencyStatus.ACTIVE,
      severity: Severity.HIGH,
      lat: -16.385,
      lng: -71.51,
      address: 'Alto Selva Alegre',
      district: 'Alto Selva Alegre',
      needs: {
        create: [
          {
            title: 'Frazadas para familias damnificadas',
            categoryId: categories['Abrigo'].id,
            targetQty: 300,
            fulfilledQty: 80,
            unit: 'unidad',
            priority: Severity.HIGH,
          },
          {
            title: 'Kits de higiene',
            categoryId: categories['Higiene'].id,
            targetQty: 200,
            fulfilledQty: 50,
            unit: 'kit',
            priority: Severity.MEDIUM,
          },
          {
            title: 'No traer agua embotellada (hay stock suficiente)',
            categoryId: categories['Agua'].id,
            targetQty: 0,
            fulfilledQty: 0,
            unit: 'litro',
            priority: Severity.LOW,
            isBlocked: true,
          },
        ],
      },
    },
  });

  const emergency2 = await prisma.emergency.create({
    data: {
      title: 'Sismo en Cayma',
      description:
        'Sismo de 5.6 generó daños estructurales en viviendas del distrito de Cayma.',
      status: EmergencyStatus.ACTIVE,
      severity: Severity.CRITICAL,
      lat: -16.378,
      lng: -71.55,
      address: 'Cayma',
      district: 'Cayma',
      needs: {
        create: [
          {
            title: 'Alimentos no perecibles',
            categoryId: categories['Alimentos'].id,
            targetQty: 500,
            fulfilledQty: 120,
            unit: 'kg',
            priority: Severity.CRITICAL,
          },
          {
            title: 'Botiquines de primeros auxilios',
            categoryId: categories['Botiquín'].id,
            targetQty: 150,
            fulfilledQty: 30,
            unit: 'unidad',
            priority: Severity.HIGH,
          },
        ],
      },
    },
  });
  console.log('  ✓ 2 emergencias con necesidades');

  // ───────── Centers + inventory ─────────
  const center1 = await prisma.center.create({
    data: {
      name: 'Centro de Acopio Cercado',
      address: 'Av. La Marina 101, Cercado, Arequipa',
      reference: 'A media cuadra del puente Grau, portón verde',
      openingHours: 'Lun-Sáb 8:00-18:00',
      mapUrl: 'https://www.google.com/maps/search/?api=1&query=-16.398,-71.537',
      lat: -16.398,
      lng: -71.537,
      capacity: 2000,
      currentLoad: 0,
      contactPhone: '+51054000111',
      organizationId: ngo.id,
    },
  });

  const center2 = await prisma.center.create({
    data: {
      name: 'Centro de Acopio Cayma',
      address: 'Av. Ejército 500, Cayma, Arequipa',
      reference: 'Frente al mercado de Cayma, local con toldo azul',
      openingHours: 'Lun-Vie 9:00-17:00',
      mapUrl: 'https://www.google.com/maps/search/?api=1&query=-16.376,-71.548',
      lat: -16.376,
      lng: -71.548,
      capacity: 1500,
      currentLoad: 0,
      contactPhone: '+51054000222',
      organizationId: ngo.id,
    },
  });

  async function addItem(
    centerId: string,
    categoryName: string,
    name: string,
    quantity: number,
  ) {
    const cat = categories[categoryName];
    const item = await prisma.inventoryItem.create({
      data: {
        centerId,
        categoryId: cat.id,
        name,
        quantity,
        unit: cat.unit,
      },
    });
    await prisma.inventoryMovement.create({
      data: {
        itemId: item.id,
        centerId,
        type: InventoryMovementType.IN,
        quantity,
        reason: 'Carga inicial (seed)',
        userId: manager.id,
      },
    });
    return item;
  }

  const c1Items = [
    await addItem(center1.id, 'Abrigo', 'Frazadas térmicas', 120),
    await addItem(center1.id, 'Higiene', 'Kits de higiene familiar', 90),
    await addItem(center1.id, 'Alimentos', 'Arroz (sacos)', 200),
  ];
  const c2Items = [
    await addItem(center2.id, 'Alimentos', 'Conservas surtidas', 150),
    await addItem(center2.id, 'Botiquín', 'Botiquines básicos', 60),
    await addItem(center2.id, 'Agua', 'Bidones de agua', 100),
  ];

  // recompute loads/status
  for (const center of [center1, center2]) {
    const items = await prisma.inventoryItem.findMany({
      where: { centerId: center.id },
    });
    const load = items.reduce((a, i) => a + i.quantity, 0);
    const pct = (load / center.capacity) * 100;
    const status =
      pct >= 100
        ? CenterStatus.FULL
        : pct >= 85
          ? CenterStatus.NEAR_FULL
          : CenterStatus.OPEN;
    await prisma.center.update({
      where: { id: center.id },
      data: { currentLoad: load, status },
    });
  }
  console.log('  ✓ 2 centros con inventario');

  // ───────── Shifts (future) + one completed assignment ─────────
  const shift1 = await prisma.shift.create({
    data: {
      title: 'Clasificación de donaciones',
      description: 'Apoyo en clasificación y empaque en el centro Cercado.',
      skill: VolunteerSkill.LOGISTICS,
      startsAt: daysFromNow(2, 9),
      endsAt: daysFromNow(2, 13),
      capacity: 15,
      lat: center1.lat,
      lng: center1.lng,
      address: center1.address,
      centerId: center1.id,
      emergencyId: emergency1.id,
    },
  });

  const shift2 = await prisma.shift.create({
    data: {
      title: 'Reparto en Cayma',
      description: 'Distribución de alimentos a familias damnificadas.',
      skill: VolunteerSkill.DRIVER,
      startsAt: daysFromNow(3, 8),
      endsAt: daysFromNow(3, 14),
      capacity: 10,
      lat: emergency2.lat,
      lng: emergency2.lng,
      address: 'Cayma',
      centerId: center2.id,
      emergencyId: emergency2.id,
    },
  });

  const shift3 = await prisma.shift.create({
    data: {
      title: 'Atención psicológica',
      description: 'Soporte emocional a familias afectadas.',
      skill: VolunteerSkill.PSYCHOLOGY,
      startsAt: daysFromNow(4, 10),
      endsAt: daysFromNow(4, 16),
      capacity: 8,
      lat: emergency1.lat,
      lng: emergency1.lng,
      centerId: center1.id,
      emergencyId: emergency1.id,
    },
  });

  // A completed (checked-out) shift in the recent past for the demo volunteer
  const shift4 = await prisma.shift.create({
    data: {
      title: 'Jornada de empaque (pasada)',
      description: 'Turno ya realizado para el pasaporte de impacto.',
      skill: VolunteerSkill.GENERAL,
      startsAt: hoursAgo(30),
      endsAt: hoursAgo(26),
      capacity: 20,
      status: 'DONE',
      lat: center1.lat,
      lng: center1.lng,
      centerId: center1.id,
      emergencyId: emergency1.id,
    },
  });

  // Enroll demo volunteer in an upcoming shift
  await prisma.shiftAssignment.create({
    data: {
      shiftId: shift1.id,
      volunteerId: volunteerProfile.id,
      status: AssignmentStatus.ENROLLED,
    },
  });

  // Completed assignment (checked out) → grants hours/points/badges
  const completedCheckIn = hoursAgo(30);
  const completedCheckOut = hoursAgo(26);
  const completedHours =
    Math.round(
      ((completedCheckOut.getTime() - completedCheckIn.getTime()) / 3600000) *
        10,
    ) / 10;
  await prisma.shiftAssignment.create({
    data: {
      shiftId: shift4.id,
      volunteerId: volunteerProfile.id,
      status: AssignmentStatus.CHECKED_OUT,
      checkInAt: completedCheckIn,
      checkInLat: center1.lat,
      checkInLng: center1.lng,
      checkOutAt: completedCheckOut,
      hours: completedHours,
    },
  });
  await prisma.volunteerProfile.update({
    where: { id: volunteerProfile.id },
    data: {
      totalHours: completedHours,
      impactPoints: Math.round(completedHours * 10),
      badges: ['Primer turno'],
    },
  });
  console.log('  ✓ 4 turnos (3 futuros + 1 realizado) y asignaciones');

  // ───────── Beneficiaries ─────────
  const ben1 = await prisma.beneficiary.create({
    data: {
      docNumber: '70111222',
      fullName: 'Rosa Mamani Quispe',
      householdSize: 5,
      phone: '+51988111222',
      district: 'Alto Selva Alegre',
      address: 'Calle Los Ángeles 234',
      needs: ['frazadas', 'alimentos'],
      status: BeneficiaryStatus.VALIDATED,
      emergencyId: emergency1.id,
      registeredById: registrar.id,
      lat: -16.386,
      lng: -71.511,
    },
  });
  await prisma.beneficiary.create({
    data: {
      docNumber: '70333444',
      fullName: 'Juan Huamán Flores',
      householdSize: 3,
      phone: '+51988333444',
      district: 'Cayma',
      needs: ['alimentos', 'medicinas'],
      status: BeneficiaryStatus.VALIDATED,
      emergencyId: emergency2.id,
      registeredById: registrar.id,
      lat: -16.379,
      lng: -71.551,
    },
  });
  await prisma.beneficiary.create({
    data: {
      docNumber: '70555666',
      fullName: 'María Condori Apaza',
      householdSize: 4,
      phone: '+51988555666',
      district: 'Alto Selva Alegre',
      needs: ['higiene'],
      status: BeneficiaryStatus.PENDING,
      emergencyId: emergency1.id,
      registeredById: registrar.id,
    },
  });
  console.log('  ✓ 3 beneficiarios');

  // ───────── Donations (varios tipos + timelines) ─────────
  // 1. MONEY donation, delivered with full timeline
  const donationMoney = await prisma.donation.create({
    data: {
      type: DonationType.MONEY,
      status: DonationStatus.DELIVERED,
      amount: 250,
      currency: 'PEN',
      description: 'Aporte para compra de frazadas',
      donorId: donor.id,
      emergencyId: emergency1.id,
      categoryId: categories['Abrigo'].id,
      centerId: center1.id,
      payment: {
        create: {
          method: PaymentMethod.YAPE,
          status: PaymentStatus.PAID,
          amount: 250,
          reference: 'YAPE-SEED-001',
          paidAt: hoursAgo(70),
        },
      },
      events: {
        create: [
          {
            status: DonationStatus.PROMISED,
            title: 'Donación registrada',
            note: 'Donación registrada. ¡Gracias!',
            createdAt: hoursAgo(72),
          },
          {
            status: DonationStatus.RECEIVED,
            title: 'Pago confirmado / recibida',
            note: 'Pago confirmado vía Yape.',
            createdAt: hoursAgo(70),
          },
          {
            status: DonationStatus.IN_TRANSIT,
            title: 'En camino',
            note: 'Despachada hacia la zona afectada.',
            createdAt: hoursAgo(50),
          },
          {
            status: DonationStatus.DELIVERED,
            title: 'Entregada a beneficiarios',
            note: 'Entregada a familias en Alto Selva Alegre.',
            lat: -16.386,
            lng: -71.511,
            createdAt: hoursAgo(48),
          },
        ],
      },
    },
  });

  // 2. GOODS donation, received
  const donationGoods = await prisma.donation.create({
    data: {
      type: DonationType.GOODS,
      status: DonationStatus.RECEIVED,
      quantity: 50,
      description: '50 kits de higiene',
      donorId: donor.id,
      emergencyId: emergency1.id,
      categoryId: categories['Higiene'].id,
      centerId: center1.id,
      payment: {
        create: {
          method: PaymentMethod.IN_KIND,
          status: PaymentStatus.PAID,
          amount: 0,
          paidAt: hoursAgo(20),
        },
      },
      events: {
        create: [
          {
            status: DonationStatus.PROMISED,
            title: 'Donación registrada',
            createdAt: hoursAgo(24),
          },
          {
            status: DonationStatus.RECEIVED,
            title: 'Recibida en acopio',
            note: 'Ingresada al Centro de Acopio Cercado.',
            createdAt: hoursAgo(20),
          },
        ],
      },
    },
  });

  // 3. TIME donation, promised (anonymous)
  await prisma.donation.create({
    data: {
      type: DonationType.TIME,
      status: DonationStatus.PROMISED,
      quantity: 8,
      description: '8 horas de voluntariado logístico',
      anonymous: true,
      donorName: 'Anónimo',
      donorEmail: 'oculto@example.com',
      emergencyId: emergency2.id,
      payment: {
        create: {
          method: PaymentMethod.IN_KIND,
          status: PaymentStatus.PENDING,
          amount: 0,
        },
      },
      events: {
        create: [
          {
            status: DonationStatus.PROMISED,
            title: 'Donación registrada',
            note: 'Compromiso de horas de voluntariado.',
            createdAt: hoursAgo(5),
          },
        ],
      },
    },
  });

  // 4. MONEY donation pending payment (guest)
  await prisma.donation.create({
    data: {
      type: DonationType.MONEY,
      status: DonationStatus.PROMISED,
      amount: 100,
      currency: 'PEN',
      description: 'Donación para alimentos',
      donorName: 'Pedro Invitado',
      donorEmail: 'pedro@example.com',
      emergencyId: emergency2.id,
      categoryId: categories['Alimentos'].id,
      payment: {
        create: {
          method: PaymentMethod.PLIN,
          status: PaymentStatus.PENDING,
          amount: 100,
        },
      },
      events: {
        create: [
          {
            status: DonationStatus.PROMISED,
            title: 'Donación registrada',
            createdAt: hoursAgo(2),
          },
        ],
      },
    },
  });
  console.log('  ✓ 4 donaciones (MONEY/GOODS/TIME) con timelines');

  // ───────── Dispatch DELIVERED ─────────
  await prisma.dispatch.create({
    data: {
      status: DispatchStatus.DELIVERED,
      fromCenterId: center1.id,
      emergencyId: emergency1.id,
      destLat: -16.386,
      destLng: -71.511,
      destAddress: 'Alto Selva Alegre - zona afectada',
      driverName: 'Carlos Conductor',
      departedAt: hoursAgo(50),
      deliveredAt: hoursAgo(48),
      items: {
        create: [
          {
            description: 'Frazadas térmicas',
            quantity: 80,
            donationId: donationMoney.id,
            beneficiaryId: ben1.id,
            delivered: true,
          },
          {
            description: 'Kits de higiene',
            quantity: 40,
            donationId: donationGoods.id,
            delivered: true,
          },
        ],
      },
    },
  });
  // mark beneficiary served (delivered dispatch)
  await prisma.beneficiary.update({
    where: { id: ben1.id },
    data: { status: BeneficiaryStatus.SERVED },
  });
  console.log('  ✓ 1 despacho DELIVERED');

  // ───────── Notifications ─────────
  await prisma.notification.createMany({
    data: [
      {
        userId: donor.id,
        type: NotificationType.IMPACT,
        title: '¡Tu donación fue entregada!',
        body: 'Tu aporte de S/250 llegó a familias en Alto Selva Alegre.',
        link: `/donations/track/${donationMoney.code}`,
        read: false,
      },
      {
        userId: volunteer.id,
        type: NotificationType.SHIFT,
        title: 'Nuevo turno disponible',
        body: 'Hay un turno de clasificación de donaciones cerca de ti.',
        read: false,
      },
      {
        userId: manager.id,
        type: NotificationType.ALERT,
        title: 'Centro casi lleno',
        body: 'Revisa la capacidad del Centro de Acopio Cercado.',
        read: true,
      },
    ],
  });
  console.log('  ✓ notificaciones');

  // ───────── Survey responses (ease + nps) ─────────
  await prisma.surveyResponse.createMany({
    data: [
      { userId: donor.id, kind: 'ease', score: 5, context: 'donation:done' },
      { userId: volunteer.id, kind: 'ease', score: 4, context: 'shift:checkout' },
      { userId: registrar.id, kind: 'ease', score: 5, context: 'beneficiary:create' },
      { userId: donor.id, kind: 'nps', score: 10, context: 'donation:done' },
      { userId: volunteer.id, kind: 'nps', score: 9, context: 'shift:checkout' },
      { userId: manager.id, kind: 'nps', score: 7, context: 'dashboard' },
      { userId: registrar.id, kind: 'nps', score: 5, context: 'census' },
    ],
  });
  console.log('  ✓ encuestas (ease + nps)');

  // ───────── Campañas de crecimiento (grow) ─────────
  const campaign1 = await prisma.campaign.create({
    data: {
      slug: 'agua-limil-para-yura',
      title: 'Agua potable para 40 familias en Yura',
      summary:
        'Instalemos un sistema de filtros comunitarios para llevar agua segura a un asentamiento sin red.',
      story:
        'En el asentamiento Las Lomas de Yura, 40 familias caminan más de una hora para conseguir agua. Con tu aporte compraremos filtros, tanques y tuberías para un punto de agua comunitario, y capacitaremos a las familias para su mantenimiento. Cada sol nos acerca a un futuro con agua limpia.',
      category: CampaignCategory.COMMUNITY,
      status: CampaignStatus.ACTIVE,
      coverPhoto:
        'https://images.unsplash.com/photo-1538300342682-cf57afb97285?auto=format&fit=crop&w=800&q=70',
      goalAmount: 8000,
      raisedAmount: 3200,
      backersCount: 18,
      currency: 'PEN',
      volunteerSkills: [VolunteerSkill.LOGISTICS, VolunteerSkill.CONSTRUCTION],
      district: 'Yura',
      lat: -16.254,
      lng: -71.674,
      featured: true,
      deadline: daysFromNow(45),
      organizerId: manager.id,
      updates: {
        create: [
          {
            title: '¡Llegamos al 40% de la meta!',
            body: 'Gracias a 18 donantes ya compramos los primeros 10 filtros. Seguimos sumando.',
            createdAt: hoursAgo(30),
          },
        ],
      },
    },
  });

  const campaign2 = await prisma.campaign.create({
    data: {
      slug: 'biblioteca-movil-rural',
      title: 'Biblioteca móvil para colegios rurales',
      summary:
        'Un triciclo con 500 libros que rotará entre 6 escuelas de la campiña arequipeña.',
      story:
        'Queremos acercar la lectura a niñas y niños que no tienen biblioteca cerca. El proyecto financia un triciclo acondicionado, 500 libros y talleres de animación lectora durante todo el año escolar.',
      category: CampaignCategory.EDUCATION,
      status: CampaignStatus.ACTIVE,
      coverPhoto:
        'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=800&q=70',
      goalAmount: 5000,
      raisedAmount: 1450,
      backersCount: 9,
      currency: 'PEN',
      district: 'Cayma',
      featured: false,
      deadline: daysFromNow(60),
      organizerId: manager.id,
    },
  });

  const campaign3 = await prisma.campaign.create({
    data: {
      slug: 'taller-costura-mujeres',
      title: 'Taller de costura para mujeres emprendedoras',
      summary:
        'Equipemos un taller con 6 máquinas para que 12 mujeres generen su propio ingreso.',
      story:
        'Un grupo de mujeres de Paucarpata quiere arrancar un taller de confección. Con tu apoyo compramos máquinas industriales, insumos y financiamos un curso de patronaje. Es empleo digno y autonomía económica.',
      category: CampaignCategory.ENTREPRENEURSHIP,
      status: CampaignStatus.FUNDED,
      coverPhoto:
        'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=800&q=70',
      goalAmount: 6000,
      raisedAmount: 6300,
      backersCount: 41,
      currency: 'PEN',
      district: 'Paucarpata',
      featured: true,
      organizerId: manager.id,
      updates: {
        create: [
          {
            title: '¡Meta alcanzada! 🎉',
            body: 'Gracias a 41 donantes superamos la meta. Compraremos las máquinas esta semana.',
            createdAt: hoursAgo(12),
          },
        ],
      },
    },
  });

  // Aportes a campañas (alimentan el ranking de donantes recientes).
  await prisma.donation.create({
    data: {
      type: DonationType.MONEY,
      status: DonationStatus.RECEIVED,
      amount: 200,
      currency: 'PEN',
      description: 'Aporte para filtros de agua',
      donorId: donor.id,
      campaignId: campaign1.id,
      payment: {
        create: {
          method: PaymentMethod.YAPE,
          status: PaymentStatus.PAID,
          amount: 200,
          reference: 'YAPE-CAMP-001',
          paidAt: hoursAgo(28),
        },
      },
      events: {
        create: {
          status: DonationStatus.RECEIVED,
          title: 'Aporte a campaña recibido',
          note: 'Gracias por impulsar esta campaña.',
          createdAt: hoursAgo(28),
        },
      },
    },
  });
  await prisma.donation.create({
    data: {
      type: DonationType.MONEY,
      status: DonationStatus.RECEIVED,
      amount: 150,
      currency: 'PEN',
      anonymous: true,
      campaignId: campaign2.id,
      donorName: 'Anónimo',
      payment: {
        create: {
          method: PaymentMethod.PLIN,
          status: PaymentStatus.PAID,
          amount: 150,
          reference: 'PLIN-CAMP-002',
          paidAt: hoursAgo(10),
        },
      },
      events: {
        create: {
          status: DonationStatus.RECEIVED,
          title: 'Aporte a campaña recibido',
          note: 'Gracias por impulsar esta campaña.',
          createdAt: hoursAgo(10),
        },
      },
    },
  });
  console.log('  ✓ 3 campañas de crecimiento con avances y aportes');

  // Claves normalizadas de inventario y metas (agrupación y progreso automático).
  const keys = await backfillKeys(prisma);
  console.log(
    `  ✓ claves normalizadas: ${keys.itemsFixed} ítems, ${keys.needsFixed} necesidades`,
  );

  console.log('✅ Seed completado.');
  console.log('   Usuarios demo (password: nosxotros123):');
  console.log('   - donor@nosxotros.pe (DONOR)');
  console.log('   - volunteer@nosxotros.pe (VOLUNTEER)');
  console.log('   - manager@nosxotros.pe (MANAGER)');
  console.log('   - registrar@nosxotros.pe (REGISTRAR)');
  console.log('   - admin@nosxotros.pe (ADMIN)');
  void startup;
  void campaign3;
  void admin;
  void shift2;
  void shift3;
  void c1Items;
  void c2Items;
}

main()
  .catch((e) => {
    console.error('❌ Seed falló:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
