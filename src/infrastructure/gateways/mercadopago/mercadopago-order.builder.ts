export interface MpOrderItemInput {
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
  /** Data de cadastro do aluno (additional_info.payer — apenas cartão). */
  createdAt: Date;
  identification?: { type: string; number: string };
}

export interface MpShipmentInput {
  zipCode: string;
  cityName: string;
  stateName: string;
  streetName?: string;
  streetNumber?: string;
}

export interface BuildMpOrderBodyInput {
  paymentId: string;
  items: MpOrderItemInput[];
  payer: MpPayerInput;
  paymentMethod: 'pix' | 'card';
  statementDescriptor: string;
  categoryId: string;
  shipment: MpShipmentInput;
  cardToken?: string;
  paymentMethodId?: string;
  installments?: number;
  marketplaceFee?: string | null;
}

/** Mercado Pago Orders: `items[].external_code` max 30 caracteres. */
export const MP_ITEM_EXTERNAL_CODE_MAX_LEN = 30;

export function toMpItemExternalCode(value: string): string {
  return value.slice(0, MP_ITEM_EXTERNAL_CODE_MAX_LEN);
}

export function centsToAmountString(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: 'Cliente', lastName: 'CT095' };
  if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

export function splitBrazilPhone(phone?: string | null): { areaCode?: string; number?: string } {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length < 10) return {};
  const areaCode = digits.slice(0, 2);
  const number = digits.slice(2);
  return { areaCode, number };
}

/** ISO 8601 com offset de Brasília — ex.: 2020-08-06T09:25:04.000-03:00 */
export function formatMpPayerRegistrationDate(date: Date): string {
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

export function buildMpOrderBody(input: BuildMpOrderBodyInput): Record<string, unknown> {
  const totalCents = input.items.reduce(
    (sum, item) => sum + item.unitPriceInCents * item.quantity,
    0,
  );
  const totalAmount = centsToAmountString(totalCents);
  const { firstName, lastName } = splitFullName(input.payer.fullName);
  const phone = splitBrazilPhone(input.payer.phone);

  const items = input.items.map((item) => ({
    title: item.title.slice(0, 150),
    unit_price: centsToAmountString(item.unitPriceInCents),
    quantity: item.quantity,
    category_id: item.categoryId ?? input.categoryId,
    ...(item.externalCode
      ? { external_code: toMpItemExternalCode(item.externalCode) }
      : {}),
  }));

  const payer: Record<string, unknown> = {
    email: input.payer.email,
    entity_type: 'individual',
    first_name: firstName.slice(0, 50),
    last_name: lastName.slice(0, 50),
  };

  if (input.payer.identification?.number) {
    payer.identification = {
      type: input.payer.identification.type,
      number: input.payer.identification.number.replace(/\D/g, ''),
    };
  }

  if (phone.areaCode && phone.number) {
    payer.phone = { area_code: phone.areaCode, number: phone.number };
  }

  const zipCode = input.shipment.zipCode.replace(/\D/g, '').slice(0, 16);
  payer.address = {
    zip_code: zipCode,
    city: input.shipment.cityName.slice(0, 50),
    state: input.shipment.stateName.slice(0, 50),
    street_name: (input.shipment.streetName ?? 'Servico digital').slice(0, 100),
    street_number: (input.shipment.streetNumber ?? 'S/N').slice(0, 20),
  };

  const statementDescriptor = input.statementDescriptor.slice(0, 50);

  const paymentMethod: Record<string, unknown> =
    input.paymentMethod === 'pix'
      ? { id: 'pix', type: 'bank_transfer' }
      : {
          id: input.paymentMethodId || 'master',
          type: 'credit_card',
          token: input.cardToken,
          installments: input.installments ?? 1,
          statement_descriptor: statementDescriptor,
        };

  const body: Record<string, unknown> = {
    type: 'online',
    processing_mode: 'automatic',
    external_reference: input.paymentId,
    total_amount: totalAmount,
    description: items[0]?.title ?? 'CT095',
    payer,
    items,
    shipment: {
      address: {
        zip_code: input.shipment.zipCode.replace(/\D/g, '').slice(0, 16),
        city: input.shipment.cityName.slice(0, 50),
        state: input.shipment.stateName.slice(0, 50),
        ...(input.shipment.streetName
          ? { street_name: input.shipment.streetName.slice(0, 100) }
          : {}),
        ...(input.shipment.streetNumber
          ? { street_number: input.shipment.streetNumber.slice(0, 20) }
          : {}),
      },
    },
    transactions: {
      payments: [
        {
          amount: totalAmount,
          payment_method: paymentMethod,
          ...(input.paymentMethod === 'pix' ? { expiration_time: 'PT1H' } : {}),
        },
      ],
    },
  };

  if (input.marketplaceFee != null) {
    body.marketplace_fee = input.marketplaceFee;
  }

  // Orders API: additional_info.payer só é aceito em cartão; Pix retorna 400.
  if (input.paymentMethod === 'card') {
    body.additional_info = {
      payer: {
        registration_date: formatMpPayerRegistrationDate(input.payer.createdAt),
      },
    };
  }

  return body;
}
