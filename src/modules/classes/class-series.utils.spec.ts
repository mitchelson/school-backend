import {
  computeOccurrenceDates,
  formatDateOnly,
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
});
