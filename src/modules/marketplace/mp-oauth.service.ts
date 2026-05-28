import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { MpSellerService } from './mp-seller.service';

const OAUTH_STATE_TTL_MS = 15 * 60 * 1000;

@Injectable()
export class MpOAuthService {
  private readonly logger = new Logger(MpOAuthService.name);
  private readonly stateStore = new Map<string, { adminId: string; expires: number }>();

  constructor(
    private config: ConfigService,
    private seller: MpSellerService,
  ) {}

  async buildAuthorizeUrl(): Promise<string> {
    const admin = await this.seller.getAdminUser();
    if (!admin) throw new BadRequestException('Administrador não encontrado');

    const appId = this.config.get<string>('MERCADOPAGO_APP_ID')?.trim();
    const redirectUri = this.config.get<string>('MERCADOPAGO_OAUTH_REDIRECT_URI')?.trim();

    if (!appId || !redirectUri) {
      throw new BadRequestException(
        'Mercado Pago marketplace não configurado no servidor (APP_ID / REDIRECT_URI).',
      );
    }

    const state = randomUUID();
    this.stateStore.set(state, {
      adminId: admin.id,
      expires: Date.now() + OAUTH_STATE_TTL_MS,
    });

    const params = new URLSearchParams({
      client_id: appId,
      response_type: 'code',
      platform_id: 'mp',
      redirect_uri: redirectUri,
      state,
    });

    return `https://auth.mercadopago.com.br/authorization?${params}`;
  }

  async handleCallback(code: string, state: string): Promise<void> {
    const entry = this.stateStore.get(state);
    this.stateStore.delete(state);

    if (!entry || entry.expires < Date.now()) {
      throw new BadRequestException('Sessão OAuth expirada. Tente conectar novamente.');
    }

    const secret = this.config.get<string>('MERCADOPAGO_CLIENT_SECRET')?.trim();
    const appId = this.config.get<string>('MERCADOPAGO_APP_ID')?.trim();
    const redirectUri = this.config.get<string>('MERCADOPAGO_OAUTH_REDIRECT_URI')?.trim();

    if (!secret || !appId || !redirectUri) {
      throw new BadRequestException('Credenciais OAuth Mercado Pago ausentes.');
    }

    const response = await fetch('https://api.mercadopago.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: appId,
        client_secret: secret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      this.logger.warn(`MP OAuth failed: ${response.status} ${text.slice(0, 200)}`);
      throw new BadRequestException('Falha ao autorizar conta Mercado Pago.');
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

    this.logger.log(`Mercado Pago conectado (admin=${entry.adminId}, mp_user=${data.user_id})`);
  }

  getFrontendRedirectUrl(success: boolean): string {
    const base =
      this.config.get<string>('APP_BASE_URL')?.replace(/\/$/, '') ??
      'http://localhost:3000';
    return `${base}/admin/configuracoes?mp=${success ? 'connected' : 'error'}`;
  }
}
