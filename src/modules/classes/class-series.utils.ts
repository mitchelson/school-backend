/** Segunda-feira da semana (local) que contém `ref`. */
export function startOfIsoWeek(ref: Date): Date {
  const d = new Date(ref);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + mondayOffset);
  return d;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** weekday ISO 1=Seg … 7=Dom */
export function dateWithIsoWeekday(weekMonday: Date, isoWeekday: number): Date {
  return addDays(weekMonday, isoWeekday - 1);
}

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function parseIsoDateOnly(iso: string): Date {
  const [y, m, day] = iso.split('-').map(Number);
  return new Date(y, m - 1, day);
}

/** Gera datas de ocorrência (semanal / quinzenal) a partir de hoje. */
export function computeOccurrenceDates(
  scheduleType: 'weekly' | 'biweekly',
  weekdays: number[],
  weeksAhead: number,
): Date[] {
  const today = startOfDay(new Date());
  const out: Date[] = [];
  const seen = new Set<string>();

  const step = scheduleType === 'biweekly' ? 2 : 1;
  const horizon = Math.min(Math.max(weeksAhead, 1), 26);

  for (let w = 0; w < horizon; w++) {
    const weekStart = addDays(startOfIsoWeek(today), w * 7 * step);
    for (const wd of weekdays) {
      const dt = dateWithIsoWeekday(weekStart, wd);
      if (dt < today) continue;
      const key = dt.toISOString().slice(0, 10);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(dt);
    }
  }

  return out.sort((a, b) => a.getTime() - b.getTime()).slice(0, 80);
}
