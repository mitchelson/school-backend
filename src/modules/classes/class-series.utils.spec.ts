import {
  buildClassStartInstant,
  computeOccurrenceDates,
  formatDateOnly,
  getCheckinWindow,
  inferWeekdaysConvention,
  isoWeekdayFromDate,
  normalizeWeekdaysToIso,
  parseIsoDateOnly,
} from './class-series.utils';

describe('class-series.utils', () => {
  it('normalizes monday_zero to ISO', () => {
    expect(normalizeWeekdaysToIso([1, 3], 'monday_zero')).toEqual([2, 4]);
  });

  it('keeps ISO weekdays', () => {
    expect(normalizeWeekdaysToIso([2, 4], 'iso')).toEqual([2, 4]);
  });

  it('infers monday_zero when 0 is present', () => {
    expect(inferWeekdaysConvention([0, 2])).toBe('monday_zero');
  });

  it('infers iso for panel weekdays 1-7 (Terça=2, Quinta=4)', () => {
    expect(inferWeekdaysConvention([2, 4])).toBe('iso');
    expect(normalizeWeekdaysToIso([2, 4], inferWeekdaysConvention([2, 4]))).toEqual([
      2, 4,
    ]);
  });

  it('generates Tuesday and Thursday for monday_zero input', () => {
    const iso = normalizeWeekdaysToIso([1, 3], 'monday_zero');
    const dates = computeOccurrenceDates('weekly', iso, 2);
    expect(dates.length).toBeGreaterThan(0);
    for (const d of dates) {
      expect([2, 4]).toContain(isoWeekdayFromDate(d));
    }
  });

  it('formats date without timezone shift', () => {
    const d = parseIsoDateOnly('2026-06-03');
    expect(formatDateOnly(d)).toBe('2026-06-03');
    expect(isoWeekdayFromDate(d)).toBe(3);
  });

  it('builds class start at 18:00 BRT as 21:00 UTC', () => {
    const classDate = parseIsoDateOnly('2026-05-28');
    expect(buildClassStartInstant(classDate, '18:00').toISOString()).toBe(
      '2026-05-28T21:00:00.000Z',
    );
  });

  it('rejects check-in 4h before an 18:00 class', () => {
    const classDate = parseIsoDateOnly('2026-05-28');
    const at14Brt = new Date('2026-05-28T17:00:00.000Z');
    expect(getCheckinWindow(classDate, '18:00', at14Brt).isOpen).toBe(false);
  });

  it('allows check-in 2h before an 18:00 class', () => {
    const classDate = parseIsoDateOnly('2026-05-28');
    const at16Brt = new Date('2026-05-28T19:00:00.000Z');
    expect(getCheckinWindow(classDate, '18:00', at16Brt).isOpen).toBe(true);
  });
});
