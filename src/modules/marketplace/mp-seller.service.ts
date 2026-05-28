import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type { User } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { TokenCryptoService } from '../../infrastructure/crypto/token-crypto.service';
import { MpAccountProfileService } from './mp-account-profile.service';

/** MP OAuth: access token ~6 meses; fallback se expires_in vier ausente. */
const DEFAULT_MP_TOKEN_TTL_SEC = 15552000;
const MP_TOKEN_URL = 'https://api.mercadopago.com/oauth/token';

export type MpConnectedAccount = {
  mpUserId: string;
  email: string | null;
  nickname: string | null;
  accountName: string | null;
  siteId: string | null;
  displayLabel: string;
};

export type MpConnectionStatus = {
  connected: boolean;
  mpUserId: string | null;
  connectedAt: string | null;
  account: MpConnectedAccount | null;
  connectionIssue: string | null;
};

@Injectable()
export class MpSellerService {
  private readonly logger = new Logger(MpSellerService.name);

  constructor(
    private prisma: PrismaService,
    private tokenCrypto: TokenCryptoService,
    private mpProfile: MpAccountProfileService,
    private config: ConfigService,
  ) {}

  /** Admin padrão da escola (legado). */
  async getAdminUser() {
    return this.prisma.user.findFirst({
      where: { role: 'admin', status: 'active' },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Admin que tem (ou teve) Mercado Pago conectado — mais recente primeiro. */
  async getSchoolMpAdmin(): Promise<User | null> {
    const connected = await this.prisma.user.findFirst({
      where: {
        role: 'admin',
        status: 'active',
        OR: [
          { mpRefreshToken: { not: null } },
          { mpAccessToken: { not: null } },
          { mpUserId: { not: null } },
        ],
      },
      orderBy: { mpConnectedAt: 'desc' },
    });
    if (connected) return connected;
    return this.getAdminUser();
  }

  async assertAdminUser(userId: string): Promise<User> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, role: 'admin', status: 'active' },
    });
    if (!user) {
      throw new BadRequestException('Apenas administradores podem conectar o Mercado Pago.');
    }
    return user;
  }

  hasMpLinkage(admin: {
    mpUserId: string | null;
    mpAccessToken: string | null;
    mpRefreshToken: string | null;
  }): boolean {
    return Boolean(admin.mpUserId || admin.mpAccessToken || admin.mpRefreshToken);
  }

  isMpConnected(admin: {
    mpAccessToken: string | null;
    mpRefreshToken: string | null;
    mpTokenExpiresAt: Date | null;
  }): boolean {
    const refresh = this.tokenCrypto.decrypt(admin.mpRefreshToken);
    if (refresh?.trim()) return true;

    const access = this.tokenCrypto.decrypt(admin.mpAccessToken);
    if (!access?.trim()) return false;
    if (!admin.mpTokenExpiresAt) return true;
    return admin.mpTokenExpiresAt.getTime() > Date.now();
  }

  private connectionIssue(admin: User): string | null {
    if (!this.hasMpLinkage(admin)) return null;
    if (this.isMpConnected(admin)) return null;

    const refresh = this.tokenCrypto.decrypt(admin.mpRefreshToken);
    if (!refresh?.trim() && admin.mpRefreshToken?.startsWith('v1:')) {
      return 'credentials_unreadable';
    }
    if (admin.mpTokenExpiresAt && admin.mpTokenExpiresAt < new Date()) {
      return 'token_expired';
    }
    return 'not_connected';
  }

  buildConnectedAccount(admin: {
    mpUserId: string | null;
    mpAccountEmail: string | null;
    mpAccountNickname: string | null;
    mpAccountName: string | null;
    mpAccountSiteId: string | null;
  }): MpConnectedAccount | null {
    if (!admin.mpUserId) return null;

    const email = admin.mpAccountEmail;
    const nickname = admin.mpAccountNickname;
    const accountName = admin.mpAccountName;
    const displayLabel =
      email ??
      nickname ??
      accountName ??
      `Conta Mercado Pago #${admin.mpUserId}`;

    return {
      mpUserId: admin.mpUserId,
      email,
      nickname,
      accountName,
      siteId: admin.mpAccountSiteId,
      displayLabel,
    };
  }

  async getConnectionStatus(): Promise<MpConnectionStatus> {
    try {
      let admin = await this.getSchoolMpAdmin();
      if (!admin) {
        return {
          connected: false,
          mpUserId: null,
          connectedAt: null,
          account: null,
          connectionIssue: null,
        };
      }

      if (this.hasMpLinkage(admin)) {
        admin = await this.refreshTokensIfNeeded(admin);
      }

      const connected = this.isMpConnected(admin);
      if (connected && !admin.mpAccountEmail && !admin.mpAccountNickname) {
        admin = await this.syncAccountProfile(admin);
      }

      return {
        connected,
        mpUserId: admin.mpUserId,
        connectedAt: admin.mpConnectedAt?.toISOString() ?? null,
        account: connected ? this.buildConnectedAccount(admin) : null,
        connectionIssue: connected ? null : this.connectionIssue(admin),
      };
    } catch (err) {
      this.logger.error(`getConnectionStatus falhou: ${err}`);
      return {
        connected: false,
        mpUserId: null,
        connectedAt: null,
        account: null,
        connectionIssue: 'status_error',
      };
    }
  }

  async requireMpConnected(): Promise<void> {
    const admin = await this.getSchoolMpAdmin();
    if (!admin || !this.hasMpLinkage(admin)) {
      throw new BadRequestException(
        'Conecte sua conta Mercado Pago antes de criar planos ou aulas. Acesse Configurações no painel admin.',
      );
    }
    const refreshed = await this.refreshTokensIfNeeded(admin);
    if (!this.isMpConnected(refreshed)) {
      throw new BadRequestException(
        'Conexão Mercado Pago expirada. Reconecte em Configurações.',
      );
    }
  }

  async getSellerAccessToken(): Promise<string> {
    const admin = await this.getSchoolMpAdmin();
    if (!admin) {
      throw new BadRequestException('Administrador não encontrado');
    }
    const refreshed = await this.refreshTokensIfNeeded(admin);
    const token = this.tokenCrypto.decrypt(refreshed.mpAccessToken);
    if (!token?.trim() || !this.isMpConnected(refreshed)) {
      throw new BadRequestException(
        'Conta Mercado Pago da escola não conectada. Conecte em Configurações.',
      );
    }
    return token;
  }

  async saveSellerTokens(data: {
    adminUserId: string;
    mpUserId: string;
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }) {
    await this.assertAdminUser(data.adminUserId);

    const expiresIn = Number(data.expiresIn);
    const ttlSec =
      Number.isFinite(expiresIn) && expiresIn > 0
        ? expiresIn
        : DEFAULT_MP_TOKEN_TTL_SEC;
    const expiresAt = new Date(Date.now() + ttlSec * 1000);

    const profile = await this.mpProfile.fetchFromAccessToken(data.accessToken);

    try {
      await this.prisma.user.update({
        where: { id: data.adminUserId },
        data: {
          mpUserId: profile?.mpUserId ?? data.mpUserId,
          mpAccessToken: this.tokenCrypto.encrypt(data.accessToken),
          mpRefreshToken: this.tokenCrypto.encrypt(data.refreshToken),
          mpTokenExpiresAt: expiresAt,
          mpConnectedAt: new Date(),
          mpAccountEmail: profile?.email ?? null,
          mpAccountNickname: profile?.nickname ?? null,
          mpAccountName: profile?.accountName ?? null,
          mpAccountSiteId: profile?.siteId ?? null,
          mpProfileSyncedAt: profile ? new Date() : null,
        },
      });
    } catch (err) {
      throw this.mapSaveTokensError(err, data.adminUserId);
    }

    if (profile?.email) {
      this.logger.log(
        `Perfil MP salvo (admin=${data.adminUserId}): ${profile.email}`,
      );
    }
  }

  private async refreshTokensIfNeeded(admin: User): Promise<User> {
    const access = this.tokenCrypto.decrypt(admin.mpAccessToken);
    const expiresAt = admin.mpTokenExpiresAt;
    const accessValid =
      Boolean(access?.trim()) &&
      (!expiresAt || expiresAt.getTime() > Date.now() + 60_000);

    if (accessValid) return admin;

    const refresh = this.tokenCrypto.decrypt(admin.mpRefreshToken);
    if (!refresh?.trim()) return admin;

    try {
      const tokens = await this.requestTokenRefresh(refresh);
      await this.saveSellerTokens({
        adminUserId: admin.id,
        mpUserId: admin.mpUserId ?? String(tokens.user_id ?? ''),
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? refresh,
        expiresIn: tokens.expires_in,
      });
      return this.prisma.user.findUniqueOrThrow({ where: { id: admin.id } });
    } catch (err) {
      this.logger.warn(`MP refresh token falhou (admin=${admin.id}): ${err}`);
      return admin;
    }
  }

  private async requestTokenRefresh(refreshToken: string): Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    user_id?: number;
  }> {
    const appId = this.config.get<string>('MERCADOPAGO_APP_ID')?.trim();
    const secret = this.config.get<string>('MERCADOPAGO_CLIENT_SECRET')?.trim();
    if (!appId || !secret) {
      throw new Error('Credenciais MP ausentes para refresh');
    }

    const body = new URLSearchParams({
      client_id: appId,
      client_secret: secret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
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
      throw new Error(`${response.status} ${text.slice(0, 200)}`);
    }

    return (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      user_id?: number;
    };
  }

  private async syncAccountProfile(admin: User): Promise<User> {
    const token = this.tokenCrypto.decrypt(admin.mpAccessToken);
    if (!token?.trim() || !this.isMpConnected(admin)) {
      return admin;
    }

    const profile = await this.mpProfile.fetchFromAccessToken(token);
    if (!profile) {
      return admin;
    }

    try {
      return await this.prisma.user.update({
        where: { id: admin.id },
        data: {
          mpUserId: profile.mpUserId,
          mpAccountEmail: profile.email,
          mpAccountNickname: profile.nickname,
          mpAccountName: profile.accountName,
          mpAccountSiteId: profile.siteId,
          mpProfileSyncedAt: new Date(),
        },
      });
    } catch (err) {
      throw this.mapSaveTokensError(err, admin.id);
    }
  }

  private mapSaveTokensError(err: unknown, adminUserId: string): BadRequestException {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2025') {
        return new BadRequestException(
          `Usuário admin não encontrado (${adminUserId}). Faça login novamente e tente conectar o Mercado Pago.`,
        );
      }
      if (err.code === 'P2022') {
        return new BadRequestException(this.missingMpColumnsMessage());
      }
    }

    const message = err instanceof Error ? err.message : String(err);
    if (/column.*does not exist|Unknown column/i.test(message)) {
      return new BadRequestException(this.missingMpColumnsMessage());
    }

    this.logger.error(`Falha ao salvar tokens MP (admin=${adminUserId}): ${message}`);
    return new BadRequestException(
      'Mercado Pago autorizou, mas o servidor não conseguiu salvar os tokens. Verifique migrations/schema no banco.',
    );
  }

  private missingMpColumnsMessage(): string {
    return (
      'Banco desatualizado: faltam colunas Mercado Pago na tabela User. ' +
      'Na VPS rode: cd /opt/school-backend && prisma db execute --file deploy/ensure-platform-settings.sql && prisma migrate deploy'
    );
  }
}
