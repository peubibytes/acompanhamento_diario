// Relatório diário para a daily ou o 1:1: o que foi feito, os impedimentos e o que será feito.
// Quem lê é a gestão e a equipe: importa quais ciclos andaram, quais tarefas foram trabalhadas ou
// concluídas e quantas reuniões houve — não horários, horas apontadas nem conformidade (isso é do
// módulo de Apontamento). Funções puras: o servidor reúne os dados; a tela só mostra e exporta.

import { addDays, formatDayMonth, isWorkday, WEEKDAY_SHORT, weekdayOf, type ISODate } from './cycle.ts';
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
  type DemandEvent,
  type DemandStatusChange,
  type DemandSummary,
} from './demands.ts';
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

/** Um ciclo ou uma tarefa trabalhada no dia. */
export interface ReportWorkItem {
  demandId: number;
  label: string;
  category: 'ciclo' | 'chamado' | 'treinamento';
  /** Complemento curto (o começo da descrição), para quem não sabe de cor o que é o número. */
  subtitle: string;
  /** Situação: a troca de status do dia (ex.: "Em andamento → Concluído") ou o status atual. */
  status: string;
  /** Trocou de status no dia. */
  changed: boolean;
  /** O que andou: o "o que foi feito" dos apontamentos (sem repetir) e os eventos do dia. */
  progress: string[];
}

export interface ReportMeeting {
  demandId: number;
  label: string;
  participants: string;
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
  category: 'ciclo' | 'chamado' | 'treinamento';
  detail: string;
}

export interface DailyReport {
  date: ISODate;
  done: {
    cycles: ReportWorkItem[];
    tasks: ReportWorkItem[];
    meetings: ReportMeeting[];
    /** Tarefas (chamados e treinamentos) que passaram a Concluído no dia. */
    completedTasks: number;
  };
  blockers: {
    open: number;
    resolved: number;
    items: ReportBlockerItem[];
  };
  /** Nulo quando não há demanda aberta (reuniões não contam). */
  next: {
    date: ISODate;
    cycles: ReportNextItem[];
    tasks: ReportNextItem[];
    /** Tarefas ainda não iniciadas. */
    queued: number;
  } | null;
}

export interface DailyReportInput {
  date: ISODate;
  /** Apontamentos do dia do relatório. */
  activities: Activity[];
  demands: DemandSummary[];
  events: DemandEvent[];
  blockers: DemandBlocker[];
  statusChanges: DemandStatusChange[];
}

const SUBTITLE_MAX = 80;
const shorten = (text: string) => (text.length > SUBTITLE_MAX ? `${text.slice(0, SUBTITLE_MAX - 1)}…` : text);

/** Status atual, com o rótulo de cada família. */
function currentStatus(d: DemandSummary): string {
  if (d.category === 'ciclo') return CYCLE_STATUS_LABEL[d.status];
  if (d.category === 'reuniao') return '';
  return TASK_STATUS_LABEL[d.status];
}

