// Datas trafegam como texto ISO "YYYY-MM-DD". A aritmética é feita em UTC para
// não sofrer com fuso horário ou horário de verão.

export type ISODate = string;

const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
const FRIDAY = 5;

export const WEEKDAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const WEEKDAY_LONG = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
];

function toDate(iso: ISODate): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toISO(date: Date): ISODate {
  return date.toISOString().slice(0, 10);
}

export function isValidISODate(text: string): boolean {
  return ISO_PATTERN.test(text) && toISO(toDate(text)) === text;
}

/** Data de hoje no fuso local do usuário. */
export function todayISO(now = new Date()): ISODate {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function addDays(iso: ISODate, days: number): ISODate {
  return toISO(new Date(toDate(iso).getTime() + days * DAY_MS));
}

/** 0 = domingo … 6 = sábado. */
export function weekdayOf(iso: ISODate): number {
  return toDate(iso).getUTCDay();
}

export function isWorkday(iso: ISODate): boolean {
  const wd = weekdayOf(iso);
  return wd >= 1 && wd <= 5;
}

/** "2026-10-23" → "23/10". */
export function formatDayMonth(iso: ISODate): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

export interface Cycle {
  /** Sexta-feira que abre o ciclo. */
  start: ISODate;
  /** Quinta-feira que fecha o ciclo (dia do apontamento). */
  end: ISODate;
  /** Os 5 dias úteis: Sex, Seg, Ter, Qua, Qui. */
  workdays: ISODate[];
}

/** O ciclo vai de sexta a quinta; sábado e domingo pertencem ao ciclo da sexta anterior. */
export function getCycle(ref: ISODate): Cycle {
  const offset = (weekdayOf(ref) - FRIDAY + 7) % 7;
  const start = addDays(ref, -offset);
  return {
    start,
    end: addDays(start, 6),
    workdays: [0, 3, 4, 5, 6].map((n) => addDays(start, n)),
  };
}

/** Dias úteis do ciclo que ainda faltam depois de `today` (até a quinta). */
export function remainingWorkdays(cycle: Cycle, today: ISODate): number {
  return cycle.workdays.filter((d) => d > today).length;
}
