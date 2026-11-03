// Rendimento: como o tempo do período se divide entre as categorias (e entre Tarefas e Ciclos) e como cada ciclo rendeu
// em relação ao período anterior. Só leitura dos apontamentos; nada é gravado.

import type { ISODate } from './cycle.ts';
import type { CycleStatus, DemandCategory, DemandKind } from './demands.ts';
import { unionMinutes } from './metrics.ts';
import type { PeriodWindow } from './period.ts';
import type { TimelineEntry } from './timeline.ts';
import type { Activity } from './types.ts';

type Logged = Pick<Activity, 'date' | 'startMinute' | 'endMinute' | 'demandId'>;

// ── Tempo por categoria (e Tarefas × Ciclos) ───────────────────────────────────

export type DemandFamily = 'tarefas' | 'ciclos';

/** Chamados, reuniões e treinamentos são Tarefas; a categoria `ciclo` é a família Ciclos. */
export function familyOf(category: DemandCategory): DemandFamily {
  return category === 'ciclo' ? 'ciclos' : 'tarefas';
}

/** Os grupos do tempo: as quatro categorias e os apontamentos antigos, sem demanda. */
export type SplitGroup = DemandCategory | 'semDemanda';
const GROUPS: readonly SplitGroup[] = ['chamado', 'reuniao', 'treinamento', 'ciclo', 'semDemanda'];

export interface SplitMinutes extends Record<SplitGroup, number> {
  /** Família Tarefas: chamado + reunião + treinamento. */
  tarefas: number;
  /** Família Ciclos: o mesmo que `ciclo`. */
  ciclos: number;
  /** Soma dos grupos; igual ao total do dia nas métricas (sobreposições contadas uma vez). */
  total: number;
}

export interface SplitDay extends SplitMinutes {
  date: ISODate;
}

export interface CategorySplit {
  days: SplitDay[];
  total: SplitMinutes;
  /** A família (Tarefas × Ciclos) com mais tempo e a sua fatia do total (%); nulo sem tempo ou em empate. */
  predominant: { family: DemandFamily; percent: number } | null;
}

/** Acrescenta as somas por família aos minutos de cada grupo. */
function withFamilies(minutes: Record<SplitGroup, number>, total: number): SplitMinutes {
  return { ...minutes, tarefas: minutes.chamado + minutes.reuniao + minutes.treinamento, ciclos: minutes.ciclo, total };
}

/**
 * Divide o tempo de um dia entre grupos. Dentro de um grupo, apontamentos sobrepostos contam uma vez
 * (união); o trecho em que grupos diferentes se sobrepõem é dividido igualmente entre eles. Os minutos
 * saem inteiros pelo maior resto, e a soma bate com o total do dia (a união de todos).
 */
function splitDay<G extends string>(ofDay: Logged[], groupOf: (a: Logged) => G, groups: readonly G[]) {
  const share = Object.fromEntries(groups.map((g) => [g, 0])) as Record<G, number>;
  const bounds = [...new Set(ofDay.flatMap((a) => [a.startMinute, a.endMinute]))].sort((x, y) => x - y);
  for (let i = 0; i < bounds.length - 1; i++) {
    const [from, to] = [bounds[i], bounds[i + 1]];
    const active = new Set(ofDay.filter((a) => a.startMinute <= from && a.endMinute >= to).map(groupOf));
    for (const g of active) share[g] += (to - from) / active.size;
  }

  // Maior resto: minutos inteiros que continuam somando o total do dia.
  const total = Math.round(groups.reduce((sum, g) => sum + share[g], 0));
  const minutes = Object.fromEntries(groups.map((g) => [g, Math.floor(share[g] + 1e-9)])) as Record<G, number>;
  let leftover = total - groups.reduce((sum, g) => sum + minutes[g], 0);
  for (const g of [...groups].sort((x, y) => share[y] - minutes[y] - (share[x] - minutes[x]))) {
    if (leftover-- > 0) minutes[g]++;
  }
  return { minutes, total };
}

