import { Injectable } from '@nestjs/common';
import type { Role } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { PlatformSettingsService } from '../marketplace/platform-settings.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class CreditsService {
  constructor(
    private prisma: PrismaService,
    private platformSettings: PlatformSettingsService,
    private audit: AuditService,
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

  async setUnitPriceInCents(cents: number, actor?: { id: string; role: Role }) {
    const unitPriceInCents = await this.platformSettings.setCreditUnitPriceCents(cents);
    if (actor) {
      await this.audit.log({
        actorId: actor.id,
        actorRole: actor.role,
        action: 'credit.price_updated',
        entityType: 'platform_setting',
        entityId: 'credit_unit_price_cents',
        metadata: { unitPriceInCents },
      });
    }
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
