import {
  computeRenewedValidUntil,
  canPurchaseOrRenewPlan,
  isInExpiryNoticeWindow,
} from './subscription.utils';

describe('subscription.utils', () => {
  const now = new Date('2026-06-01T12:00:00.000Z');

  it('extends from current validUntil when still active', () => {
    const validUntil = new Date('2026-06-10T12:00:00.000Z');
    const next = computeRenewedValidUntil(validUntil, now);
    expect(next.toISOString()).toBe('2026-07-10T12:00:00.000Z');
  });

  it('starts from today when plan expired', () => {
    const validUntil = new Date('2026-05-20T12:00:00.000Z');
    const next = computeRenewedValidUntil(validUntil, now);
    expect(next.toISOString()).toBe('2026-07-01T12:00:00.000Z');
  });

  it('allows purchase when within renew window', () => {
    const validUntil = new Date('2026-06-04T12:00:00.000Z');
    expect(canPurchaseOrRenewPlan(validUntil, now)).toBe(true);
  });

  it('blocks purchase when more than 5 days remain', () => {
    const validUntil = new Date('2026-06-10T12:00:00.000Z');
    expect(canPurchaseOrRenewPlan(validUntil, now)).toBe(false);
  });

  it('detects expiry notice window', () => {
    const validUntil = new Date('2026-06-04T12:00:00.000Z');
    expect(isInExpiryNoticeWindow(validUntil, now)).toBe(true);
  });
});
