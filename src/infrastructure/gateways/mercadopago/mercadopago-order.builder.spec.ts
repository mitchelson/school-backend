import {
  buildMpOrderBody,
  centsToAmountString,
  splitFullName,
  toMpItemExternalCode,
} from './mercadopago-order.builder';

describe('mercadopago-order.builder', () => {
  const base = {
    paymentId: 'pay-1',
    payer: {
      email: 'aluno@test.com',
      fullName: 'Maria Silva Santos',
      phone: '11987654321',
      createdAt: new Date('2025-01-15T12:00:00.000Z'),
      identification: { type: 'CPF', number: '123.456.789-09' },
    },
    paymentMethod: 'pix' as const,
    statementDescriptor: 'CT095',
    categoryId: 'services',
    shipment: {
      zipCode: '06233-903',
      cityName: 'Osasco',
      stateName: 'São Paulo',
      streetName: 'Av. das Nações Unidas',
      streetNumber: '3003',
    },
  };

  it('formats amounts with two decimals', () => {
    expect(centsToAmountString(1990)).toBe('19.90');
  });

  it('splits full name into first and last', () => {
    expect(splitFullName('Maria Silva Santos')).toEqual({
      firstName: 'Maria',
      lastName: 'Silva Santos',
    });
  });

  it('builds items with quantity and unit_price', () => {
    const body = buildMpOrderBody({
      ...base,
      items: [
        {
          title: 'Plano Mensal',
          quantity: 1,
          unitPriceInCents: 15000,
          externalCode: 'plan-abc',
        },
      ],
    });

    expect(body.total_amount).toBe('150.00');
    expect(body.items).toEqual([
      expect.objectContaining({
        title: 'Plano Mensal',
        quantity: 1,
        unit_price: '150.00',
        category_id: 'services',
        external_code: 'plan-abc',
      }),
    ]);
    expect(body.payer).toMatchObject({
      first_name: 'Maria',
      last_name: 'Silva Santos',
      identification: { type: 'CPF', number: '12345678909' },
      address: expect.objectContaining({
        zip_code: '06233903',
        city: 'Osasco',
        state: 'São Paulo',
      }),
    });
    expect(body.payer).not.toHaveProperty('registration_date');
    expect(body.additional_info).toEqual({
      payer: {
        registration_date: expect.stringMatching(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000-03:00$/,
        ),
      },
    });
    expect(body).not.toHaveProperty('config');
    expect(body).not.toHaveProperty('statement_descriptor');
  });

  it('truncates plan UUID external_code to 30 chars for Orders API', () => {
    const planId = 'f2ed90e5-f119-433c-9173-e3117e9480ec';
    const body = buildMpOrderBody({
      ...base,
      items: [
        {
          title: 'Plano',
          quantity: 1,
          unitPriceInCents: 100,
          externalCode: planId,
        },
      ],
    });

    expect((body.items as Array<{ external_code: string }>)[0].external_code).toBe(
      toMpItemExternalCode(planId),
    );
    expect(toMpItemExternalCode(planId).length).toBeLessThanOrEqual(30);
  });

  it('includes marketplace_fee when provided', () => {
    const body = buildMpOrderBody({
      ...base,
      marketplaceFee: '6.01',
      items: [{ title: 'Plano', quantity: 1, unitPriceInCents: 100 }],
    });

    expect(body.marketplace_fee).toBe('6.01');
  });

  it('sums credit line items', () => {
    const body = buildMpOrderBody({
      ...base,
      items: [
        {
          title: 'Crédito avulso CT095',
          quantity: 3,
          unitPriceInCents: 2500,
        },
      ],
    });

    expect(body.total_amount).toBe('75.00');
    expect((body.items as Array<{ quantity: number }>)[0].quantity).toBe(3);
  });

  it('does not send statement_descriptor on pix (Orders API rejects at root)', () => {
    const body = buildMpOrderBody({
      ...base,
      items: [{ title: 'Plano', quantity: 1, unitPriceInCents: 100 }],
    });

    expect(body).not.toHaveProperty('statement_descriptor');
    const payment = (body.transactions as { payments: Array<{ payment_method: Record<string, unknown> }> })
      .payments[0];
    expect(payment.payment_method).not.toHaveProperty('statement_descriptor');
  });

  it('includes statement_descriptor on card payments', () => {
    const body = buildMpOrderBody({
      ...base,
      paymentMethod: 'card',
      cardToken: 'token-abc',
      items: [{ title: 'Plano', quantity: 1, unitPriceInCents: 10000 }],
    });

    const payment = (body.transactions as { payments: Array<{ payment_method: Record<string, unknown> }> })
      .payments[0];
    expect(payment.payment_method.statement_descriptor).toBe('CT095');
  });
});
