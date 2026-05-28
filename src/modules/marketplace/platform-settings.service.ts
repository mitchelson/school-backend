import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

export const PLATFORM_FEE_PERCENT_KEY = 'platform_fee_percent';
export const CREDIT_UNIT_PRICE_CENTS_KEY = 'credit_unit_price_cents';
export const MP_FEE_PERCENT_PIX_KEY = 'mp_fee_percent_pix';
export const MP_FEE_PERCENT_CARD_KEY = 'mp_fee_percent_card';
export const MP_FEE_PERCENT_CARD_INSTALLMENTS_KEY = 'mp_fee_percent_card_installments';

const DEFAULT_CREDIT_UNIT_PRICE_CENTS = 3000;
const DEFAULT_MP_FEE_PIX = 0.99;
const DEFAULT_MP_FEE_CARD = 4.98;
const DEFAULT_MP_FEE_CARD_INSTALLMENTS = 4.98;

@Injectable()
export class PlatformSettingsService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  /** Percentual total descontado do bruto (MP + plataforma). Vendedor recebe 100% − este valor. */
  async getTotalFeePercent(): Promise<number> {
    return this.getPlatformFeePercent();
  }

  async getPlatformFeePercent(): Promise<number> {
    const fromDb = await this.readIntKey(PLATFORM_FEE_PERCENT_KEY);
    if (fromDb != null && fromDb >= 0 && fromDb <= 100) return fromDb;

    const fromEnv = parseInt(
      this.config.get<string>('PLATFORM_TOTAL_FEE_PERCENT') ??
        this.config.get<string>('PLATFORM_FEE_PERCENT') ??
        '7',
      10,
    );
    return Number.isFinite(fromEnv) ? Math.min(100, Math.max(0, fromEnv)) : 7;
  }

  async setPlatformFeePercent(percent: number): Promise<number> {
    const value = String(Math.min(100, Math.max(0, Math.round(percent))));
    await this.upsertKey(PLATFORM_FEE_PERCENT_KEY, value);
    return parseInt(value, 10);
  }

  async getMpFeePercentPix(): Promise<number> {
    return (
      (await this.readDecimalKey(MP_FEE_PERCENT_PIX_KEY)) ?? DEFAULT_MP_FEE_PIX
    );
  }

  async setMpFeePercentPix(percent: number): Promise<number> {
    return this.writeDecimalKey(MP_FEE_PERCENT_PIX_KEY, percent, DEFAULT_MP_FEE_PIX);
  }

  async getMpFeePercentCard(): Promise<number> {
    return (
      (await this.readDecimalKey(MP_FEE_PERCENT_CARD_KEY)) ?? DEFAULT_MP_FEE_CARD
    );
  }

  async setMpFeePercentCard(percent: number): Promise<number> {
    return this.writeDecimalKey(MP_FEE_PERCENT_CARD_KEY, percent, DEFAULT_MP_FEE_CARD);
  }

  async getMpFeePercentCardInstallments(): Promise<number> {
    return (
      (await this.readDecimalKey(MP_FEE_PERCENT_CARD_INSTALLMENTS_KEY)) ??
      DEFAULT_MP_FEE_CARD_INSTALLMENTS
    );
  }

  async setMpFeePercentCardInstallments(percent: number): Promise<number> {
    return this.writeDecimalKey(
      MP_FEE_PERCENT_CARD_INSTALLMENTS_KEY,
      percent,
      DEFAULT_MP_FEE_CARD_INSTALLMENTS,
    );
  }

  async getMpFeePercent(
    paymentMethod: 'pix' | 'card',
    installments = 1,
  ): Promise<number> {
    if (paymentMethod === 'pix') return this.getMpFeePercentPix();
    if (installments > 1) return this.getMpFeePercentCardInstallments();
    return this.getMpFeePercentCard();
  }

  async getCreditUnitPriceCents(): Promise<number> {
    const fromDb = await this.readIntKey(CREDIT_UNIT_PRICE_CENTS_KEY);
    if (fromDb != null && fromDb >= 100) return fromDb;

    const fromEnv = parseInt(
      this.config.get<string>('CREDIT_UNIT_PRICE_CENTS') ?? String(DEFAULT_CREDIT_UNIT_PRICE_CENTS),
      10,
    );
    return Number.isFinite(fromEnv) && fromEnv >= 100
      ? fromEnv
      : DEFAULT_CREDIT_UNIT_PRICE_CENTS;
  }

  async setCreditUnitPriceCents(cents: number): Promise<number> {
    const value = String(Math.max(100, Math.round(cents)));
    await this.upsertKey(CREDIT_UNIT_PRICE_CENTS_KEY, value);
    return parseInt(value, 10);
  }

  private async readIntKey(key: string): Promise<number | null> {
    const row = await this.prisma.platformSetting.findUnique({ where: { key } });
    if (!row) return null;
    const n = parseInt(row.value, 10);
    return Number.isFinite(n) ? n : null;
  }

  private async readDecimalKey(key: string): Promise<number | null> {
    const row = await this.prisma.platformSetting.findUnique({ where: { key } });
    if (!row) return null;
    const n = parseFloat(row.value);
    if (!Number.isFinite(n) || n < 0 || n > 100) return null;
    return Math.round(n * 100) / 100;
  }

  private async writeDecimalKey(
    key: string,
    percent: number,
    fallback: number,
  ): Promise<number> {
    const clamped = Math.min(100, Math.max(0, percent));
    const value = Number.isFinite(clamped)
      ? String(Math.round(clamped * 100) / 100)
      : String(fallback);
    await this.upsertKey(key, value);
    return parseFloat(value);
  }

  private async upsertKey(key: string, value: string) {
    await this.prisma.platformSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }
}
