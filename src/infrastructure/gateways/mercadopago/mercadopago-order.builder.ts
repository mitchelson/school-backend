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
  createdAt: Date;
  identification?: { type: string; number: string };
  /** MP additional_info.payer.is_first_purchase_online */
  isFirstPurchaseOnline?: boolean;
  /** MP additional_info.payer.last_purchase */
  lastPurchaseAt?: Date;
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
    ...(item.externalCode ? { external_code: item.externalCode.slice(0, 64) } : {}),
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

  const descriptor = input.statementDescriptor.slice(0, 50);
  const paymentMethod: Record<string, unknown> =
    input.paymentMethod === 'pix'
      ? {
          id: 'pix',
          type: 'bank_transfer',
          statement_descriptor: descriptor,
        }
      : {
          id: input.paymentMethodId || 'master',
          type: 'credit_card',
          token: input.cardToken,
          installments: input.installments ?? 1,
          statement_descriptor: descriptor,
        };

  const zipCode = input.shipment.zipCode.replace(/\D/g, '').slice(0, 16);
  const cityName = input.shipment.cityName.slice(0, 50);
  const stateName = input.shipment.stateName.slice(0, 50);
  const streetNumber = input.shipment.streetNumber?.slice(0, 20);

  const receiverAddress: Record<string, unknown> = {
    zip_code: zipCode,
    city_name: cityName,
    state_name: stateName,
    ...(input.shipment.streetName
      ? { street_name: input.shipment.streetName.slice(0, 100) }
      : {}),
    ...(streetNumber ? { street_number: streetNumber } : {}),
  };

  const additionalPayer: Record<string, unknown> = {
    registration_date: input.payer.createdAt.toISOString(),
    authentication_type: 'custom',
  };
  if (input.payer.isFirstPurchaseOnline != null) {
    additionalPayer.is_first_purchase_online = input.payer.isFirstPurchaseOnline;
  }
  if (input.payer.lastPurchaseAt) {
    additionalPayer.last_purchase = input.payer.lastPurchaseAt.toISOString();
  }

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
        zip_code: zipCode,
        city: cityName,
        state: stateName,
        ...(input.shipment.streetName
          ? { street_name: input.shipment.streetName.slice(0, 100) }
          : {}),
        ...(streetNumber ? { street_number: streetNumber } : {}),
      },
    },
    additional_info: {
      payer: additionalPayer,
      shipments: {
        receiver_address: receiverAddress,
      },
    },
    config: {
      online: {
        capture_mode: 'automatic',
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

  return body;
}
