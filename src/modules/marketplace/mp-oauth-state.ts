import { createHmac, timingSafeEqual } from 'node:crypto';

const SEP = '.';

export function createSignedOAuthState(
  adminId: string,
  secret: string,
  ttlMs: number,
): string {
  const expires = Date.now() + ttlMs;
  const payload = `${adminId}${SEP}${expires}`;
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}${SEP}${sig}`;
}

export function verifySignedOAuthState(
  state: string,
  secret: string,
): { adminId: string } {
  const parts = state.split(SEP);
  if (parts.length !== 3) {
    throw new Error('state inválido');
  }
  const [adminId, expiresRaw, sig] = parts;
  const expires = Number(expiresRaw);
  if (!adminId || !Number.isFinite(expires) || !sig) {
    throw new Error('state inválido');
  }
  if (expires < Date.now()) {
    throw new Error('state expirado');
  }

  const payload = `${adminId}${SEP}${expires}`;
  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error('state inválido');
  }

  return { adminId };
}
