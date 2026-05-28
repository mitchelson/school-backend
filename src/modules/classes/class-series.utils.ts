/** Segunda-feira da semana (UTC) que contém `ref`. */
export function startOfIsoWeek(ref: Date): Date {
  const d = utcDateOnly(ref);
  const day = d.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  return addDays(d, mondayOffset);
}

export function addDays(d: Date, n: number): Date {
  const x = utcDateOnly(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

/** Armazena o dia civil em UTC meio-dia (evita mudar dia em America/Sao_Paulo). */
export function utcDateOnly(ref: Date): Date {
  return new Date(
    Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate(), 12, 0, 0, 0),
  );
}

export function parseIsoDateOnly(iso: string): Date {
  const [y, m, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day, 12, 0, 0, 0));
}

/** Serializa @db.Date para YYYY-MM-DD (dia civil UTC). */
export function formatDateOnly(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** weekday ISO 1=Seg … 7=Dom (UTC). */
export function isoWeekdayFromDate(d: Date): number {
  const js = d.getUTCDay();
  return js === 0 ? 7 : js;
}

export type WeekdaysConvention = 'iso' | 'monday_zero';

/**
 * Normaliza dias da semana para ISO 1–7.
 * - iso: 1=Seg … 7=Dom (padrão documentado)
 * - monday_zero: 0=Seg … 6=Dom (comum em UI com Segunda como primeiro dia)
 */
export function normalizeWeekdaysToIso(
  weekdays: number[],
  convention: WeekdaysConvention = 'iso',
): number[] {
  const ints = [...new Set(weekdays.map((n) => Math.trunc(n)))];
  if (ints.length === 0) return [];

  if (convention === 'monday_zero') {
    return ints
      .filter((n) => n >= 0 && n <= 6)
      .map((n) => n + 1)
      .sort((a, b) => a - b);
  }

  return ints.filter((n) => n >= 1 && n <= 7).sort((a, b) => a - b);
}

/** Detecta convenção quando o cliente não informa (compatibilidade). */
export function inferWeekdaysConvention(weekdays: number[]): WeekdaysConvention {
  const ints = weekdays.map((n) => Math.trunc(n));
  if (ints.some((n) => n === 0)) return 'monday_zero';
  if (ints.some((n) => n === 7)) return 'iso';
  // Painel CT095 envia 0=Seg; omitir convention → monday_zero. API ISO: envie weekdaysConvention=iso
  return 'monday_zero';
}

/** weekday ISO 1=Seg … 7=Dom */
export function dateWithIsoWeekday(weekMonday: Date, isoWeekday: number): Date {
  return addDays(weekMonday, isoWeekday - 1);
}

export function startOfDay(d: Date): Date {
  return utcDateOnly(d);
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
      const key = formatDateOnly(dt);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(dt);
    }
  }

  return out.sort((a, b) => a.getTime() - b.getTime()).slice(0, 80);
}

export const WEEKDAY_LABELS_PT: Record<number, string> = {
  1: 'Segunda-feira',
  2: 'Terça-feira',
  3: 'Quarta-feira',
  4: 'Quinta-feira',
  5: 'Sexta-feira',
  6: 'Sábado',
  7: 'Domingo',
};
