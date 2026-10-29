// Relatório diário para a daily ou o 1:1: o que foi feito, os impedimentos e o que será feito.
// Funções puras: o servidor reúne os dados; a tela só mostra e exporta.

import {
  addDays,
  formatDayMonth,
  isWorkday,
  WEEKDAY_SHORT,
  weekdayOf,
  type ISODate,
} from './cycle.ts';
import {
  compareDemands,
  CYCLE_STATUS_LABEL,
  DEADLINE_LABEL,
  DEMAND_CATEGORY_LABEL,
  DEMAND_EVENT_LABEL,
  isOpenDemand,
  statusChangeText,
  TASK_STATUS_LABEL,
  waitingWorkdays,
  type DemandBlocker,
  type DemandCategory,
  type DemandEvent,
  type DemandEventKind,
  type DemandStatusChange,
  type DemandSummary,
} from './demands.ts';
import { CONFORMITY_LABEL, dayMetrics, unionMinutes, type Conformity } from './metrics.ts';
import { formatDuration, formatHM } from './time.ts';
import type { Activity } from './types.ts';

/** Dia útil imediatamente anterior (sexta, para a segunda). */
export function previousWorkday(iso: ISODate): ISODate {
  let d = addDays(iso, -1);
  while (!isWorkday(d)) d = addDays(d, -1);
  return d;
}

/** Próximo dia útil depois da data (segunda, para a sexta). */
export function nextWorkday(iso: ISODate): ISODate {
  let d = addDays(iso, 1);
  while (!isWorkday(d)) d = addDays(d, 1);
  return d;
}

export interface ReportEntry {
  startMinute: number;
  endMinute: number;
  description: string;
  notes: string;
}

export interface ReportDoneItem {
  /** Nulo nos apontamentos antigos, sem demanda. */
  demandId: number | null;
  label: string;
  category: DemandCategory | null;
  /** Minutos apontados no dia (sobreposições contadas uma vez). */
  minutes: number;
  entries: ReportEntry[];
  /** Trocas de status no dia, ex.: "Em andamento → Concluído". */
  statusChanges: string[];
  /** Eventos da linha do tempo na data (só ciclos). */
  events: { kind: DemandEventKind; text: string }[];
}

export interface ReportBlockerItem {
  demandId: number;
  label: string;
  owner: string;
  description: string;
  since: ISODate;
  /** Resolvido até o dia do relatório; nulo se ainda estava aberto. */
  resolvedAt: ISODate | null;
  /** Dias úteis parado, de `since` até a resolução ou o dia do relatório. */
  waitingWorkdays: number;
}

export interface ReportNextItem {
  demandId: number;
  label: string;
  category: DemandCategory;
  detail: string;
}

export interface DailyReport {
  date: ISODate;
  done: {
    minutes: number;
    goal: number;
    conformity: Conformity;
    activityCount: number;
    /** Demandas com tempo apontado no dia, por tipo. */
    worked: Partial<Record<DemandCategory, number>>;
    /** Tarefas (chamados e treinamentos) que passaram a Concluído no dia. */
    completedTasks: number;
    items: ReportDoneItem[];
  };
  blockers: {
    open: number;
    opened: number;
    resolved: number;
    /** Maior espera, em dias úteis, entre os impedimentos abertos. */
    longestWait: number;
    items: ReportBlockerItem[];
  };
  /** Nulo quando não há demanda aberta (reuniões não contam). */
  next: {
    date: ISODate;
    items: ReportNextItem[];
    /** Tarefas ainda não iniciadas. */
    queued: number;
  } | null;
}

export interface DailyReportInput {
  date: ISODate;
  goal: number;
  /** Apontamentos do dia do relatório. */
  activities: Activity[];
  demands: DemandSummary[];
  events: DemandEvent[];
  blockers: DemandBlocker[];
  statusChanges: DemandStatusChange[];
}

