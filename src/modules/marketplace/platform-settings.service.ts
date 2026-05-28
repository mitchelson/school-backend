import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

export const PLATFORM_FEE_PERCENT_KEY = 'platform_fee_percent';
export const CREDIT_UNIT_PRICE_CENTS_KEY = 'credit_unit_price_cents';
const DEFAULT_CREDIT_UNIT_PRICE_CENTS = 3000;

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
    const row = await this.prisma.platformSetting.findUnique({
      where: { key: PLATFORM_FEE_PERCENT_KEY },
    });
    const fromDb = row ? parseInt(row.value, 10) : NaN;
    if (Number.isFinite(fromDb) && fromDb >= 0 && fromDb <= 100) return fromDb;

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
    await this.prisma.platformSetting.upsert({
      where: { key: PLATFORM_FEE_PERCENT_KEY },
      update: { value },
      create: { key: PLATFORM_FEE_PERCENT_KEY, value },
    });
    return parseInt(value, 10);
  }

  async getCreditUnitPriceCents(): Promise<number> {
    const row = await this.prisma.platformSetting.findUnique({
      where: { key: CREDIT_UNIT_PRICE_CENTS_KEY },
    });
    const fromDb = row ? parseInt(row.value, 10) : NaN;
    if (Number.isFinite(fromDb) && fromDb >= 100) return fromDb;

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
    await this.prisma.platformSetting.upsert({
      where: { key: CREDIT_UNIT_PRICE_CENTS_KEY },
      update: { value },
      create: { key: CREDIT_UNIT_PRICE_CENTS_KEY, value },
    });
    return parseInt(value, 10);
  }
}
