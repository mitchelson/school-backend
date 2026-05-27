import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Admin user (firebaseUid will be set after creating user in Firebase console)
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

  console.log('✅ Seed completed: admin user + 4 plans');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
