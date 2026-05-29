import { BadRequestException, Injectable, Logger } from '@nestjs/common';
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

export type OwnerEmailConfig = {
  configured: boolean;
  from: string | null;
  inboundAddress: string | null;
  webhookUrl: string | null;
};

export type ReceivedEmailSummary = {
  id: string;
  from: string;
  to: string[];
  subject: string;
  createdAt: string;
};

export type ReceivedEmailDetail = ReceivedEmailSummary & {
  html: string | null;
  text: string | null;
  cc: string[] | null;
  bcc: string[] | null;
  replyTo: string[] | null;
  attachments: Array<{
    id: string;
    filename: string | null;
    size: number;
    contentType: string;
  }>;
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

  getOwnerConfig(): OwnerEmailConfig {
    const apiPublicUrl = this.config.get<string>('API_PUBLIC_URL')?.replace(/\/$/, '');
    return {
      configured: this.isConfigured(),
      from: this.from,
      inboundAddress: this.config.get<string>('RESEND_INBOUND_ADDRESS')?.trim() || null,
      webhookUrl: apiPublicUrl ? `${apiPublicUrl}/api/v1/webhooks/resend` : null,
    };
  }

  async sendCustomEmail(params: {
    to: string;
    subject: string;
    message: string;
  }): Promise<{ id: string }> {
    this.assertConfigured();

    const text = params.message.trim();
    const html = text
      .split('\n')
      .map((line) => `<p>${this.escapeHtml(line) || '&nbsp;'}</p>`)
      .join('');

    const { data, error } = await this.client!.emails.send({
      from: this.from!,
      to: params.to,
      subject: params.subject.trim(),
      html,
      text,
    });

    if (error || !data?.id) {
      this.logger.error(`Failed to send email to ${params.to}: ${error?.message ?? 'unknown'}`);
      throw new BadRequestException(error?.message ?? 'Falha ao enviar e-mail');
    }

    return { id: data.id };
  }

  async listReceivedEmails(limit = 30): Promise<ReceivedEmailSummary[]> {
    this.assertConfigured();

    const { data, error } = await this.client!.emails.receiving.list({ limit });

    if (error || !data) {
      this.logger.error(`Failed to list received emails: ${error?.message ?? 'unknown'}`);
      throw new BadRequestException(error?.message ?? 'Falha ao listar e-mails recebidos');
    }

    return data.data.map((email) => ({
      id: email.id,
      from: email.from,
      to: email.to,
      subject: email.subject,
      createdAt: email.created_at,
    }));
  }

  async getReceivedEmail(id: string): Promise<ReceivedEmailDetail> {
    this.assertConfigured();

    const { data, error } = await this.client!.emails.receiving.get(id);

    if (error || !data) {
      this.logger.error(`Failed to get received email ${id}: ${error?.message ?? 'unknown'}`);
      throw new BadRequestException(error?.message ?? 'E-mail recebido não encontrado');
    }

    return {
      id: data.id,
      from: data.from,
      to: data.to,
      subject: data.subject,
      createdAt: data.created_at,
      html: data.html,
      text: data.text,
      cc: data.cc,
      bcc: data.bcc,
      replyTo: data.reply_to,
      attachments: data.attachments.map((att) => ({
        id: att.id,
        filename: att.filename,
        size: att.size,
        contentType: att.content_type,
      })),
    };
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

  private assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new BadRequestException(
        'Resend não configurado. Defina RESEND_API_KEY e EMAIL_FROM no servidor.',
      );
    }
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
