process.env.NODE_ENV = 'test';
process.env.MP_DEV_SIMULATE = 'true';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://school:school@localhost:5432/school_db?schema=public';
process.env.PII_ENCRYPTION_KEY = process.env.PII_ENCRYPTION_KEY ?? 'test-pii-encryption-key-32chars!!';
process.env.CRON_SECRET = process.env.CRON_SECRET ?? 'test-cron-secret-32-characters-min';
process.env.FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID ?? 'test-project';
process.env.FIREBASE_CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL ?? 'test@test.iam.gserviceaccount.com';
process.env.FIREBASE_PRIVATE_KEY = process.env.FIREBASE_PRIVATE_KEY ?? 'test-key';
