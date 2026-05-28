import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { generatePkcePair } from './mp-oauth-pkce';
import {
  createSignedOAuthState,
  verifyLegacySignedOAuthState,
  verifySignedOAuthState,
} from './mp-oauth-state';
import { MpSellerService } from './mp-seller.service';

const OAUTH_STATE_TTL_MS = 15 * 60 * 1000;
const MP_TOKEN_URL = 'https://api.mercadopago.com/oauth/token';
const DEFAULT_MP_TOKEN_TTL_SEC = 15552000;
/** Brasil: evita tela global de seleção de país; leva direto ao login/autorização do app. */
const DEFAULT_MP_AUTH_URL = 'https://auth.mercadopago.com.br/authorization';
/** Global (LATAM): use só se a aplicação MP não for MLB — costuma exibir seletor de país antes. */
const GLOBAL_MP_AUTH_URL = 'https://auth.mercadopago.com/authorization';

@Injectable()
export class MpOAuthService {
  private readonly logger = new Logger(MpOAuthService.name);

  constructor(
    private config: ConfigService,
    private seller: MpSellerService,
  ) {}

  getRedirectUri(): string {
    return this.normalizeRedirectUri(
      this.config.get<string>('MERCADOPAGO_OAUTH_REDIRECT_URI'),
    );
  }

  getOAuthSetupHint(): {
    redirectUri: string;
    appIdSuffix: string | null;
    authUrl: string;
    pkceEnabled: boolean;
    platformId: string | null;
    checks: { ok: boolean; message: string }[];
  } {
    const appId = this.config.get<string>('MERCADOPAGO_APP_ID')?.trim() ?? '';
    const secret = this.config.get<string>('MERCADOPAGO_CLIENT_SECRET')?.trim() ?? '';
    const redirectUri = this.getRedirectUri();
    const checks: { ok: boolean; message: string }[] = [];

    if (!appId) {
      checks.push({ ok: false, message: 'MERCADOPAGO_APP_ID ausente' });
    } else if (this.looksLikeAccessToken(appId)) {
      checks.push({
        ok: false,
        message:
          'MERCADOPAGO_APP_ID parece Access Token. No painel MP use o número da aplicação (Client ID).',
      });
    } else {
      checks.push({ ok: true, message: 'MERCADOPAGO_APP_ID configurado' });
    }

    if (!secret) {
      checks.push({ ok: false, message: 'MERCADOPAGO_CLIENT_SECRET ausente' });
    } else if (this.looksLikeAccessToken(secret)) {
      checks.push({
        ok: false,
        message:
          'MERCADOPAGO_CLIENT_SECRET parece Access Token. Use o Client Secret da aplicação.',
      });
    } else {
      checks.push({ ok: true, message: 'MERCADOPAGO_CLIENT_SECRET configurado' });
    }

    try {
      this.getStateSecret();
      checks.push({ ok: true, message: 'Secret para OAuth state configurado' });
    } catch {
      checks.push({
        ok: false,
        message:
          'Defina MERCADOPAGO_OAUTH_STATE_SECRET (≥32 chars) ou JWT_SECRET / CRON_SECRET / PII_ENCRYPTION_KEY',
      });
    }

    if (!redirectUri) {
      checks.push({ ok: false, message: 'MERCADOPAGO_OAUTH_REDIRECT_URI ausente' });
    } else if (!redirectUri.startsWith('https://')) {
      checks.push({
        ok: false,
        message: 'Redirect URI deve usar HTTPS em produção',
      });
    } else {
      checks.push({
        ok: true,
        message:
          'Redirect URI definido — deve ser idêntico em “URLs de redirecionamento” no painel MP',
      });
    }

    const authUrl = this.getAuthorizationBaseUrl();
    if (authUrl.includes('mercadopago.com.br')) {
      checks.push({
        ok: true,
        message:
          'Auth URL Brasil (.com.br) — fluxo padrão: login MP → autorizar aplicativo (sem seletor de país).',
      });
    } else if (authUrl.includes('auth.mercadopago.com')) {
      checks.push({
        ok: true,
        message:
          'Auth URL global — pode exibir seleção de país antes do login. Para CT095 (Brasil), prefira auth.mercadopago.com.br.',
      });
    }

    const pkceEnabled = this.isPkceEnabled();
    if (pkceEnabled) {
      checks.push({
        ok: true,
        message:
          'PKCE ativo (MERCADOPAGO_OAUTH_PKCE). No painel MP, “authorization code + PKCE” deve estar habilitado.',
      });
    } else {
      checks.push({
        ok: true,
        message:
          'PKCE desligado. Se o MP retornar 400 na autorização, defina MERCADOPAGO_OAUTH_PKCE=true.',
      });
    }

    return {
      redirectUri,
      appIdSuffix: appId ? appId.slice(-4) : null,
      authUrl: this.getAuthorizationBaseUrl(),
      pkceEnabled,
      platformId: this.getPlatformId(),
      checks,
    };
  }

