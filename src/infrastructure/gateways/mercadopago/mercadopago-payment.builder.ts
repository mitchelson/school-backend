export interface MpPaymentItemInput {
  title: string;
  quantity: number;
  unitPriceInCents: number;
  categoryId?: string;
  externalCode?: string;
}

export interface MpPayerInput {
  email: string;
  fullName: string;
  phone?: string | null;
  /** Data de cadastro do aluno (additional_info.payer — cartão). */
  createdAt: Date;
  identification?: { type: string; number: string };
}

export interface BuildMpPaymentBodyInput {
  paymentId: string;
  items: MpPaymentItemInput[];
  payer: MpPayerInput;
  paymentMethod: 'pix' | 'card';
  statementDescriptor: string;
  cardToken?: string;
  paymentMethodId?: string;
  installments?: number;
  /** Comissão marketplace em reais (Split 1:1 — application_fee). */
  applicationFee?: number | null;
  /** Validade do Pix em horas (padrão 1h). */
  pixExpirationHours?: number;
}

export function centsToAmountNumber(cents: number): number {
  return Math.round(cents) / 100;
}

export function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: 'Cliente', lastName: 'CT095' };
  if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

/** ISO 8601 com offset de Brasília — ex.: 2020-08-06T09:25:04.000-03:00 */
export function formatMpPayerRegistrationDate(date: Date): string {
  return formatMpBrazilDateTime(date);
}

/** Data/hora futura para expiração do Pix (Checkout Transparente /v1/payments). */
export function formatMpPixExpirationDate(hoursFromNow: number): string {
  return formatMpBrazilDateTime(new Date(Date.now() + hoursFromNow * 60 * 60 * 1000));
}

function formatMpBrazilDateTime(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}.000-03:00`;
}

function buildDescription(items: MpPaymentItemInput[]): string {
  if (items.length === 0) return 'CT095';
  const first = items[0];
  if (items.length === 1 && first.quantity === 1) {
    return first.title.slice(0, 256);
  }
  const summary = items
    .map((item) => `${item.title}${item.quantity > 1 ? ` x${item.quantity}` : ''}`)
    .join(', ');
  return summary.slice(0, 256);
}

/**
 * Checkout Transparente (Split 1:1): POST /v1/payments com application_fee.
 * @see https://www.mercadopago.com.br/developers/pt/docs/split-payments/integration-configuration/integrate-marketplace
 */
export function buildMpPaymentBody(input: BuildMpPaymentBodyInput): Record<string, unknown> {
  const totalCents = input.items.reduce(
    (sum, item) => sum + item.unitPriceInCents * item.quantity,
    0,
  );
  const { firstName, lastName } = splitFullName(input.payer.fullName);

  const payer: Record<string, unknown> = {
    email: input.payer.email,
    first_name: firstName.slice(0, 50),
    last_name: lastName.slice(0, 50),
  };

  if (input.payer.identification?.number) {
    payer.identification = {
      type: input.payer.identification.type,
      number: input.payer.identification.number.replace(/\D/g, ''),
    };
  }

  const body: Record<string, unknown> = {
    transaction_amount: centsToAmountNumber(totalCents),
    description: buildDescription(input.items),
    external_reference: input.paymentId,
    payer,
  };

  if (input.applicationFee != null && input.applicationFee > 0) {
    body.application_fee = input.applicationFee;
  }

  if (input.paymentMethod === 'pix') {
    body.payment_method_id = 'pix';
    body.date_of_expiration = formatMpPixExpirationDate(input.pixExpirationHours ?? 1);
  } else {
    body.token = input.cardToken;
    body.payment_method_id = input.paymentMethodId || 'master';
    body.installments = input.installments ?? 1;
    body.statement_descriptor = input.statementDescriptor.slice(0, 22);
    body.additional_info = {
      payer: {
        registration_date: formatMpPayerRegistrationDate(input.payer.createdAt),
      },
    };
  }

  return body;
}
