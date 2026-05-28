import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createSignedOAuthState,
  verifySignedOAuthState,
} from './mp-oauth-state';
import { MpSellerService } from './mp-seller.service';

const OAUTH_STATE_TTL_MS = 15 * 60 * 1000;
const MP_TOKEN_URL = 'https://api.mercadopago.com/oauth/token';
const DEFAULT_MP_AUTH_URL = 'https://auth.mercadopago.com.br/authorization';

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

    return {
      redirectUri,
      appIdSuffix: appId ? appId.slice(-4) : null,
      authUrl: this.getAuthorizationBaseUrl(),
      checks,
    };
  }

  async buildAuthorizeUrl(): Promise<string> {
    const admin = await this.seller.getAdminUser();
    if (!admin) throw new BadRequestException('Administrador não encontrado');

    const appId = this.validateAppId();
    const redirectUri = this.validateRedirectUri();
    const stateSecret = this.getStateSecret();

    const state = createSignedOAuthState(
      admin.id,
      stateSecret,
      OAUTH_STATE_TTL_MS,
    );

    const params = new URLSearchParams({
      client_id: appId,
      response_type: 'code',
      platform_id: 'mp',
      redirect_uri: redirectUri,
      state,
    });

    const url = `${this.getAuthorizationBaseUrl()}?${params}`;
    this.logger.log(
      `MP OAuth authorize → app=…${appId.slice(-4)} redirect_uri=${redirectUri}`,
    );
    return url;
  }

  async handleCallback(code: string, state: string): Promise<void> {
    const stateSecret = this.getStateSecret();
    let adminId: string;
    try {
      adminId = verifySignedOAuthState(state, stateSecret).adminId;
    } catch {
      throw new BadRequestException('Sessão OAuth expirada. Tente conectar novamente.');
    }

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
      access_token: string;
      refresh_token: string;
      user_id: number;
      expires_in: number;
    };

    await this.seller.saveSellerTokens({
      mpUserId: String(data.user_id),
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    });

    this.logger.log(`Mercado Pago conectado (admin=${adminId}, mp_user=${data.user_id})`);
  }

  getFrontendRedirectUrl(success: boolean): string {
    const base =
      this.config.get<string>('APP_BASE_URL')?.replace(/\/$/, '') ??
      'http://localhost:3000';
    return `${base}/admin/configuracoes?mp=${success ? 'connected' : 'error'}`;
  }

  private getAuthorizationBaseUrl(): string {
    const configured = this.config.get<string>('MERCADOPAGO_OAUTH_AUTH_URL')?.trim();
    return (configured || DEFAULT_MP_AUTH_URL).replace(/\/$/, '');
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
    const secret = this.config.get<string>('JWT_SECRET')?.trim();
    if (!secret || secret.length < 32) {
      throw new BadRequestException('JWT_SECRET ausente ou curto demais para OAuth state.');
    }
    return secret;
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
