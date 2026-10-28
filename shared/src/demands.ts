// Demandas de ciclo: trabalhos mais longos, feitos ao longo de vários dias, com meta
// de horas totais e, opcionalmente, uma data de conclusão.

import { addDays, formatDayMonth, isWorkday, type ISODate } from './cycle.ts';
import { unionMinutesByDay } from './metrics.ts';
import { formatDuration } from './time.ts';
import type { Activity } from './types.ts';

export const DEMAND_STATUSES = ['ativa', 'concluida'] as const;
export type DemandStatus = (typeof DEMAND_STATUSES)[number];

export interface Demand {
  id: number;
  title: string;
  description: string;
  /** Meta de horas totais, em minutos. */
  targetMinutes: number;
  startDate: ISODate;
  /** Data de conclusão desejada (opcional). */
  dueDate: ISODate | null;
  status: DemandStatus;
}

export type DemandInput = Omit<Demand, 'id'>;

/** A partir de quantos dias úteis antes do prazo a demanda entra em alerta. */
export const DEADLINE_WARNING_WORKDAYS = 2;

export type DemandProgress = 'nao_iniciada' | 'em_andamento' | 'atingida' | 'excedida';
export type DeadlineStatus = 'sem_prazo' | 'no_prazo' | 'proxima' | 'vence_hoje' | 'atrasada' | 'concluida';

export const PROGRESS_LABEL: Record<DemandProgress, string> = {
  nao_iniciada: 'Não iniciada',
  em_andamento: 'Em andamento',
  atingida: 'Meta atingida',
  excedida: 'Meta excedida',
};

export const DEADLINE_LABEL: Record<DeadlineStatus, string> = {
  sem_prazo: 'Sem prazo',
  no_prazo: 'No prazo',
  proxima: 'Prazo próximo',
  vence_hoje: 'Vence hoje',
  atrasada: 'Atrasada',
  concluida: 'Concluída',
};

export interface DemandMetrics {
  logged: number;
  target: number;
  remaining: number;
  excess: number;
  /** Horas apontadas ÷ meta, em % inteiro arredondado para baixo. */
  percent: number;
  progress: DemandProgress;
  diagnosis: string;
  deadline: DeadlineStatus;
  /** Dias úteis disponíveis até o prazo, contando hoje se for dia útil. */
  workdaysLeft: number | null;
  /** Minutos por dia útil necessários para cumprir a meta no prazo. */
  requiredPerDay: number | null;
  /** O que falta não cabe no prazo nem apontando a meta diária inteira (ou o prazo já venceu). */
  atRisk: boolean;
  /** Lembrete para o usuário quando o prazo está próximo, vence hoje, venceu ou está em risco. */
  reminder: string | null;
  activityCount: number;
  lastActivityDate: ISODate | null;
}

export interface DemandSummary extends Demand {
  metrics: DemandMetrics;
}

