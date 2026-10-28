// Distribuição do tempo de um dia por demanda: base do gráfico de pizza do painel.

import type { Activity } from './types.ts';

export interface BreakdownSlice {
  key: string;
  label: string;
  /** Apontamentos de uma demanda, ou agrupados pelo projeto nos antigos, sem demanda. */
  kind: 'demanda' | 'projeto' | 'outros';
  demandId: number | null;
  minutes: number;
  activityCount: number;
  /** Fatia do total do dia, em % (0–100, sem arredondar). */
  share: number;
}

export interface DayBreakdown {
  /** Minutos do dia, contando sobreposições uma única vez (igual a DayMetrics.minutes). */
  total: number;
  /** Fatias da maior para a menor. */
  slices: BreakdownSlice[];
  /** Houve trecho sobreposto, dividido igualmente entre os apontamentos simultâneos. */
  overlapSplit: boolean;
}

type Input = Pick<Activity, 'date' | 'startMinute' | 'endMinute' | 'project' | 'demandId'>;

function groupOf(a: Input, titles: Map<number, string>) {
  if (a.demandId !== null && titles.has(a.demandId)) {
    return { key: `demanda:${a.demandId}`, label: titles.get(a.demandId)!, kind: 'demanda' as const, demandId: a.demandId };
  }
  const label = a.project.trim();
  return { key: `projeto:${label.toLocaleLowerCase('pt-BR')}`, label, kind: 'projeto' as const, demandId: null };
}

/**
 * Agrupa o tempo por demanda (ou por projeto, nos apontamentos antigos sem demanda). Em cada
 * trecho de tempo, os minutos são divididos igualmente entre os apontamentos que o ocupam; assim a
 * soma das fatias é exatamente o total do dia, sem contar sobreposições duas vezes.
 */
export function dayBreakdown(activities: Input[], demands: { id: number; label: string }[]): DayBreakdown {
  const titles = new Map(demands.map((d) => [d.id, d.label]));
  const valid = activities.filter((a) => a.endMinute > a.startMinute);
  const raw = new Map<string, ReturnType<typeof groupOf> & { minutes: number; activityCount: number }>();
  let overlapSplit = false;

  for (const a of valid) {
    const g = groupOf(a, titles);
    const entry = raw.get(g.key) ?? { ...g, minutes: 0, activityCount: 0 };
    entry.activityCount++;
    raw.set(g.key, entry);
  }

  for (const ofDay of Map.groupBy(valid, (a) => a.date).values()) {
    const bounds = [...new Set(ofDay.flatMap((a) => [a.startMinute, a.endMinute]))].sort((x, y) => x - y);
    for (let i = 0; i < bounds.length - 1; i++) {
      const [from, to] = [bounds[i], bounds[i + 1]];
      const active = ofDay.filter((a) => a.startMinute <= from && a.endMinute >= to);
      if (active.length === 0) continue;
      if (active.length > 1) overlapSplit = true;
      for (const a of active) raw.get(groupOf(a, titles).key)!.minutes += (to - from) / active.length;
    }
  }

  const entries = [...raw.values()];
  const total = Math.round(entries.reduce((sum, e) => sum + e.minutes, 0));

  // Maior resto: arredonda para minutos inteiros mantendo a soma igual ao total.
  const floors = entries.map((e) => Math.floor(e.minutes + 1e-9));
  let leftover = total - floors.reduce((s, f) => s + f, 0);
  entries
    .map((e, i) => ({ i, rest: e.minutes - floors[i] }))
    .sort((x, y) => y.rest - x.rest)
    .forEach(({ i }) => {
      if (leftover > 0) {
        floors[i]++;
        leftover--;
      }
    });

  const slices = entries
    .map((e, i) => ({
      key: e.key,
      label: e.label,
      kind: e.kind,
      demandId: e.demandId,
      minutes: floors[i],
      activityCount: e.activityCount,
      share: total > 0 ? (floors[i] * 100) / total : 0,
    }))
    .sort((x, y) => y.minutes - x.minutes || x.label.localeCompare(y.label, 'pt-BR'));

  return { total, slices, overlapSplit };
}

/** Mantém as maiores fatias e junta o restante em "Outros", para a pizza continuar legível. */
export function foldSlices(slices: BreakdownSlice[], max = 6): BreakdownSlice[] {
  if (slices.length <= max) return slices;
  const kept = slices.slice(0, max - 1);
  const rest = slices.slice(max - 1);
  return [
    ...kept,
    {
      key: 'outros',
      label: `Outros (${rest.length})`,
      kind: 'outros',
      demandId: null,
      minutes: rest.reduce((s, x) => s + x.minutes, 0),
      activityCount: rest.reduce((s, x) => s + x.activityCount, 0),
      share: rest.reduce((s, x) => s + x.share, 0),
    },
  ];
}
