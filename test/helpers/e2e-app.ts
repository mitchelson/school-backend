import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { FirebaseService } from '../../src/infrastructure/firebase/firebase.service';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';

export const E2E_TEST_UID = 'e2e-firebase-uid';
export const E2E_TEST_EMAIL = 'e2e-auth@ct095.test';

export function createFirebaseMock() {
  return {
    verifyToken: jest.fn(async (token: string) => {
      if (token === 'invalid-token') {
        throw new Error('invalid token');
      }
      return {
        uid: E2E_TEST_UID,
        email: E2E_TEST_EMAIL,
        email_verified: true,
        name: 'E2E User',
      };
    }),
  };
}

export async function createE2eApp(): Promise<{
  app: INestApplication;
  firebase: ReturnType<typeof createFirebaseMock>;
}> {
  const firebase = createFirebaseMock();

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(FirebaseService)
    .useValue(firebase)
    .compile();

  const app = moduleFixture.createNestApplication({ rawBody: true });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  await app.init();

  return { app, firebase };
}