/** Dias úteis `d` com `from < d ≤ to`. */
export function workdaysBetween(from: ISODate, to: ISODate): number {
  let count = 0;
  for (let d = addDays(from, 1); d <= to; d = addDays(d, 1)) if (isWorkday(d)) count++;
  return count;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function demandMetrics(
  demand: Demand,
  activities: Pick<Activity, 'demandId' | 'date' | 'startMinute' | 'endMinute'>[],
  today: ISODate,
  dailyGoal: number,
): DemandMetrics {
  const ofDemand = activities.filter((a) => a.demandId === demand.id && a.endMinute > a.startMinute);
  const target = demand.targetMinutes;
  const logged = unionMinutesByDay(ofDemand);
  const remaining = Math.max(0, target - logged);
  const excess = Math.max(0, logged - target);

  let progress: DemandProgress;
  let diagnosis: string;
  if (logged === 0) {
    progress = 'nao_iniciada';
    diagnosis = `Nenhuma hora apontada. Meta de ${formatDuration(target)}`;
  } else if (logged < target) {
    progress = 'em_andamento';
    diagnosis = `Faltam ${formatDuration(remaining)} para a meta de ${formatDuration(target)}`;
  } else if (logged === target) {
    progress = 'atingida';
    diagnosis = `Meta de ${formatDuration(target)} atingida`;
  } else {
    progress = 'excedida';
    diagnosis = `Excedeu a meta de ${formatDuration(target)} em ${formatDuration(excess)}. Revise os apontamentos`;
  }

  const active = demand.status === 'ativa';
  const due = demand.dueDate;
  let deadline: DeadlineStatus;
  let workdaysLeft: number | null = null;
  let ahead = 0;

  if (!active) deadline = 'concluida';
  else if (!due) deadline = 'sem_prazo';
  else if (today > due) {
    deadline = 'atrasada';
    workdaysLeft = 0;
  } else {
    ahead = workdaysBetween(today, due);
    workdaysLeft = ahead + (isWorkday(today) ? 1 : 0);
    deadline = today === due ? 'vence_hoje' : ahead <= DEADLINE_WARNING_WORKDAYS ? 'proxima' : 'no_prazo';
  }

  const requiredPerDay =
    active && workdaysLeft && remaining > 0 ? Math.ceil(remaining / workdaysLeft) : null;
  const atRisk =
    active && due !== null && remaining > 0 && (workdaysLeft === 0 || remaining > (workdaysLeft ?? 0) * dailyGoal);

  let reminder: string | null = null;
  if (active && due) {
    const left =
      remaining > 0
        ? `Faltam ${formatDuration(remaining)}`
        : excess > 0
          ? `Meta de horas excedida em ${formatDuration(excess)}: revise os apontamentos e conclua a demanda`
          : 'Meta de horas atingida: marque a demanda como concluída';
    const pace = requiredPerDay ? `, cerca de ${formatDuration(requiredPerDay)} por dia útil` : '';
    if (deadline === 'atrasada') reminder = `Prazo venceu em ${formatDayMonth(due)}. ${left}.`;
    else if (deadline === 'vence_hoje') reminder = `Vence hoje. ${left}.`;
    else if (deadline === 'proxima')
      reminder = `Vence em ${plural(ahead, 'dia útil', 'dias úteis')} (${formatDayMonth(due)}). ${left}${pace}.`;
    else if (atRisk)
      reminder = `Faltam ${formatDuration(remaining)} em ${plural(workdaysLeft ?? 0, 'dia útil', 'dias úteis')}: não cabe nem com a meta diária inteira.`;
  }

  return {
    logged,
    target,
    remaining,
    excess,
    percent: target > 0 ? Math.floor((logged * 100) / target) : 0,
    progress,
    diagnosis,
    deadline,
    workdaysLeft,
    requiredPerDay,
    atRisk,
    reminder,
    activityCount: ofDemand.length,
    lastActivityDate: ofDemand.reduce<ISODate | null>((last, a) => (!last || a.date > last ? a.date : last), null),
  };
}

export function buildDemandSummary(
  demand: Demand,
  activities: Pick<Activity, 'demandId' | 'date' | 'startMinute' | 'endMinute'>[],
  today: ISODate,
  dailyGoal: number,
): DemandSummary {
  return { ...demand, metrics: demandMetrics(demand, activities, today, dailyGoal) };
}

const URGENCY: Record<DeadlineStatus, number> = {
  atrasada: 0,
  vence_hoje: 1,
  proxima: 2,
  no_prazo: 3,
  sem_prazo: 4,
  concluida: 5,
};

/** Ordena por urgência: atrasadas e próximas do prazo primeiro, concluídas por último. */
export function compareDemands(a: DemandSummary, b: DemandSummary): number {
  return (
    URGENCY[a.metrics.deadline] - URGENCY[b.metrics.deadline] ||
    (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') ||
    a.title.localeCompare(b.title, 'pt-BR')
  );
}
