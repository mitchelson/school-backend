import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { FirebaseService } from '../src/infrastructure/firebase/firebase.service';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { createE2eApp, E2E_TEST_EMAIL, E2E_TEST_UID } from './helpers/e2e-app';

async function initApp(module: TestingModule): Promise<INestApplication> {
  const app = module.createNestApplication({ rawBody: true });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();
  return app;
}

describe('Health (e2e)', () => {
  it('GET /api/v1/health returns status', async () => {
    const { app } = await createE2eApp();
    const response = await request(app.getHttpServer()).get('/api/v1/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBeDefined();
    await app.close();
  });

  it('GET /api/v1/health/live returns ok', async () => {
    const { app } = await createE2eApp();
    const response = await request(app.getHttpServer()).get('/api/v1/health/live');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    await app.close();
  });

  it('GET /api/v1/health/ready returns db status', async () => {
    const { app } = await createE2eApp();
    const response = await request(app.getHttpServer()).get('/api/v1/health/ready');
    expect([200, 503]).toContain(response.status);
    expect(response.body.db).toBeDefined();
    await app.close();
  });
});

describe('Auth (e2e)', () => {
  it('POST /auth/session creates aluno with valid Firebase token', async () => {
    const { app } = await createE2eApp();
    const prisma = app.get(PrismaService);

    await prisma.user.deleteMany({ where: { email: E2E_TEST_EMAIL } });

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/session')
      .set('Authorization', 'Bearer valid-test-token')
      .send({});

    expect([200, 201]).toContain(response.status);
    expect(response.body.user.email).toBe(E2E_TEST_EMAIL);
    expect(response.body.user.role).toBe('aluno');
    expect(response.body.needsProfileCompletion).toBe(true);

    await prisma.user.deleteMany({ where: { firebaseUid: E2E_TEST_UID } });
    await app.close();
  });

  it('rejects session without token', async () => {
    const { app } = await createE2eApp();
    const response = await request(app.getHttpServer()).post('/api/v1/auth/session').send({});
    expect(response.status).toBe(401);
    await app.close();
  });

  it('links pending admin-created student on session', async () => {
    const email = 'pending-student@ct095.test';
    const firebase = {
      verifyToken: jest.fn(async () => ({
        uid: 'real-firebase-uid-pending',
        email,
        email_verified: true,
        name: 'Convidado Real',
      })),
    };

    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(FirebaseService)
      .useValue(firebase)
      .compile();

    const app = await initApp(module);
    const prisma = app.get(PrismaService);

    await prisma.user.deleteMany({ where: { email } });
    await prisma.user.create({
      data: {
        firebaseUid: 'pending:11111111-1111-1111-1111-111111111111',
        fullName: 'Convidado',
        email,
        phone: '11988887777',
        role: 'aluno',
        status: 'active',
      },
    });

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/session')
      .set('Authorization', 'Bearer valid')
      .send({});

    expect([200, 201]).toContain(response.status);
    expect(response.body.needsProfileCompletion).toBe(false);

    const linked = await prisma.user.findUnique({ where: { email } });
    expect(linked?.firebaseUid).toBe('real-firebase-uid-pending');

    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });
});
