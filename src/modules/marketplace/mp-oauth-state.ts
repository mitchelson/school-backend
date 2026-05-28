import { createHmac, timingSafeEqual } from 'node:crypto';

type OAuthStatePayload = {
  adminId: string;
  exp: number;
  pkce?: string;
};

function signPayload(payloadB64: string, secret: string): string {
  return createHmac('sha256', secret).update(payloadB64).digest('base64url');
}

export function createSignedOAuthState(
  adminId: string,
  secret: string,
  ttlMs: number,
  pkceVerifier?: string,
): string {
  const payload: OAuthStatePayload = {
    adminId,
    exp: Date.now() + ttlMs,
    ...(pkceVerifier ? { pkce: pkceVerifier } : {}),
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = signPayload(payloadB64, secret);
  return `${payloadB64}.${sig}`;
}

export function verifySignedOAuthState(
  state: string,
  secret: string,
): { adminId: string; pkceVerifier?: string } {
  const dot = state.lastIndexOf('.');
  if (dot <= 0) throw new Error('state inválido');

  const payloadB64 = state.slice(0, dot);
  const sig = state.slice(dot + 1);
  const expected = signPayload(payloadB64, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error('state inválido');
  }

  let payload: OAuthStatePayload;
  try {
    payload = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf8'),
    ) as OAuthStatePayload;
  } catch {
    throw new Error('state inválido');
  }

  if (!payload.adminId || !Number.isFinite(payload.exp)) {
    throw new Error('state inválido');
  }
  if (payload.exp < Date.now()) {
    throw new Error('state expirado');
  }

  return {
    adminId: payload.adminId,
    pkceVerifier: payload.pkce,
  };
}

/** Legacy state from older deploys (plain adminId.exp.sig). */
export function verifyLegacySignedOAuthState(
  state: string,
  secret: string,
): { adminId: string } | null {
  const parts = state.split('.');
  if (parts.length !== 3) return null;
  const [adminId, expiresRaw, sig] = parts;
  const expires = Number(expiresRaw);
  if (!adminId || !Number.isFinite(expires) || !sig) return null;
  if (expires < Date.now()) throw new Error('state expirado');

  const payload = `${adminId}.${expires}`;
  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  return { adminId };
}
