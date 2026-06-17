export const MP_OAUTH_CALLBACK_CODES = {
  OAUTH_DENIED: 'oauth_denied',
  MISSING_PARAMS: 'missing_params',
  STATE_EXPIRED: 'state_expired',
  REDIRECT_URI: 'redirect_uri',
  CREDENTIALS: 'credentials',
  UNKNOWN: 'unknown',
} as const;

export type MpOAuthCallbackCode =
  (typeof MP_OAUTH_CALLBACK_CODES)[keyof typeof MP_OAUTH_CALLBACK_CODES];

export function mapOAuthErrorToCode(err: unknown): MpOAuthCallbackCode {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
        ? err
        : '';

  if (/redirect_uri does not match/i.test(message)) {
    return MP_OAUTH_CALLBACK_CODES.REDIRECT_URI;
  }
  if (/Unauthorized use of live credentials/i.test(message)) {
    return MP_OAUTH_CALLBACK_CODES.CREDENTIALS;
  }
  if (/state expirado|Sessão OAuth expirada/i.test(message)) {
    return MP_OAUTH_CALLBACK_CODES.STATE_EXPIRED;
  }
  if (/Parâmetros ausentes/i.test(message)) {
    return MP_OAUTH_CALLBACK_CODES.MISSING_PARAMS;
  }
  return MP_OAUTH_CALLBACK_CODES.UNKNOWN;
}