  async buildAuthorizeUrl(adminUserId: string): Promise<string> {
    await this.seller.assertAdminUser(adminUserId);

    const appId = this.validateAppId();
    const redirectUri = this.validateRedirectUri();
    const stateSecret = this.getStateSecret();
    const usePkce = this.isPkceEnabled();
    const pkce = usePkce ? generatePkcePair() : null;

    const state = createSignedOAuthState(
      adminUserId,
      stateSecret,
      OAUTH_STATE_TTL_MS,
      pkce?.codeVerifier,
    );

    const params = new URLSearchParams({
      client_id: appId,
      response_type: 'code',
      redirect_uri: redirectUri,
      state,
    });

    const platformId = this.getPlatformId();
    if (platformId) {
      params.set('platform_id', platformId);
    }

    const siteId = this.getOAuthSiteId();
    if (siteId) {
      params.set('site_id', siteId);
    }

    if (pkce) {
      params.set('code_challenge', pkce.codeChallenge);
      params.set('code_challenge_method', 'S256');
    }

    const url = `${this.getAuthorizationBaseUrl()}?${params}`;
    this.logger.log(
      `MP OAuth authorize → app=…${appId.slice(-4)} redirect_uri=${redirectUri} pkce=${usePkce}`,
    );
    return url;
  }

  async handleCallback(code: string, state: string): Promise<void> {
    const stateSecret = this.getStateSecret();
    const verified = this.verifyOAuthState(state, stateSecret);
    const adminId = verified.adminId;

    const secret = this.validateClientSecret();
    const appId = this.validateAppId();
    const redirectUri = this.validateRedirectUri();

    const body = new URLSearchParams({
      client_id: appId,
      client_secret: secret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    });

    if (verified.pkceVerifier) {
      body.set('code_verifier', verified.pkceVerifier);
    }

    const response = await fetch(MP_TOKEN_URL, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const text = await response.text();
      this.logger.warn(`MP OAuth token failed: ${response.status} ${text.slice(0, 400)}`);
      throw new BadRequestException(this.mapTokenError(text));
    }

    const data = (await response.json()) as {
      access_token?: string;
      refresh_token?: string;
      user_id?: number;
      expires_in?: number;
    };

    const accessToken = data.access_token?.trim();
    if (!accessToken) {
      throw new BadRequestException(
        'Mercado Pago não retornou access_token. Tente conectar novamente.',
      );
    }

    const refreshToken = data.refresh_token?.trim() ?? '';
    if (!refreshToken) {
      this.logger.warn(
        `MP OAuth sem refresh_token (admin=${adminId}) — tokens de acesso serão salvos.`,
      );
    }

    await this.seller.saveSellerTokens({
      adminUserId: adminId,
      mpUserId: String(data.user_id ?? ''),
      accessToken,
      refreshToken,
      expiresIn: data.expires_in ?? DEFAULT_MP_TOKEN_TTL_SEC,
    });

    this.logger.log(`Mercado Pago conectado (admin=${adminId}, mp_user=${data.user_id})`);
  }

  getFrontendRedirectUrl(success: boolean): string {
    const base =
      this.config.get<string>('APP_BASE_URL')?.replace(/\/$/, '') ??
      'http://localhost:3000';
    return `${base}/admin/configuracoes?mp=${success ? 'connected' : 'error'}`;
  }

  private verifyOAuthState(
    state: string,
    secret: string,
  ): { adminId: string; pkceVerifier?: string } {
    try {
      return verifySignedOAuthState(state, secret);
    } catch (err) {
      if (err instanceof Error && err.message === 'state expirado') {
        throw new BadRequestException('Sessão OAuth expirada. Tente conectar novamente.');
      }
      const legacy = verifyLegacySignedOAuthState(state, secret);
      if (legacy) {
        return legacy;
      }
      throw new BadRequestException('Sessão OAuth expirada. Tente conectar novamente.');
    }
  }

