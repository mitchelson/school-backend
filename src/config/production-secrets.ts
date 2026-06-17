/**
 * Valida secrets obrigatórios em produção. Falha rápido no bootstrap.
 */
export function assertProductionSecrets(): void {
  if (process.env.NODE_ENV !== 'production') return;

  const missing: string[] = [];

  const piiKey = process.env.PII_ENCRYPTION_KEY?.trim() ?? '';
  if (piiKey.length < 32) {
    missing.push('PII_ENCRYPTION_KEY (mín. 32 caracteres)');
  }

  const webhookSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET?.trim() ?? '';
  if (!webhookSecret) {
    missing.push('MERCADOPAGO_WEBHOOK_SECRET');
  }

  if (process.env.MP_DEV_SIMULATE === 'true') {
    missing.push('MP_DEV_SIMULATE deve ser false em produção');
  }

  if (missing.length > 0) {
    throw new Error(
      `Configuração de produção incompleta:\n- ${missing.join('\n- ')}`,
    );
  }
}