/**
 * Divide o tempo de cada dia útil do período por categoria (chamados, reuniões, treinamentos e ciclos)
 * e "Sem demanda". Dentro de uma categoria, apontamentos sobrepostos contam uma vez (união); o trecho
 * em que categorias diferentes se sobrepõem é dividido igualmente entre elas. Assim a soma bate com o
 * total do dia (mesma regra da Distribuição, PLANO seção 6), em minutos inteiros. As famílias
 * (Tarefas × Ciclos) são a soma das suas categorias.
 */
export function categorySplit(
  activities: Logged[],
  demands: { id: number; category: DemandCategory }[],
  period: PeriodWindow,
): CategorySplit {
  const categories = new Map(demands.map((d) => [d.id, d.category]));
  const groupOf = (a: Logged): SplitGroup =>
    (a.demandId === null ? undefined : categories.get(a.demandId)) ?? 'semDemanda';
  const inPeriod = activities.filter((a) => a.endMinute > a.startMinute && period.workdays.includes(a.date));
  const byDay = Map.groupBy(inPeriod, (a) => a.date);

  const days = period.workdays.map((date): SplitDay => {
    const { minutes, total } = splitDay(byDay.get(date) ?? [], groupOf, GROUPS);
    return { date, ...withFamilies(minutes, total) };
  });

  const sums = Object.fromEntries(GROUPS.map((g) => [g, days.reduce((sum, d) => sum + d[g], 0)]));
  const total = withFamilies(sums as Record<SplitGroup, number>, days.reduce((sum, d) => sum + d.total, 0));
  const predominant =
    total.total > 0 && total.tarefas !== total.ciclos
      ? {
          family: (total.tarefas > total.ciclos ? 'tarefas' : 'ciclos') as DemandFamily,
          percent: Math.round((Math.max(total.tarefas, total.ciclos) * 100) / total.total),
        }
      : null;
  return { days, total, predominant };
}

// ── Trabalho não planejado (intempestivas) ─────────────────────────────────────

export interface UnplannedTime {
  /** Minutos em ciclos do tipo intempestiva. */
  minutes: number;
  /** Minutos apontados no período (sobreposições contadas uma vez). */
  total: number;
  /** Fatia do total, arredondada; nula sem tempo apontado. */
  percent: number | null;
}

/**
 * Quanto do tempo do período foi para trabalho não planejado: os ciclos do tipo intempestiva (só os
 * ciclos têm tipo). A sobreposição com outra demanda é dividida igualmente, como no tempo por categoria,
 * para o tempo intempestivo nunca passar do total do dia.
 */
export function unplannedTime(
  activities: Logged[],
  demands: { id: number; category: DemandCategory; kind?: DemandKind }[],
  period: PeriodWindow,
): UnplannedTime {
  const unplanned = new Set(demands.filter((d) => d.category === 'ciclo' && d.kind === 'intempestiva').map((d) => d.id));
  const groupOf = (a: Logged) => (a.demandId !== null && unplanned.has(a.demandId) ? 'intempestiva' : 'outras');
  const inPeriod = activities.filter((a) => a.endMinute > a.startMinute && period.workdays.includes(a.date));
  let minutes = 0;
  let total = 0;
  for (const ofDay of Map.groupBy(inPeriod, (a) => a.date).values()) {
    const day = splitDay(ofDay, groupOf, ['intempestiva', 'outras'] as const);
    minutes += day.minutes.intempestiva;
    total += day.total;
  }
  return { minutes, total, percent: total > 0 ? Math.round((minutes * 100) / total) : null };
}

/** O que `GET /api/yield` devolve. */
export interface YieldReport {
  period: PeriodWindow;
  previous: PeriodWindow;
  split: CategorySplit;
  unplanned: UnplannedTime;
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
