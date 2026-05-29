/** Dias antes do vencimento em que a renovação fica disponível. */
export const PLAN_RENEW_WINDOW_DAYS = 5;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function addPlanPeriod(from: Date): Date {
  return new Date(from.getTime() + 30 * MS_PER_DAY);
}

/**
 * Renovação: soma 30 dias ao fim do plano atual se ainda válido;
 * se já venceu, conta a partir de hoje.
 */
export function computeRenewedValidUntil(
  existingValidUntil: Date | null | undefined,
  now = new Date(),
): Date {
  if (existingValidUntil && existingValidUntil.getTime() > now.getTime()) {
    return addPlanPeriod(existingValidUntil);
  }
  return addPlanPeriod(now);
}

export function daysUntilValidUntil(validUntil: Date, now = new Date()): number {
  return Math.max(0, Math.ceil((validUntil.getTime() - now.getTime()) / MS_PER_DAY));
}

export function isSubscriptionActive(validUntil: Date, now = new Date()): boolean {
  return now.getTime() <= validUntil.getTime();
}

export function canPurchaseOrRenewPlan(
  validUntil: Date | null | undefined,
  now = new Date(),
): boolean {
  if (!validUntil) return true;
  if (!isSubscriptionActive(validUntil, now)) return true;
  return daysUntilValidUntil(validUntil, now) <= PLAN_RENEW_WINDOW_DAYS;
}

export function isInExpiryNoticeWindow(
  validUntil: Date,
  now = new Date(),
): boolean {
  if (!isSubscriptionActive(validUntil, now)) return false;
  const days = daysUntilValidUntil(validUntil, now);
  return days > 0 && days <= PLAN_RENEW_WINDOW_DAYS;
}