export function buildDailyReport(input: DailyReportInput): DailyReport {
  const { date, demands } = input;
  const byId = new Map(demands.map((d) => [d.id, d]));

  // Uma demanda entra em "o que foi feito" se foi apontada no dia, trocou de status nele (a
  // declaração não conta) ou ganhou um evento na data. Apontamentos antigos, sem demanda, ficam de fora.
  const ofDay = input.activities
    .filter((a) => a.date === date && a.endMinute > a.startMinute && a.demandId !== null)
    .sort((a, b) => a.startMinute - b.startMinute);
  const changes = input.statusChanges.filter((c) => c.date === date && c.from !== null);
  const events = input.events.filter((e) => e.date === date);
  const touched = new Set<number>([
    ...ofDay.map((a) => a.demandId!),
    ...changes.map((c) => c.demandId),
    ...events.map((e) => e.demandId),
  ]);

  const work = (d: DemandSummary): ReportWorkItem | null => {
    if (d.category === 'reuniao') return null;
    const dayChanges = changes.filter((c) => c.demandId === d.id);
    // Ida e volta no mesmo dia (ex.: concluiu e reabriu) não é mudança.
    const from = dayChanges[0]?.from;
    const to = dayChanges.at(-1)?.to;
    const changed = to !== undefined && to !== from;
    const progress = [
      ...ofDay
        .filter((a) => a.demandId === d.id)
        .map((a) => [a.description.trim(), a.notes.trim() && `(${a.notes.trim()})`].filter(Boolean).join(' ')),
      ...events.filter((e) => e.demandId === d.id).map((e) => `${DEMAND_EVENT_LABEL[e.kind]}: ${e.text}`),
    ].filter(Boolean);
    return {
      demandId: d.id,
      label: d.label,
      category: d.category,
      subtitle: d.category === 'ciclo' ? '' : shorten(d.subtitle),
      status: changed ? statusChangeText({ from: from!, to }) : currentStatus(d),
      changed,
      progress: [...new Set(progress)],
    };
  };

  const worked = [...touched].map((id) => byId.get(id)).filter((d): d is DemandSummary => d !== undefined);
  const cycles = worked
    .filter((d) => d.category === 'ciclo')
    .sort(compareDemands)
    .map((d) => work(d)!);
  // Tarefas: as concluídas no dia primeiro, depois as demais na ordem habitual.
  const tasks = worked
    .filter((d) => d.category === 'chamado' || d.category === 'treinamento')
    .sort((a, b) => Number(b.completedAt === date) - Number(a.completedAt === date) || compareDemands(a, b))
    .map((d) => work(d)!);
  const meetings: ReportMeeting[] = [];
  for (const a of ofDay) {
    const d = byId.get(a.demandId!);
    if (d?.category === 'reuniao' && !meetings.some((m) => m.demandId === d.id)) {
      meetings.push({ demandId: d.id, label: d.label, participants: d.participants });
    }
  }
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

  // ── O que será feito: ciclos abertos, tarefas em andamento e a fila (reuniões não entram) ──
  const open = demands.filter((d) => d.category !== 'reuniao' && isOpenDemand(d));
  const nextCycles: ReportNextItem[] = [];
  for (const d of open.filter((x) => x.category === 'ciclo').sort(compareDemands)) {
    if (d.category !== 'ciclo') continue;
    const parts: string[] = [CYCLE_STATUS_LABEL[d.status]];
    if (d.dueDate) parts.push(`prazo ${formatDayMonth(d.dueDate)} (${DEADLINE_LABEL[d.metrics.deadline].toLowerCase()})`);
    if (d.tracking.openBlockers > 0) parts.push('impedimento aberto');
    nextCycles.push({ demandId: d.id, label: d.label, category: 'ciclo', detail: parts.join(' · ') });
  }
  const nextTasks: ReportNextItem[] = [];
  for (const d of [...open].sort(compareDemands)) {
    if ((d.category !== 'chamado' && d.category !== 'treinamento') || d.status === 'nao_iniciado') continue;
    nextTasks.push({ demandId: d.id, label: d.label, category: d.category, detail: shorten(d.subtitle) });
  }
  const queued = open.filter(
    (d) => (d.category === 'chamado' || d.category === 'treinamento') && d.status === 'nao_iniciado',
  ).length;

  return {
    date,
    done: { cycles, tasks, meetings, completedTasks },
    blockers: {
      open: blockerItems.filter((b) => b.resolvedAt === null).length,
      resolved: blockerItems.filter((b) => b.resolvedAt === date).length,
      items: blockerItems,
    },
    next:
      nextCycles.length + nextTasks.length + queued > 0
        ? { date: nextWorkday(date), cycles: nextCycles, tasks: nextTasks, queued }
        : null,
  };
}

// ── Resumos em texto (tela e Markdown) ──────────────────────────────────────────

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const dayLabel = (iso: ISODate) => `${WEEKDAY_SHORT[weekdayOf(iso)]} ${formatDayMonth(iso)}`;

/** "2 ciclos · 3 tarefas (1 concluída) · 2 reuniões" — só o que houve. */
export function doneSummary(done: DailyReport['done']): string {
  const parts: string[] = [];
  if (done.cycles.length) parts.push(count(done.cycles.length, 'ciclo', 'ciclos'));
  if (done.tasks.length) {
    const completed = done.completedTasks ? ` (${count(done.completedTasks, 'concluída', 'concluídas')})` : '';
    parts.push(`${count(done.tasks.length, 'tarefa', 'tarefas')}${completed}`);
  }
  if (done.meetings.length) parts.push(count(done.meetings.length, 'reunião', 'reuniões'));
  return parts.join(' · ');
}