export function buildDailyReport(input: DailyReportInput): DailyReport {
  const { date, demands } = input;
  const byId = new Map(demands.map((d) => [d.id, d]));
  const day = dayMetrics(date, input.activities, input.goal);

  // ── O que foi feito ──
  const items = new Map<string, ReportDoneItem>();
  const itemFor = (demandId: number | null, fallbackLabel = '') => {
    const demand = demandId === null ? undefined : byId.get(demandId);
    const key = demandId === null ? `projeto:${fallbackLabel}` : String(demandId);
    let item = items.get(key);
    if (!item) {
      item = {
        demandId,
        label: demand?.label ?? fallbackLabel,
        category: demand?.category ?? null,
        minutes: 0,
        entries: [],
        statusChanges: [],
        events: [],
      };
      items.set(key, item);
    }
    return item;
  };

  const ofDay = input.activities.filter((a) => a.date === date && a.endMinute > a.startMinute);
  for (const a of ofDay) {
    itemFor(a.demandId, a.project).entries.push({
      startMinute: a.startMinute,
      endMinute: a.endMinute,
      description: a.description,
      notes: a.notes,
    });
  }
  for (const item of items.values()) {
    item.entries.sort((x, y) => x.startMinute - y.startMinute);
    item.minutes = unionMinutes(
      ofDay.filter((a) => (item.demandId === null ? a.demandId === null && a.project === item.label : a.demandId === item.demandId)),
    );
  }
  // A declaração (from nulo) não é "feito"; só as trocas de status de quem já existia.
  for (const c of input.statusChanges) {
    if (c.date === date && c.from !== null && byId.has(c.demandId)) itemFor(c.demandId).statusChanges.push(statusChangeText(c));
  }
  for (const e of input.events) {
    if (e.date === date && byId.has(e.demandId)) itemFor(e.demandId).events.push({ kind: e.kind, text: e.text });
  }
  const doneItems = [...items.values()].sort((a, b) => b.minutes - a.minutes || a.label.localeCompare(b.label, 'pt-BR'));

  const worked: Partial<Record<DemandCategory, number>> = {};
  for (const i of doneItems) if (i.minutes > 0 && i.category) worked[i.category] = (worked[i.category] ?? 0) + 1;
  const completedTasks = demands.filter(
    (d) => (d.category === 'chamado' || d.category === 'treinamento') && d.completedAt === date,
  ).length;

  // ── Impedimentos: abertos no dia, mais os resolvidos nele ──
  const blockerItems: ReportBlockerItem[] = input.blockers
    .filter((b) => b.since <= date && (b.resolvedAt === null || b.resolvedAt >= date) && byId.has(b.demandId))
    .map((b) => ({
      demandId: b.demandId,
      label: byId.get(b.demandId)!.label,
      owner: b.owner,
      description: b.description,
      since: b.since,
      resolvedAt: b.resolvedAt !== null && b.resolvedAt <= date ? b.resolvedAt : null,
      waitingWorkdays: waitingWorkdays([b], date),
    }))
    .sort((a, b) => Number(a.resolvedAt !== null) - Number(b.resolvedAt !== null) || b.waitingWorkdays - a.waitingWorkdays);
  const stillOpen = blockerItems.filter((b) => b.resolvedAt === null);

  // ── O que será feito: demandas abertas (reuniões não entram) ──
  const nextDate = nextWorkday(date);
  const open = demands.filter((d) => d.category !== 'reuniao' && isOpenDemand(d));
  const inProgress = open
    .filter((d) => (d.category === 'chamado' || d.category === 'treinamento') && d.status !== 'nao_iniciado')
    .sort(compareDemands);
  const cycles = open.filter((d) => d.category === 'ciclo').sort(compareDemands);
  const queued = open.filter((d) => (d.category === 'chamado' || d.category === 'treinamento') && d.status === 'nao_iniciado').length;

  const nextItems: ReportNextItem[] = [
    ...inProgress.map((d) => ({
      demandId: d.id,
      label: d.label,
      category: d.category,
      detail: d.category === 'ciclo' || d.category === 'reuniao' ? '' : TASK_STATUS_LABEL[d.status],
    })),
    ...cycles.map((d) => {
      if (d.category !== 'ciclo') throw new Error('unreachable');
      const parts: string[] = [CYCLE_STATUS_LABEL[d.status]];
      if (d.dueDate) parts.push(`prazo ${formatDayMonth(d.dueDate)} (${DEADLINE_LABEL[d.metrics.deadline].toLowerCase()})`);
      if (d.tracking.openBlockers > 0) parts.push('impedimento aberto');
      return { demandId: d.id, label: d.label, category: d.category, detail: parts.join(' · ') };
    }),
  ];

  return {
    date,
    done: {
      minutes: day.minutes,
      goal: input.goal,
      conformity: day.conformity,
      activityCount: day.activityCount,
      worked,
      completedTasks,
      items: doneItems,
    },
    blockers: {
      open: stillOpen.length,
      opened: blockerItems.filter((b) => b.since === date).length,
      resolved: blockerItems.filter((b) => b.resolvedAt === date).length,
      longestWait: Math.max(0, ...stillOpen.map((b) => b.waitingWorkdays)),
      items: blockerItems,
    },
    next: nextItems.length + queued > 0 ? { date: nextDate, items: nextItems, queued } : null,
  };
}

