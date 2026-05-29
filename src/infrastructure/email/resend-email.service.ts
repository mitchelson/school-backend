import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

export type PlanExpiryEmailParams = {
  to: string;
  studentName: string;
  planName: string;
  validUntil: Date;
  daysRemaining: number;
  renewUrl: string;
};

@Injectable()
export class ResendEmailService {
  private readonly logger = new Logger(ResendEmailService.name);
  private readonly client: Resend | null;
  private readonly from: string | null;

  constructor(private config: ConfigService) {
    const apiKey = this.config.get<string>('RESEND_API_KEY')?.trim();
    this.from = this.config.get<string>('EMAIL_FROM')?.trim() ?? null;
    this.client = apiKey ? new Resend(apiKey) : null;
  }

  isConfigured(): boolean {
    return Boolean(this.client && this.from);
  }

  async sendPlanExpiryReminder(params: PlanExpiryEmailParams): Promise<boolean> {
    if (!this.client || !this.from) {
      this.logger.warn('Resend not configured — skipping plan expiry email');
      return false;
    }

    const formattedDate = params.validUntil.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });

    const { error } = await this.client.emails.send({
      from: this.from,
      to: params.to,
      subject: `Seu plano ${params.planName} vence em ${params.daysRemaining} dia${params.daysRemaining === 1 ? '' : 's'}`,
      html: `
        <p>Olá, ${params.studentName}!</p>
        <p>Seu plano <strong>${params.planName}</strong> vence em <strong>${formattedDate}</strong> (${params.daysRemaining} dia${params.daysRemaining === 1 ? '' : 's'} restantes).</p>
        <p>Renove agora para continuar reservando aulas sem interrupção.</p>
        <p><a href="${params.renewUrl}">Renovar plano</a></p>
        <p>Se preferir, você também pode comprar créditos avulsos na mesma página.</p>
      `.trim(),
    });

    if (error) {
      this.logger.error(`Failed to send plan expiry email to ${params.to}: ${error.message}`);
      return false;
    }

    return true;
  }
}
