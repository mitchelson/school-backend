import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { PlatformSettingsService } from '../marketplace/platform-settings.service';

@Injectable()
export class CreditsService {
  constructor(
    private prisma: PrismaService,
    private platformSettings: PlatformSettingsService,
  ) {}

  async getBalance(studentId: string) {
    const record = await this.prisma.studentTokenBalance.findUnique({
      where: { studentId },
    });
    return { balance: record?.balance ?? 0 };
  }

  async getUnitPriceInCents() {
    const unitPriceInCents = await this.platformSettings.getCreditUnitPriceCents();
    return { unitPriceInCents };
  }

  async setUnitPriceInCents(cents: number) {
    const unitPriceInCents = await this.platformSettings.setCreditUnitPriceCents(cents);
    return { unitPriceInCents };
  }

  async addCredits(studentId: string, quantity: number) {
    return this.prisma.studentTokenBalance.upsert({
      where: { studentId },
      update: { balance: { increment: quantity } },
      create: { studentId, balance: quantity },
    });
  }
}
