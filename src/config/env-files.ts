/**
 * Ordem de precedência do @nestjs/config (último arquivo da lista vence).
 * Em desenvolvimento não carrega .env.production — evita misturar credenciais de VPS.
 */
export function getEnvFilePaths(): string[] {
  const nodeEnv = process.env.NODE_ENV ?? 'development';

  if (nodeEnv === 'production') {
    return [
      '.env.production.local',
      '.env.production',
      '.env.local',
      '.env',
    ];
  }

  if (nodeEnv === 'test') {
    return ['.env.test.local', '.env.test', '.env'];
  }

  return [
    '.env.development.local',
    '.env.development',
    '.env.local',
    '.env',
  ];
}
