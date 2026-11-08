// Rendimento: como o tempo do período se divide entre as categorias (e entre Tarefas e Ciclos) e quanto foi para
// trabalho não planejado. Só leitura dos apontamentos; nada é gravado.

import type { ISODate } from './cycle.ts';
import type { DemandCategory, DemandKind } from './demands.ts';
import type { PeriodWindow } from './period.ts';
import type { Activity } from './types.ts';

type Logged = Pick<Activity, 'date' | 'startMinute' | 'endMinute' | 'demandId'>;

// ── Tempo por categoria (e Tarefas × Ciclos) ───────────────────────────────────

export type DemandFamily = 'tarefas' | 'ciclos';

/** Chamados, reuniões, treinamentos e atividades são Tarefas; a categoria `ciclo` é a família Ciclos. */
export function familyOf(category: DemandCategory): DemandFamily {
  return category === 'ciclo' ? 'ciclos' : 'tarefas';
}

/** Os grupos do tempo: as quatro categorias e os apontamentos antigos, sem demanda. */
export type SplitGroup = DemandCategory | 'semDemanda';
const GROUPS: readonly SplitGroup[] = ['chamado', 'reuniao', 'treinamento', 'atividade', 'ciclo', 'semDemanda'];

export interface SplitMinutes extends Record<SplitGroup, number> {
  /** Família Tarefas: chamado + reunião + treinamento + atividade. */
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
  /**
   * A categoria com mais tempo no período e a sua fatia do total apontado (%). Em empate no topo, todas as empatadas, na
   * ordem da legenda. "Sem demanda" não concorre (mas conta no total). Nulo sem tempo apontado.
   */
  predominant: { categories: DemandCategory[]; percent: number } | null;
}

/** Acrescenta as somas por família aos minutos de cada grupo. */
function withFamilies(minutes: Record<SplitGroup, number>, total: number): SplitMinutes {
  return { ...minutes, tarefas: minutes.chamado + minutes.reuniao + minutes.treinamento + minutes.atividade, ciclos: minutes.ciclo, total };
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

/** Categorias que concorrem ao "Predominou": as cinco que o colaborador escolhe, na ordem da legenda. */
const CONTENDERS = GROUPS.filter((g): g is DemandCategory => g !== 'semDemanda');

function predominantOf(total: SplitMinutes): CategorySplit['predominant'] {
  if (total.total <= 0) return null;
  const top = Math.max(...CONTENDERS.map((c) => total[c]));
  if (top <= 0) return null; // só apontamentos sem demanda
  return { categories: CONTENDERS.filter((c) => total[c] === top), percent: Math.round((top * 100) / total.total) };
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
  return { days, total, predominant: predominantOf(total) };
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
  split: CategorySplit;
  unplanned: UnplannedTime;
}
