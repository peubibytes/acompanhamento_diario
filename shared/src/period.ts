// Período: a janela de tempo dos indicadores. Na interface é o antigo "ciclo de apontamento"
// (sexta → quinta, a escala `week`); a escala `month` é o mês civil, só com os dias úteis Seg–Sex.
// Código e API mantêm o nome histórico `cycle` (ver docs/decisions/0005).

import { addDays, formatDayMonth, getCycle, isWorkday, type ISODate } from './cycle.ts';

export const PERIOD_SCALES = ['week', 'month'] as const;
export type PeriodScale = (typeof PERIOD_SCALES)[number];

export interface PeriodWindow {
  scale: PeriodScale;
  start: ISODate;
  end: ISODate;
  /** Dias úteis do período: Sex–Qui na semana, Seg–Sex no mês. */
  workdays: ISODate[];
}

const MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

const pad = (n: number) => String(n).padStart(2, '0');
const monthOf = (iso: ISODate) => ({ year: Number(iso.slice(0, 4)), month: Number(iso.slice(5, 7)) });
const firstOfMonth = (year: number, month: number): ISODate => `${year}-${pad(month)}-01`;
/** Dia 0 do mês seguinte é o último dia do mês. */
const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

export function getPeriod(ref: ISODate, scale: PeriodScale): PeriodWindow {
  if (scale === 'week') {
    const cycle = getCycle(ref);
    return { scale, start: cycle.start, end: cycle.end, workdays: cycle.workdays };
  }
  const { year, month } = monthOf(ref);
  const start = firstOfMonth(year, month);
  const end = `${year}-${pad(month)}-${pad(daysInMonth(year, month))}`;
  const workdays: ISODate[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) if (isWorkday(d)) workdays.push(d);
  return { scale, start, end, workdays };
}

/**
 * Data de referência do período `delta` períodos adiante (negativo = para trás): a sexta que abre a
 * semana ou o dia 1º do mês. Ancorar no início evita pular meses curtos (31/03 − 1 mês).
 */
export function shiftPeriod(ref: ISODate, scale: PeriodScale, delta: number): ISODate {
  if (scale === 'week') return addDays(getCycle(ref).start, delta * 7);
  const { year, month } = monthOf(ref);
  const index = year * 12 + (month - 1) + delta;
  return firstOfMonth(Math.floor(index / 12), (index % 12) + 1);
}

/**
 * Dia em que as ações do período se ancoram (a meta, o link para Apontamentos): hoje, se cair no
 * período; senão o último dia útil de um período passado ou o primeiro de um futuro.
 */
export function anchorDate(period: PeriodWindow, today: ISODate): ISODate {
  if (today >= period.start && today <= period.end) return today;
  return today > period.end ? period.workdays.at(-1)! : period.workdays[0];
}

/** O período equivalente imediatamente anterior (mesma escala). */
export function previousPeriod(period: PeriodWindow): PeriodWindow {
  return getPeriod(shiftPeriod(period.start, period.scale, -1), period.scale);
}

/** Semana: "Sex 30/10 → Qui 05/11"; mês: "Outubro de 2026". */
export function formatPeriodLabel(period: PeriodWindow): string {
  if (period.scale === 'week') return `Sex ${formatDayMonth(period.start)} → Qui ${formatDayMonth(period.end)}`;
  const { year, month } = monthOf(period.start);
  return `${MONTH_NAMES[month - 1]} de ${year}`;
}
