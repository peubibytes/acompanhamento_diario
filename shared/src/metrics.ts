// Réplica das fórmulas da planilha "Acompanhamento diário.xlsx".

import { getCycle, weekdayOf, WEEKDAY_LONG, WEEKDAY_SHORT, type ISODate } from './cycle.ts';
import { formatDiff, formatDuration, formatHM } from './time.ts';
import { WORKDAYS_PER_CYCLE, type Activity } from './types.ts';

export type Conformity = 'conforme' | 'nao_conforme' | 'pendente';

export const CONFORMITY_LABEL: Record<Conformity, string> = {
  conforme: 'Conforme',
  nao_conforme: 'Não conforme',
  pendente: 'Pendente',
};

export interface DayMetrics {
  date: ISODate;
  weekdayShort: string;
  weekdayLong: string;
  goal: number;
  /** Minutos apontados, contando uma única vez os períodos sobrepostos. */
  minutes: number;
  /** Minutos em sobreposição que deixaram de ser somados. */
  overlapMinutes: number;
  /** minutos apontados − meta */
  diff: number;
  /** Vazio quando não há apontamento, como na planilha. */
  diffLabel: string;
  activityCount: number;
  conformity: Conformity;
  /** Apontou mais que a meta: irregular, o apontamento precisa ser reajustado. */
  exceeded: boolean;
  diagnosis: string;
}

export interface WeekMetrics {
  goal: number;
  total: number;
  diff: number;
  diffLabel: string;
  activityCount: number;
  conformDays: number;
  /** Dias com apontamento acima da meta (irregulares). */
  exceededDays: number;
  /** Horas apontadas ÷ meta semanal, em % inteiro (arredondado para baixo: 100 só quando completo). */
  fillPercent: number;
  conformityLabel: string;
  diagnosis: string;
}

export interface CycleSummary {
  start: ISODate;
  end: ISODate;
  dailyGoal: number;
  days: DayMetrics[];
  week: WeekMetrics;
}

type Interval = Pick<Activity, 'startMinute' | 'endMinute'>;

export const durationOf = (a: Interval) => Math.max(0, a.endMinute - a.startMinute);

/**
 * Minutos cobertos pela união dos intervalos: períodos sobrepostos contam uma única vez.
 * Ex.: 08:00–10:00 e 09:00–11:00 → 180 min (e não 240).
 */
export function unionMinutes(intervals: Interval[]): number {
  const sorted = intervals.filter((i) => durationOf(i) > 0).sort((a, b) => a.startMinute - b.startMinute);
  let total = 0;
  let coveredUntil = -1;
  for (const { startMinute, endMinute } of sorted) {
    if (endMinute <= coveredUntil) continue;
    total += endMinute - Math.max(startMinute, coveredUntil);
    coveredUntil = endMinute;
  }
  return total;
}

/** Soma da união por dia: a mesma lógica aplicada a atividades de várias datas. */
export function unionMinutesByDay(activities: Pick<Activity, 'date' | 'startMinute' | 'endMinute'>[]): number {
  const byDay = Map.groupBy(activities, (a) => a.date);
  let total = 0;
  for (const ofDay of byDay.values()) total += unionMinutes(ofDay);
  return total;
}

export function dayMetrics(date: ISODate, activities: Activity[], goal: number): DayMetrics {
  const ofDay = activities.filter((a) => a.date === date);
  const minutes = unionMinutes(ofDay);
  const overlapMinutes = ofDay.reduce((sum, a) => sum + durationOf(a), 0) - minutes;
  const diff = minutes - goal;
  const wd = weekdayOf(date);

  let conformity: Conformity;
  let diagnosis: string;
  if (minutes === 0) {
    conformity = 'pendente';
    diagnosis = 'Sem apontamento';
  } else if (diff === 0) {
    conformity = 'conforme';
    diagnosis = `Meta ${formatDuration(goal)} atingida`;
  } else {
    conformity = 'nao_conforme';
    diagnosis =
      diff < 0
        ? `Faltam ${formatHM(diff)}`
        : `Excedeu a meta de ${formatDuration(goal)} em ${formatHM(diff)}. Reajuste o apontamento`;
  }

  return {
    date,
    weekdayShort: WEEKDAY_SHORT[wd],
    weekdayLong: WEEKDAY_LONG[wd],
    goal,
    minutes,
    overlapMinutes,
    diff,
    diffLabel: minutes === 0 ? '' : formatDiff(diff),
    activityCount: ofDay.filter((a) => durationOf(a) > 0).length,
    conformity,
    exceeded: minutes > 0 && diff > 0,
    diagnosis,
  };
}

export function weekMetrics(days: DayMetrics[], dailyGoal: number): WeekMetrics {
  const goal = dailyGoal * WORKDAYS_PER_CYCLE;
  const total = days.reduce((sum, d) => sum + d.minutes, 0);
  const conformDays = days.filter((d) => d.conformity === 'conforme').length;
  const allConform = conformDays === WORKDAYS_PER_CYCLE;

  return {
    goal,
    total,
    diff: total - goal,
    diffLabel: total === 0 ? '' : formatDiff(total - goal),
    activityCount: days.reduce((sum, d) => sum + d.activityCount, 0),
    conformDays,
    exceededDays: days.filter((d) => d.exceeded).length,
    fillPercent: goal > 0 ? Math.floor((total * 100) / goal) : 0,
    conformityLabel: allConform ? '100% conforme' : `${conformDays}/${WORKDAYS_PER_CYCLE} conformes`,
    diagnosis: allConform ? 'Meta total atingida' : 'Ajustes pendentes',
  };
}

export function buildCycleSummary(ref: ISODate, activities: Activity[], dailyGoal: number): CycleSummary {
  const cycle = getCycle(ref);
  const days = cycle.workdays.map((date) => dayMetrics(date, activities, dailyGoal));
  return {
    start: cycle.start,
    end: cycle.end,
    dailyGoal,
    days,
    week: weekMetrics(days, dailyGoal),
  };
}
