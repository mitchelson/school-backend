import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Owner = operador da plataforma (taxa de split). Ajuste firebaseUid após criar no Firebase.
  await prisma.user.upsert({
    where: { email: 'owner@ct095.com' },
    update: {},
    create: {
      firebaseUid: 'firebase-owner-uid-placeholder',
      fullName: 'Plataforma CT095',
      email: 'owner@ct095.com',
      phone: '11999999998',
      role: 'owner',
      status: 'active',
    },
  });

  // Admin = dono da escola (Mercado Pago, planos, aulas)
  await prisma.user.upsert({
    where: { email: 'admin@ct095.com' },
    update: {},
    create: {
      firebaseUid: 'firebase-admin-uid-placeholder',
      fullName: 'Administrador',
      email: 'admin@ct095.com',
      phone: '11999999999',
      role: 'admin',
      status: 'active',
    },
  });

  await prisma.platformSetting.upsert({
    where: { key: 'platform_fee_percent' },
    update: {},
    create: { key: 'platform_fee_percent', value: '7' },
  });

  await prisma.platformSetting.upsert({
    where: { key: 'credit_unit_price_cents' },
    update: {},
    create: { key: 'credit_unit_price_cents', value: '3000' },
  });

  // Plans
  const plans = [
    { name: '1x por semana', priceInCents: 12000, weeklyLimit: 1 },
    { name: '2x por semana', priceInCents: 20000, weeklyLimit: 2 },
    { name: '3x por semana', priceInCents: 27000, weeklyLimit: 3 },
    { name: 'Ilimitado', priceInCents: 35000, weeklyLimit: 0 },
  ];

  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { id: plan.name.toLowerCase().replace(/\s/g, '-') },
      update: {},
      create: {
        id: plan.name.toLowerCase().replace(/\s/g, '-'),
        ...plan,
        active: true,
      },
    });
  }

  console.log('✅ Seed completed: owner + admin + platform fee + 4 plans');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
