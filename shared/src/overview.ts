// Métricas de acompanhamento: o que foi concluído, o que está na fila e como andam os ciclos.
// Reuniões não têm status e ficam fora das contagens de tarefas.

import type { ISODate } from './cycle.ts';
import {
  workdaysBetween,
  type CycleStatus,
  type DeadlineStatus,
  type DemandSummary,
  type LastUpdate,
} from './demands.ts';
import { unionMinutesByDay } from './metrics.ts';
import type { Activity } from './types.ts';

/** Dias úteis sem nenhuma atualização a partir dos quais um ciclo aberto aparece como parado. */
export const STALLED_WORKDAYS = 3;

export interface Period {
  start: ISODate;
  end: ISODate;
}

export interface TaskCounts {
  /** Concluídas dentro do período. */
  completed: number;
  /** Na fila: ainda não iniciadas. */
  queued: number;
  /** Iniciadas ou em andamento. */
  inProgress: number;
}

export interface TaskOverview extends TaskCounts {
  byCategory: Record<'chamado' | 'treinamento', TaskCounts>;
}

const emptyCounts = (): TaskCounts => ({ completed: 0, queued: 0, inProgress: 0 });

/** Chamados e treinamentos: concluídas no período, na fila e em andamento (estas duas, agora). */
export function taskOverview(demands: DemandSummary[], period: Period): TaskOverview {
  const byCategory = { chamado: emptyCounts(), treinamento: emptyCounts() };
  for (const d of demands) {
    if (d.category !== 'chamado' && d.category !== 'treinamento') continue;
    const counts = byCategory[d.category];
    if (d.status === 'nao_iniciado') counts.queued++;
    else if (d.status === 'concluido') {
      if (d.completedAt && d.completedAt >= period.start && d.completedAt <= period.end) counts.completed++;
    } else counts.inProgress++;
  }
  const sum = (key: keyof TaskCounts) => byCategory.chamado[key] + byCategory.treinamento[key];
  return { completed: sum('completed'), queued: sum('queued'), inProgress: sum('inProgress'), byCategory };
}

export interface CycleProgress {
  id: number;
  label: string;
  status: CycleStatus;
  deadline: DeadlineStatus;
  /** Horas apontadas desde o início. */
  logged: number;
  /** Horas apontadas dentro do período. */
  loggedInPeriod: number;
  lastUpdate: LastUpdate | null;
  /** Dias úteis desde a última atualização; nulo se nunca houve. */
  idleWorkdays: number | null;
  stalled: boolean;
}

/** Ciclos abertos, na ordem recebida, com a última atualização e as horas apontadas. */
export function cycleProgress(
  demands: DemandSummary[],
  activities: Pick<Activity, 'demandId' | 'date' | 'startMinute' | 'endMinute'>[],
  period: Period,
  today: ISODate,
): CycleProgress[] {
  const result: CycleProgress[] = [];
  for (const d of demands) {
    if (d.category !== 'ciclo' || d.status === 'concluido' || d.status === 'cancelado') continue;
    const inPeriod = activities.filter(
      (a) => a.demandId === d.id && a.endMinute > a.startMinute && a.date >= period.start && a.date <= period.end,
    );
    const last = d.tracking.lastUpdate;
    const idle = last ? workdaysBetween(last.date, today) : null;
    result.push({
      id: d.id,
      label: d.label,
      status: d.status,
      deadline: d.metrics.deadline,
      logged: d.metrics.logged,
      loggedInPeriod: unionMinutesByDay(inPeriod),
      lastUpdate: last,
      idleWorkdays: idle,
      stalled: idle !== null && idle >= STALLED_WORKDAYS,
    });
  }
  return result;
}

export interface Overview {
  period: Period;
  tasks: TaskOverview;
  cycles: CycleProgress[];
}

export function buildOverview(
  demands: DemandSummary[],
  activities: Pick<Activity, 'demandId' | 'date' | 'startMinute' | 'endMinute'>[],
  period: Period,
  today: ISODate,
): Overview {
  return { period, tasks: taskOverview(demands, period), cycles: cycleProgress(demands, activities, period, today) };
}