  private isPkceEnabled(): boolean {
    const raw = this.config.get<string>('MERCADOPAGO_OAUTH_PKCE');
    if (raw === undefined || raw === '') return true;
    return raw.trim().toLowerCase() === 'true';
  }

  private getPlatformId(): string | null {
    const raw = this.config.get<string>('MERCADOPAGO_OAUTH_PLATFORM_ID');
    if (raw === undefined) return 'mp';
    const trimmed = raw.trim();
    if (!trimmed || trimmed.toLowerCase() === 'none') return null;
    return trimmed;
  }

  private getOAuthSiteId(): string | null {
    const raw =
      this.config.get<string>('MERCADOPAGO_OAUTH_SITE_ID') ??
      this.config.get<string>('MERCADOPAGO_SITE_ID');
    if (raw === undefined || raw === '') {
      return 'MLB';
    }
    const trimmed = raw.trim();
    if (!trimmed || trimmed.toLowerCase() === 'none') {
      return null;
    }
    return trimmed;
  }

  private getAuthorizationBaseUrl(): string {
    const configured = this.config.get<string>('MERCADOPAGO_OAUTH_AUTH_URL')?.trim();
    if (configured) {
      return configured.replace(/\/$/, '');
    }
    const country = this.config.get<string>('MERCADOPAGO_COUNTRY')?.trim().toUpperCase();
    if (country && country !== 'BR' && country !== 'MLB') {
      return GLOBAL_MP_AUTH_URL;
    }
    return DEFAULT_MP_AUTH_URL;
  }

  private normalizeRedirectUri(raw?: string): string {
    const trimmed = raw?.trim();
    if (!trimmed) return '';
    return trimmed.replace(/\/$/, '');
  }

  private validateRedirectUri(): string {
    const redirectUri = this.getRedirectUri();
    if (!redirectUri) {
      throw new BadRequestException(
        'Mercado Pago marketplace não configurado no servidor (MERCADOPAGO_OAUTH_REDIRECT_URI).',
      );
    }
    return redirectUri;
  }

  private validateAppId(): string {
    const appId = this.config.get<string>('MERCADOPAGO_APP_ID')?.trim() ?? '';
    if (!appId) {
      throw new BadRequestException(
        'Mercado Pago marketplace não configurado no servidor (MERCADOPAGO_APP_ID).',
      );
    }
    if (this.looksLikeAccessToken(appId)) {
      throw new BadRequestException(
        'MERCADOPAGO_APP_ID inválido: parece Access Token. Use o Client ID (número da aplicação) do painel Mercado Pago.',
      );
    }
    return appId;
  }

  private validateClientSecret(): string {
    const secret = this.config.get<string>('MERCADOPAGO_CLIENT_SECRET')?.trim() ?? '';
    if (!secret) {
      throw new BadRequestException('Credenciais OAuth Mercado Pago ausentes (CLIENT_SECRET).');
    }
    if (this.looksLikeAccessToken(secret)) {
      throw new BadRequestException(
        'MERCADOPAGO_CLIENT_SECRET inválido: parece Access Token. Use o Client Secret da aplicação.',
      );
    }
    return secret;
  }

  private getStateSecret(): string {
    const candidates = [
      'MERCADOPAGO_OAUTH_STATE_SECRET',
      'JWT_SECRET',
      'CRON_SECRET',
      'PII_ENCRYPTION_KEY',
    ] as const;

    for (const key of candidates) {
      const value = this.config.get<string>(key)?.trim();
      if (value && value.length >= 32) {
        return value;
      }
    }

    throw new BadRequestException(
      'Configure MERCADOPAGO_OAUTH_STATE_SECRET (mín. 32 caracteres) ou JWT_SECRET / CRON_SECRET / PII_ENCRYPTION_KEY com o mesmo tamanho.',
    );
  }

  private looksLikeAccessToken(value: string): boolean {
    return /^(APP_USR-|TEST-|APP_USR_)/i.test(value);
  }

  private mapTokenError(body: string): string {
    if (/redirect_uri does not match/i.test(body)) {
      return (
        'Redirect URI não confere com o cadastrado no Mercado Pago. ' +
        'Copie exatamente MERCADOPAGO_OAUTH_REDIRECT_URI para “URLs de redirecionamento” da aplicação.'
      );
    }
    if (/Unauthorized use of live credentials/i.test(body)) {
      return 'Credenciais de produção não autorizadas para este ambiente. Use app/credenciais de teste ou homologue a aplicação.';
    }
    return 'Falha ao autorizar conta Mercado Pago.';
  }
}
