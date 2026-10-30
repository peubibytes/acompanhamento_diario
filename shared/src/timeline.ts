// Linha do tempo unificada dos ciclos: eventos (ação, decisão, validação, deploy…) e impedimentos
// numa só lista, para filtrar, marcar com bandeira e analisar. A tabela de impedimentos continua
// sendo a fonte da espera, do relatório e dos lembretes; aqui eles só aparecem junto dos eventos.

import { workdaysBetween, waitingWorkdays, DEMAND_EVENT_KINDS, type DemandBlocker, type DemandEvent, type DemandEventKind } from './demands.ts';
import type { ISODate } from './cycle.ts';

export interface TimelineEntry {
  /** Único na lista: "evento:12" ou "impedimento:3". */
  key: string;
  source: 'evento' | 'impedimento';
  /** Id na tabela de origem (rotas de marcação e exclusão). */
  id: number;
  demandId: number;
  /** Nome do ciclo. */
  demandLabel: string;
  /** Data do evento; no impedimento, o início. */
  date: ISODate;
  /** No impedimento é sempre 'impedimento'. */
  kind: DemandEventKind;
  /** O texto do evento; no impedimento, a descrição (pode ser vazia). */
  text: string;
  flagged: boolean;
  /** Só nos impedimentos. */
  owner: string | null;
  resolvedAt: ISODate | null;
  /** Dias úteis de espera até a resolução ou até hoje; só nos impedimentos. */
  waitingWorkdays: number | null;
}

/** Eventos e impedimentos juntos, do mais recente para o mais antigo. */
export function buildTimeline(
  events: DemandEvent[],
  blockers: DemandBlocker[],
  today: ISODate,
  labelOf: (demandId: number) => string | undefined,
): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  for (const e of events) {
    const label = labelOf(e.demandId);
    if (label === undefined) continue;
    entries.push({
      key: `evento:${e.id}`,
      source: 'evento',
      id: e.id,
      demandId: e.demandId,
      demandLabel: label,
      date: e.date,
      kind: e.kind,
      text: e.text,
      flagged: e.flagged,
      owner: null,
      resolvedAt: null,
      waitingWorkdays: null,
    });
  }
  for (const b of blockers) {
    const label = labelOf(b.demandId);
    if (label === undefined) continue;
    entries.push({
      key: `impedimento:${b.id}`,
      source: 'impedimento',
      id: b.id,
      demandId: b.demandId,
      demandLabel: label,
      date: b.since,
      kind: 'impedimento',
      text: b.description,
      flagged: b.flagged,
      owner: b.owner,
      resolvedAt: b.resolvedAt,
      waitingWorkdays: waitingWorkdays([b], today),
    });
  }
  // Mesma data: impedimentos antes dos eventos; depois, o cadastro mais novo primeiro.
  return entries.sort(
    (a, b) =>
      b.date.localeCompare(a.date) || Number(b.source === 'impedimento') - Number(a.source === 'impedimento') || b.id - a.id,
  );
}

export interface TimelineFilter {
  /** Ciclos a considerar; vazio ou ausente = todos. */
  demandIds?: ReadonlySet<number>;
  /** Tipos a considerar; vazio ou ausente = todos. */
  kinds?: ReadonlySet<DemandEventKind>;
  flaggedOnly?: boolean;
}

export function filterTimeline(entries: TimelineEntry[], filter: TimelineFilter): TimelineEntry[] {
  return entries.filter(
    (e) =>
      (!filter.demandIds?.size || filter.demandIds.has(e.demandId)) &&
      (!filter.kinds?.size || filter.kinds.has(e.kind)) &&
      (!filter.flaggedOnly || e.flagged),
  );
}

export interface TimelineMetrics {
  total: number;
  byKind: Record<DemandEventKind, number>;
  flagged: number;
  openBlockers: number;
  /** Maior espera, em dias úteis, entre os impedimentos abertos. */
  longestWait: number;
  /** Data do registro mais recente; nula se a lista é vazia. */
  lastDate: ISODate | null;
  /** Dias úteis desde o registro mais recente. */
  idleWorkdays: number | null;
}

export function timelineMetrics(entries: TimelineEntry[], today: ISODate): TimelineMetrics {
  const byKind = Object.fromEntries(DEMAND_EVENT_KINDS.map((k) => [k, 0])) as Record<DemandEventKind, number>;
  let flagged = 0;
  let openBlockers = 0;
  let longestWait = 0;
  let lastDate: ISODate | null = null;
  for (const e of entries) {
    byKind[e.kind]++;
    if (e.flagged) flagged++;
    if (e.source === 'impedimento' && e.resolvedAt === null) {
      openBlockers++;
      longestWait = Math.max(longestWait, e.waitingWorkdays ?? 0);
    }
    // A resolução também é um registro: o impedimento "andou" nesse dia.
    for (const d of [e.date, e.resolvedAt]) if (d && (!lastDate || d > lastDate)) lastDate = d;
  }
  return {
    total: entries.length,
    byKind,
    flagged,
    openBlockers,
    longestWait,
    lastDate,
    idleWorkdays: lastDate ? workdaysBetween(lastDate, today) : null,
  };
}
