// Rendimento: como o tempo do período se divide entre Tarefas e Ciclos e como cada ciclo rendeu
// em relação ao período anterior. Só leitura dos apontamentos; nada é gravado.

import type { ISODate } from './cycle.ts';
import type { DemandCategory, CycleStatus } from './demands.ts';
import { unionMinutes } from './metrics.ts';
import type { PeriodWindow } from './period.ts';
import type { TimelineEntry } from './timeline.ts';
import type { Activity } from './types.ts';

type Logged = Pick<Activity, 'date' | 'startMinute' | 'endMinute' | 'demandId'>;

// ── Tarefas × Ciclos ───────────────────────────────────────────────────────────

export type DemandFamily = 'tarefas' | 'ciclos';

/** Chamados, reuniões e treinamentos são Tarefas; a categoria `ciclo` é a família Ciclos. */
export function familyOf(category: DemandCategory): DemandFamily {
  return category === 'ciclo' ? 'ciclos' : 'tarefas';
}

/** Os três grupos do tempo: as duas famílias e os apontamentos antigos, sem demanda. */
type Group = DemandFamily | 'semDemanda';
const GROUPS: readonly Group[] = ['tarefas', 'ciclos', 'semDemanda'];

export interface FamilyMinutes {
  tarefas: number;
  ciclos: number;
  /** Apontamentos anteriores à v0.5, sem demanda. */
  semDemanda: number;
  /** Soma dos três; igual ao total do dia nas métricas (sobreposições contadas uma vez). */
  total: number;
}

export interface FamilySplitDay extends FamilyMinutes {
  date: ISODate;
}

export interface FamilySplit {
  days: FamilySplitDay[];
  total: FamilyMinutes;
  /** A família com mais tempo e a sua fatia do total (%); nulo sem tempo ou em empate. */
  predominant: { family: DemandFamily; percent: number } | null;
}

const emptyMinutes = (): FamilyMinutes => ({ tarefas: 0, ciclos: 0, semDemanda: 0, total: 0 });

/**
 * Divide o tempo de cada dia útil do período em Tarefas, Ciclos e "Sem demanda". Dentro de um grupo,
 * apontamentos sobrepostos contam uma vez (união); o trecho em que grupos diferentes se sobrepõem é
 * dividido igualmente entre eles. Assim a soma bate com o total do dia (mesma regra da Distribuição,
 * PLANO seção 6), em minutos inteiros.
 */
export function familySplit(
  activities: Logged[],
  demands: { id: number; category: DemandCategory }[],
  period: PeriodWindow,
): FamilySplit {
  const categories = new Map(demands.map((d) => [d.id, d.category]));
  const groupOf = (a: Logged): Group => {
    const category = a.demandId === null ? undefined : categories.get(a.demandId);
    return category === undefined ? 'semDemanda' : familyOf(category);
  };
  const inPeriod = activities.filter((a) => a.endMinute > a.startMinute && period.workdays.includes(a.date));
  const byDay = Map.groupBy(inPeriod, (a) => a.date);

  const days = period.workdays.map((date): FamilySplitDay => {
    const ofDay = byDay.get(date) ?? [];
    const share: Record<Group, number> = { tarefas: 0, ciclos: 0, semDemanda: 0 };
    const bounds = [...new Set(ofDay.flatMap((a) => [a.startMinute, a.endMinute]))].sort((x, y) => x - y);
    for (let i = 0; i < bounds.length - 1; i++) {
      const [from, to] = [bounds[i], bounds[i + 1]];
      const active = new Set(ofDay.filter((a) => a.startMinute <= from && a.endMinute >= to).map(groupOf));
      for (const g of active) share[g] += (to - from) / active.size;
    }

    // Maior resto: minutos inteiros que continuam somando o total do dia.
    const total = Math.round(GROUPS.reduce((sum, g) => sum + share[g], 0));
    const minutes: Record<Group, number> = { tarefas: 0, ciclos: 0, semDemanda: 0 };
    for (const g of GROUPS) minutes[g] = Math.floor(share[g] + 1e-9);
    let leftover = total - GROUPS.reduce((sum, g) => sum + minutes[g], 0);
    for (const g of [...GROUPS].sort((x, y) => share[y] - minutes[y] - (share[x] - minutes[x]))) {
      if (leftover-- > 0) minutes[g]++;
    }
    return { date, ...minutes, total };
  });

  const total = days.reduce(
    (sum, d) => ({
      tarefas: sum.tarefas + d.tarefas,
      ciclos: sum.ciclos + d.ciclos,
      semDemanda: sum.semDemanda + d.semDemanda,
      total: sum.total + d.total,
    }),
    emptyMinutes(),
  );
  const predominant =
    total.total > 0 && total.tarefas !== total.ciclos
      ? {
          family: (total.tarefas > total.ciclos ? 'tarefas' : 'ciclos') as DemandFamily,
          percent: Math.round((Math.max(total.tarefas, total.ciclos) * 100) / total.total),
        }
      : null;
  return { days, total, predominant };
}

