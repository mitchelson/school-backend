import {
  buildMpPaymentBody,
  centsToAmountNumber,
  splitFullName,
} from './mercadopago-payment.builder';

describe('mercadopago-payment.builder', () => {
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
  };

  it('formats amounts as numbers with two decimal places', () => {
    expect(centsToAmountNumber(1990)).toBe(19.9);
    expect(centsToAmountNumber(500)).toBe(5);
  });

  it('splits full name into first and last', () => {
    expect(splitFullName('Maria Silva Santos')).toEqual({
      firstName: 'Maria',
      lastName: 'Silva Santos',
    });
  });

  it('builds pix payment with application_fee', () => {
    const body = buildMpPaymentBody({
      ...base,
      applicationFee: 0.3,
      items: [{ title: 'Crédito avulso CT095', quantity: 5, unitPriceInCents: 100 }],
    });

    expect(body.transaction_amount).toBe(5);
    expect(body.payment_method_id).toBe('pix');
    expect(body.application_fee).toBe(0.3);
    expect(body.external_reference).toBe('pay-1');
    expect(body.date_of_expiration).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000-03:00$/,
    );
    expect(body.payer).toMatchObject({
      first_name: 'Maria',
      last_name: 'Silva Santos',
      identification: { type: 'CPF', number: '12345678909' },
    });
    expect(body).not.toHaveProperty('additional_info');
  });

  it('builds card payment with token and registration_date', () => {
    const body = buildMpPaymentBody({
      ...base,
      paymentMethod: 'card',
      cardToken: 'token-abc',
      applicationFee: 6.01,
      items: [{ title: 'Plano Mensal', quantity: 1, unitPriceInCents: 15000 }],
    });

    expect(body.transaction_amount).toBe(150);
    expect(body.token).toBe('token-abc');
    expect(body.payment_method_id).toBe('master');
    expect(body.application_fee).toBe(6.01);
    expect(body.statement_descriptor).toBe('CT095');
    expect(body.additional_info).toEqual({
      payer: {
        registration_date: expect.stringMatching(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000-03:00$/,
        ),
      },
    });
  });

  it('omits application_fee when zero or absent', () => {
    const body = buildMpPaymentBody({
      ...base,
      items: [{ title: 'Plano', quantity: 1, unitPriceInCents: 100 }],
    });

    expect(body).not.toHaveProperty('application_fee');
  });
});
