import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { TokenCryptoService } from '../../infrastructure/crypto/token-crypto.service';

@Injectable()
export class MpSellerService {
  private readonly logger = new Logger(MpSellerService.name);

  constructor(
    private prisma: PrismaService,
    private tokenCrypto: TokenCryptoService,
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

  async getConnectionStatus() {
    try {
      const admin = await this.getAdminUser();
      if (!admin) {
        return { connected: false, mpUserId: null, connectedAt: null };
      }
      return {
        connected: this.isMpConnected(admin),
        mpUserId: admin.mpUserId,
        connectedAt: admin.mpConnectedAt?.toISOString() ?? null,
      };
    } catch (err) {
      this.logger.error(
        `getConnectionStatus falhou — migrations MP no User ou banco indisponível. ${err}`,
      );
      return { connected: false, mpUserId: null, connectedAt: null };
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

    await this.prisma.user.update({
      where: { id: admin.id },
      data: {
        mpUserId: data.mpUserId,
        mpAccessToken: this.tokenCrypto.encrypt(data.accessToken),
        mpRefreshToken: this.tokenCrypto.encrypt(data.refreshToken),
        mpTokenExpiresAt: expiresAt,
        mpConnectedAt: new Date(),
      },
    });
  }
}
