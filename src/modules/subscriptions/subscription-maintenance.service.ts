import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { ResendEmailService } from '../../infrastructure/email/resend-email.service';
import {
  canPurchaseOrRenewPlan,
  isInExpiryNoticeWindow,
  daysUntilValidUntil,
} from './subscription.utils';

export type SubscriptionMaintenanceResult = {
  markedExpired: number;
  emailsSent: number;
  emailsSkipped: number;
};

@Injectable()
export class SubscriptionMaintenanceService {
  private readonly logger = new Logger(SubscriptionMaintenanceService.name);

  constructor(
    private prisma: PrismaService,
    private email: ResendEmailService,
    private config: ConfigService,
  ) {}

  async run(now = new Date()): Promise<SubscriptionMaintenanceResult> {
    const markedExpired = await this.markExpiredSubscriptions(now);
    const { emailsSent, emailsSkipped } = await this.sendExpiryReminders(now);

    return { markedExpired, emailsSent, emailsSkipped };
  }

  private async markExpiredSubscriptions(now: Date): Promise<number> {
    const result = await this.prisma.subscription.updateMany({
      where: {
        status: 'active',
        validUntil: { lt: now },
      },
      data: { status: 'expired' },
    });
    return result.count;
  }

  private async sendExpiryReminders(now: Date) {
    let emailsSent = 0;
    let emailsSkipped = 0;

    const subscriptions = await this.prisma.subscription.findMany({
      where: {
        status: 'active',
        validUntil: { gt: now },
      },
      include: {
        plan: true,
        student: { select: { email: true, fullName: true } },
      },
    });

    const frontendUrl = this.config.get<string>('FRONTEND_URL')?.replace(/\/$/, '') ?? '';

    for (const sub of subscriptions) {
      if (!isInExpiryNoticeWindow(sub.validUntil, now)) {
        continue;
      }

      if (
        sub.lastExpiryNoticeValidUntil &&
        sub.lastExpiryNoticeValidUntil.getTime() === sub.validUntil.getTime()
      ) {
        emailsSkipped += 1;
        continue;
      }

      const renewUrl = frontendUrl
        ? `${frontendUrl}/aluno/saldos?tab=planos`
        : '/aluno/saldos?tab=planos';

      const sent = await this.email.sendPlanExpiryReminder({
        to: sub.student.email,
        studentName: sub.student.fullName,
        planName: sub.plan.name,
        validUntil: sub.validUntil,
        daysRemaining: daysUntilValidUntil(sub.validUntil, now),
        renewUrl,
      });

      if (sent) {
        await this.prisma.subscription.update({
          where: { id: sub.id },
          data: { lastExpiryNoticeValidUntil: sub.validUntil },
        });
        emailsSent += 1;
      } else {
        emailsSkipped += 1;
      }
    }

    if (emailsSent > 0) {
      this.logger.log(`Sent ${emailsSent} plan expiry reminder(s)`);
    }

    return { emailsSent, emailsSkipped };
  }

  /** Used by checkout to reject early renewals. */
  async assertCanPurchasePlan(studentId: string, now = new Date()): Promise<void> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { studentId },
    });

    if (!subscription) return;

    if (!canPurchaseOrRenewPlan(subscription.validUntil, now)) {
      const days = daysUntilValidUntil(subscription.validUntil, now);
      throw new BadRequestException(
        `Renovação disponível apenas nos últimos 5 dias do plano (faltam ${days} dias).`,
      );
    }
  }
}