// ── Markdown ──────────────────────────────────────────────────────────────────

const dayLabel = (iso: ISODate) => `${WEEKDAY_SHORT[weekdayOf(iso)]} ${formatDayMonth(iso)}`;
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export interface MarkdownOptions {
  /** Itens de "O que será feito" a deixar de fora: ids de demanda e 'fila' (a linha da fila). */
  skipNext?: ReadonlySet<number | 'fila'>;
  /** Data de hoje, para escrever "hoje" no título da última seção. */
  today?: ISODate;
}

export function dailyReportMarkdown(report: DailyReport, options: MarkdownOptions = {}): string {
  const lines: string[] = [`# Daily — ${dayLabel(report.date)}`, ''];

  // O que foi feito
  const d = report.done;
  lines.push('## O que foi feito');
  {
    const worked = Object.entries(d.worked)
      .map(([c, n]) => `${n} ${DEMAND_CATEGORY_LABEL[c as DemandCategory].toLowerCase()}${n === 1 ? '' : 's'}`)
      .join(', ');
    const summary = [
      d.activityCount === 0
        ? 'Nenhum apontamento neste dia'
        : `${formatDuration(d.minutes)} apontadas (meta ${formatDuration(d.goal)} · ${CONFORMITY_LABEL[d.conformity]})`,
      d.activityCount > 0 ? count(d.activityCount, 'apontamento', 'apontamentos') : '',
      worked,
      d.completedTasks > 0 ? count(d.completedTasks, 'tarefa concluída', 'tarefas concluídas') : '',
    ].filter(Boolean);
    lines.push(summary.join(' · '));
    if (d.items.length > 0) lines.push('');
    for (const item of d.items) {
      const category = item.category ? ` (${DEMAND_CATEGORY_LABEL[item.category]})` : '';
      const head = [item.minutes > 0 ? formatDuration(item.minutes) : '', ...item.statusChanges].filter(Boolean).join(' · ');
      lines.push(`- **${item.label}**${category}${head ? ` — ${head}` : ''}`);
      for (const e of item.entries) {
        const text = [e.description, e.notes && `↳ ${e.notes}`].filter(Boolean).join(' ');
        lines.push(`  - ${formatHM(e.startMinute)}–${formatHM(e.endMinute)}${text ? ` ${text}` : ''}`);
      }
      for (const e of item.events) lines.push(`  - ${DEMAND_EVENT_LABEL[e.kind]}: ${e.text}`);
    }
  }
  lines.push('');

  // Impedimentos
  const b = report.blockers;
  lines.push('## Impedimentos');
  if (b.items.length === 0) {
    lines.push('Sem impedimentos.');
  } else {
    const parts = [
      count(b.open, 'aberto', 'abertos'),
      count(b.opened, 'novo', 'novos'),
      count(b.resolved, 'resolvido', 'resolvidos'),
    ];
    if (b.open > 0) parts.push(`maior espera: ${count(b.longestWait, 'dia útil', 'dias úteis')}`);
    lines.push(parts.join(' · '), '');
    for (const i of b.items) {
      const state = i.resolvedAt ? `resolvido em ${formatDayMonth(i.resolvedAt)}` : `desde ${formatDayMonth(i.since)}`;
      const wait = count(i.waitingWorkdays, 'dia útil', 'dias úteis');
      lines.push(`- **${i.label}** — ${i.owner} ${state} (${wait})${i.description ? `: ${i.description}` : ''}`);
    }
  }
  lines.push('');

  // O que será feito
  if (report.next) {
    const skip = options.skipNext ?? new Set();
    const items = report.next.items.filter((i) => !skip.has(i.demandId));
    const showQueue = report.next.queued > 0 && !skip.has('fila');
    if (items.length > 0 || showQueue) {
      const when = report.next.date === options.today ? 'hoje' : `em ${dayLabel(report.next.date)}`;
      lines.push(`## O que será feito ${when}${when === 'hoje' ? ` (${dayLabel(report.next.date)})` : ''}`);
      for (const i of items) {
        lines.push(`- **${i.label}** (${DEMAND_CATEGORY_LABEL[i.category]})${i.detail ? ` — ${i.detail}` : ''}`);
      }
      if (showQueue) lines.push(`- Na fila: ${count(report.next.queued, 'tarefa', 'tarefas')}`);
      lines.push('');
    }
  }

  return `${lines.join('\n').trimEnd()}\n`;
}