/** "1 aberto · 1 resolvido no dia" — só o que houve. */
export function blockersSummary(blockers: DailyReport['blockers']): string {
  const parts: string[] = [];
  if (blockers.open) parts.push(count(blockers.open, 'aberto', 'abertos'));
  if (blockers.resolved) parts.push(`${count(blockers.resolved, 'resolvido', 'resolvidos')} no dia`);
  return parts.join(' · ');
}

/** Título da última seção: "O que será feito hoje (Qui 29/10)" ou "O que será feito em Qui 29/10". */
export function nextTitle(nextDate: ISODate, today: ISODate): string {
  return nextDate === today ? `O que será feito hoje (${dayLabel(nextDate)})` : `O que será feito em ${dayLabel(nextDate)}`;
}

export interface MarkdownOptions {
  /** Itens de "O que será feito" a deixar de fora: ids de demanda e 'fila' (a linha da fila). */
  skipNext?: ReadonlySet<number | 'fila'>;
  /** Data de hoje, para escrever "hoje" no título da última seção. */
  today?: ISODate;
}

const workLine = (i: ReportWorkItem) => {
  const kind = i.category === 'ciclo' ? '' : ` (${DEMAND_CATEGORY_LABEL[i.category]})`;
  const subtitle = i.subtitle ? `: ${i.subtitle}` : '';
  return [`- **${i.label}**${kind}${subtitle} — ${i.status}`, ...i.progress.map((p) => `  - ${p}`)];
};

export function dailyReportMarkdown(report: DailyReport, options: MarkdownOptions = {}): string {
  const lines: string[] = [`# Daily — ${dayLabel(report.date)}`, ''];

  // O que foi feito
  const d = report.done;
  lines.push('## O que foi feito');
  const summary = doneSummary(d);
  if (!summary) {
    lines.push('Nada registrado neste dia.');
  } else {
    lines.push(summary);
    if (d.cycles.length) lines.push('', '**Ciclos**', ...d.cycles.flatMap(workLine));
    if (d.tasks.length) lines.push('', '**Tarefas**', ...d.tasks.flatMap(workLine));
    if (d.meetings.length) {
      lines.push('', `**Reuniões**`, ...d.meetings.map((m) => `- ${m.label} (com ${m.participants})`));
    }
  }
  lines.push('');

  // Impedimentos
  const b = report.blockers;
  lines.push('## Impedimentos');
  if (b.items.length === 0) {
    lines.push('Sem impedimentos.');
  } else {
    lines.push(blockersSummary(b), '');
    for (const i of b.items) {
      const state = i.resolvedAt
        ? `resolvido em ${formatDayMonth(i.resolvedAt)}`
        : `aguardando ${i.owner} desde ${formatDayMonth(i.since)} (${count(i.waitingWorkdays, 'dia útil', 'dias úteis')})`;
      const who = i.resolvedAt ? ` (${i.owner})` : '';
      lines.push(`- **${i.label}** — ${state}${who}${i.description ? `: ${i.description}` : ''}`);
    }
  }
  lines.push('');

  // O que será feito
  if (report.next) {
    const skip = options.skipNext ?? new Set();
    const cycles = report.next.cycles.filter((i) => !skip.has(i.demandId));
    const tasks = report.next.tasks.filter((i) => !skip.has(i.demandId));
    const showQueue = report.next.queued > 0 && !skip.has('fila');
    if (cycles.length || tasks.length || showQueue) {
      lines.push(`## ${nextTitle(report.next.date, options.today ?? '')}`);
      for (const i of cycles) lines.push(`- **${i.label}** — ${i.detail}`);
      for (const i of tasks) {
        lines.push(`- **${i.label}** (${DEMAND_CATEGORY_LABEL[i.category]})${i.detail ? `: ${i.detail}` : ''}`);
      }
      if (showQueue) lines.push(`- Na fila: ${count(report.next.queued, 'tarefa', 'tarefas')}`);
      lines.push('');
    }
  }

  return `${lines.join('\n').trimEnd()}\n`;
}
