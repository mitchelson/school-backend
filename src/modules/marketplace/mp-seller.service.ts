import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { User } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { TokenCryptoService } from '../../infrastructure/crypto/token-crypto.service';
import { MpAccountProfileService } from './mp-account-profile.service';

export type MpConnectedAccount = {
  mpUserId: string;
  email: string | null;
  nickname: string | null;
  accountName: string | null;
  siteId: string | null;
  /** Texto pronto para UI: email, apelido ou nome da conta MP */
  displayLabel: string;
};

@Injectable()
export class MpSellerService {
  private readonly logger = new Logger(MpSellerService.name);

  constructor(
    private prisma: PrismaService,
    private tokenCrypto: TokenCryptoService,
    private mpProfile: MpAccountProfileService,
  ) {}

  async getAdminUser() {
    return this.prisma.user.findFirst({
      where: { role: 'admin', status: 'active' },
      orderBy: { createdAt: 'asc' },
    });
  }

  isMpConnected(admin: {
    mpAccessToken: string | null;
    mpTokenExpiresAt: Date | null;
  }): boolean {
    const token = this.tokenCrypto.decrypt(admin.mpAccessToken);
    if (!token?.trim()) return false;
    if (admin.mpTokenExpiresAt && admin.mpTokenExpiresAt < new Date()) {
      return false;
    }
    return true;
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

  async getConnectionStatus() {
    try {
      let admin = await this.getAdminUser();
      if (!admin) {
        return {
          connected: false,
          mpUserId: null,
          connectedAt: null,
          account: null,
        };
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
      };
    } catch (err) {
      this.logger.error(
        `getConnectionStatus falhou — migrations MP no User ou banco indisponível. ${err}`,
      );
      return {
        connected: false,
        mpUserId: null,
        connectedAt: null,
        account: null,
      };
    }
  }

  async requireMpConnected(): Promise<void> {
    const admin = await this.getAdminUser();
    if (!admin || !this.isMpConnected(admin)) {
      throw new BadRequestException(
        'Conecte sua conta Mercado Pago antes de criar planos ou aulas. Acesse Configurações no painel admin.',
      );
    }
  }

  async getSellerAccessToken(): Promise<string> {
    const admin = await this.getAdminUser();
    if (!admin) {
      throw new BadRequestException('Administrador não encontrado');
    }
    const token = this.tokenCrypto.decrypt(admin.mpAccessToken);
    if (!token?.trim() || !this.isMpConnected(admin)) {
      throw new BadRequestException(
        'Conta Mercado Pago da escola não conectada. Conecte em Configurações.',
      );
    }
    return token;
  }

  async saveSellerTokens(data: {
    mpUserId: string;
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }) {
    const admin = await this.getAdminUser();
    if (!admin) throw new BadRequestException('Administrador não encontrado');

    const expiresAt = new Date(Date.now() + Math.max(data.expiresIn, 60) * 1000);
    const profile = await this.mpProfile.fetchFromAccessToken(data.accessToken);

    await this.prisma.user.update({
      where: { id: admin.id },
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

    if (profile?.email) {
      this.logger.log(
        `Perfil MP salvo: ${profile.email} (nickname=${profile.nickname ?? '—'})`,
      );
    }
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

    return this.prisma.user.update({
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
  }
}
