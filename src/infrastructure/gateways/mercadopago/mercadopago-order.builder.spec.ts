import {
  buildMpOrderBody,
  centsToAmountString,
  splitFullName,
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
    });
    expect(body.shipment).toMatchObject({
      address: expect.objectContaining({
        zip_code: '06233903',
        city: 'Osasco',
        state: 'São Paulo',
      }),
    });
    expect(body.additional_info).toMatchObject({
      payer: expect.objectContaining({
        registration_date: '2025-01-15T12:00:00.000Z',
        authentication_type: 'custom',
      }),
      shipments: {
        receiver_address: expect.objectContaining({
          zip_code: '06233903',
          city_name: 'Osasco',
          state_name: 'São Paulo',
          street_number: '3003',
        }),
      },
    });
  });

  it('includes payer purchase metadata and marketplace_fee', () => {
    const body = buildMpOrderBody({
      ...base,
      payer: {
        ...base.payer,
        isFirstPurchaseOnline: true,
        lastPurchaseAt: new Date('2024-06-01T10:00:00.000Z'),
      },
      marketplaceFee: '6.01',
      items: [{ title: 'Plano', quantity: 1, unitPriceInCents: 100 }],
    });

    expect(body.marketplace_fee).toBe('6.01');
    expect(body.additional_info).toMatchObject({
      payer: expect.objectContaining({
        is_first_purchase_online: true,
        last_purchase: '2024-06-01T10:00:00.000Z',
      }),
    });
  });

  it('includes statement_descriptor on pix', () => {
    const body = buildMpOrderBody({
      ...base,
      items: [{ title: 'Plano', quantity: 1, unitPriceInCents: 100 }],
    });

    const payment = (body.transactions as { payments: Array<{ payment_method: Record<string, unknown> }> })
      .payments[0];
    expect(payment.payment_method.statement_descriptor).toBe('CT095');
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