/** O que `GET /api/yield` devolve. */
export interface YieldReport {
  period: PeriodWindow;
  previous: PeriodWindow;
  split: FamilySplit;
  cycles: CycleYield[];
}

// ── Rendimento por ciclo ───────────────────────────────────────────────────────

/** O que o rendimento precisa saber de um ciclo (vem do resumo da demanda). */
export interface YieldCycle {
  id: number;
  label: string;
  status: CycleStatus;
  startDate: ISODate;
}

export interface CycleYieldDay {
  date: ISODate;
  minutes: number;
  /**
   * Média, em minutos, dos dias úteis anteriores do período que tiveram apontamento neste ciclo;
   * nula enquanto não houve nenhum.
   */
  priorAverage: number | null;
}

export interface CycleYield {
  id: number;
  label: string;
  open: boolean;
  days: CycleYieldDay[];
  total: number;
  /** Total no período anterior equivalente (mês anterior ou semana anterior). */
  previousTotal: number;
  change: {
    minutes: number;
    /** Variação sobre o período anterior, em % inteiro; nula se o anterior for 0. */
    percent: number | null;
  };
  /** Registros da linha do tempo no período: eventos, e início e resolução de impedimentos. */
  timelineCount: number;
}

const isOpen = (c: YieldCycle) => c.status !== 'concluido' && c.status !== 'cancelado';

function minutesByDay(activities: Logged[], workdays: ISODate[]): number[] {
  const byDay = Map.groupBy(activities, (a) => a.date);
  return workdays.map((date) => unionMinutes(byDay.get(date) ?? []));
}

/**
 * Rendimento de cada ciclo com apontamento ou registro no período, ou ainda aberto (e já iniciado):
 * horas por dia útil, total, variação sobre o período anterior e a média dos dias anteriores.
 * Do maior total para o menor. `timeline` são os registros da linha do tempo (buildTimeline).
 */
export function cycleYield(
  cycles: YieldCycle[],
  activities: Logged[],
  timeline: TimelineEntry[],
  period: PeriodWindow,
  previous: PeriodWindow,
): CycleYield[] {
  const valid = activities.filter((a) => a.endMinute > a.startMinute);
  const inRange = (date: ISODate | null) => date !== null && date >= period.start && date <= period.end;

  const result: CycleYield[] = [];
  for (const c of cycles) {
    const own = valid.filter((a) => a.demandId === c.id);
    const minutes = minutesByDay(own, period.workdays);
    const total = minutes.reduce((sum, m) => sum + m, 0);
    const timelineCount = timeline
      .filter((e) => e.demandId === c.id)
      .reduce((sum, e) => sum + Number(inRange(e.date)) + Number(e.source === 'impedimento' && inRange(e.resolvedAt)), 0);
    const startedOpen = isOpen(c) && c.startDate <= period.end;
    if (total === 0 && timelineCount === 0 && !startedOpen) continue;

    const previousTotal = minutesByDay(own, previous.workdays).reduce((sum, m) => sum + m, 0);
    const days = period.workdays.map((date, i): CycleYieldDay => {
      const earlier = minutes.slice(0, i).filter((m) => m > 0);
      const priorAverage = earlier.length > 0 ? Math.round(earlier.reduce((s, m) => s + m, 0) / earlier.length) : null;
      return { date, minutes: minutes[i], priorAverage };
    });
    result.push({
      id: c.id,
      label: c.label,
      open: isOpen(c),
      days,
      total,
      previousTotal,
      change: {
        minutes: total - previousTotal,
        percent: previousTotal > 0 ? Math.round(((total - previousTotal) * 100) / previousTotal) : null,
      },
      timelineCount,
    });
  }
  return result.sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, 'pt-BR'));
}
