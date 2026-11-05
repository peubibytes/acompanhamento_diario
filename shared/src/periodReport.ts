// Relatório do período (semana ou mês) para o 1:1 e a prestação de contas: os ciclos que andaram
// e o que aconteceu neles, as tarefas concluídas e trabalhadas, as reuniões, os impedimentos e quanto
// do tempo foi para trabalho não planejado. Como o diário, fala do trabalho, não dos apontamentos:
// a única medida de tempo é a fatia não planejada (PLANO 8.4). Funções puras.

import { formatDayMonth, type ISODate } from './cycle.ts';
import {
  compareDemands,
  CYCLE_STATUS_LABEL,
  DEMAND_CATEGORY_LABEL,
  DEMAND_EVENT_LABEL,
  DEMAND_KIND_LABEL,
  statusChangeText,
  TASK_STATUS_LABEL,
  waitingWorkdays,
  type DemandBlocker,
  type DemandEvent,
  type DemandStatusChange,
  type DemandSummary,
} from './demands.ts';
import { formatPeriodLabel, type PeriodWindow } from './period.ts';
import type { ReportBlockerItem } from './report.ts';
import { formatDuration } from './time.ts';
import type { Activity } from './types.ts';
import { unplannedTime, type UnplannedTime } from './yield.ts';

export interface PeriodCycleItem {
  demandId: number;
  label: string;
  /** Tipo, quando não é o planejado (ex.: "Intempestiva"); vazio no planejado. */
  kind: string;
  /** A troca de status no período (do primeiro "de" ao último "para") ou o status atual. */
  status: string;
  changed: boolean;
  /** Dias úteis do período com apontamento no ciclo. */
  workedDays: number;
  /** Eventos da linha do tempo no período, em ordem: "dd/mm Decisão: texto". */
  events: string[];
}

export interface PeriodTaskItem {
  demandId: number;
  label: string;
  category: 'chamado' | 'treinamento' | 'atividade';
  subtitle: string;
  status: string;
  /** Trocou de status no período. */
  changed: boolean;
}

export interface PeriodMeeting {
  demandId: number;
  label: string;
  participants: string;
  /** Dias do período em que a reunião foi apontada. */
  occurrences: number;
}

export interface PeriodReport {
  period: PeriodWindow;
  done: {
    cycles: PeriodCycleItem[];
    /** Chamados e treinamentos que passaram a Concluído no período (e seguem concluídos). */
    completedTasks: PeriodTaskItem[];
    /** Trabalhados no período (apontados ou com troca de status), sem conclusão nele. */
    workedTasks: PeriodTaskItem[];
    /** Atividades trabalhadas no período: seção própria, fora do resumo e dos números. */
    otherWork: PeriodTaskItem[];
    meetings: PeriodMeeting[];
  };
  blockers: {
    /** Abertos no fim do período. */
    open: number;
    /** Resolvidos dentro do período. */
    resolved: number;
    items: ReportBlockerItem[];
  };
  unplanned: UnplannedTime;
}

export interface PeriodReportInput {
  period: PeriodWindow;
  /** Para não contar espera além de hoje num período que ainda não terminou. */
  today: ISODate;
  /** Apontamentos do período (os de fora são ignorados). */
  activities: Activity[];
  demands: DemandSummary[];
  events: DemandEvent[];
  blockers: DemandBlocker[];
  statusChanges: DemandStatusChange[];
}

const SUBTITLE_MAX = 80;
const shorten = (text: string) => (text.length > SUBTITLE_MAX ? `${text.slice(0, SUBTITLE_MAX - 1)}…` : text);

export function buildPeriodReport(input: PeriodReportInput): PeriodReport {
  const { period, demands } = input;
  const inPeriod = (d: ISODate) => d >= period.start && d <= period.end;
  const byId = new Map(demands.map((d) => [d.id, d]));

  const logged = input.activities.filter((a) => inPeriod(a.date) && a.endMinute > a.startMinute && a.demandId !== null);
  const changes = input.statusChanges.filter((c) => inPeriod(c.date) && c.from !== null);
  const events = input.events.filter((e) => inPeriod(e.date)).sort((a, b) => a.date.localeCompare(b.date));
  const blockerMoves = input.blockers.filter((b) => inPeriod(b.since) || (b.resolvedAt !== null && inPeriod(b.resolvedAt)));

  // Uma troca no período: do primeiro "de" ao último "para"; ida e volta não é troca.
  const statusOf = (d: DemandSummary): { status: string; changed: boolean } => {
    const own = changes.filter((c) => c.demandId === d.id).sort((a, b) => a.date.localeCompare(b.date));
    const from = own[0]?.from ?? null;
    const to = own.at(-1)?.to;
    if (to !== undefined && from !== null && to !== from) return { status: statusChangeText({ from, to }), changed: true };
    if (d.category === 'ciclo') return { status: CYCLE_STATUS_LABEL[d.status], changed: false };
    if (d.category === 'reuniao') return { status: '', changed: false };
    return { status: TASK_STATUS_LABEL[d.status], changed: false };
  };
  const daysWith = (id: number) => new Set(logged.filter((a) => a.demandId === id).map((a) => a.date)).size;

  // ── Ciclos que andaram: apontados, com troca de status, evento ou impedimento no período ──
  const touchedCycles = new Set<number>([
    ...logged.map((a) => a.demandId!),
    ...changes.map((c) => c.demandId),
    ...events.map((e) => e.demandId),
    ...blockerMoves.map((b) => b.demandId),
  ]);
  const cycles: PeriodCycleItem[] = [];
  for (const d of demands.filter((x) => touchedCycles.has(x.id)).sort(compareDemands)) {
    if (d.category !== 'ciclo') continue;
    cycles.push({
      demandId: d.id,
      label: d.label,
      kind: d.kind === 'planejada' ? '' : DEMAND_KIND_LABEL[d.kind],
      ...statusOf(d),
      workedDays: daysWith(d.id),
      events: events
        .filter((e) => e.demandId === d.id)
        .map((e) => `${formatDayMonth(e.date)} ${DEMAND_EVENT_LABEL[e.kind]}: ${e.text}`),
    });
  }

  // ── Tarefas: concluídas no período e as demais trabalhadas nele ──
  const touchedTasks = new Set<number>([...logged.map((a) => a.demandId!), ...changes.map((c) => c.demandId)]);
  const completedTasks: PeriodTaskItem[] = [];
  const workedTasks: PeriodTaskItem[] = [];
  const otherWork: PeriodTaskItem[] = [];
  for (const d of [...demands].sort(compareDemands)) {
    if (d.category !== 'chamado' && d.category !== 'treinamento' && d.category !== 'atividade') continue;
    const completed = d.completedAt !== null && inPeriod(d.completedAt);
    if (!completed && !touchedTasks.has(d.id)) continue;
    const item = { demandId: d.id, label: d.label, category: d.category, subtitle: shorten(d.subtitle), ...statusOf(d) };
    // Atividades ficam numa seção própria, sem entrar na contagem de tarefas.
    (d.category === 'atividade' ? otherWork : completed ? completedTasks : workedTasks).push(item);
  }

  // ── Reuniões: cada uma uma vez, com os dias em que aconteceu ──
  const meetings: PeriodMeeting[] = [];
  for (const id of new Set(logged.map((a) => a.demandId!))) {
    const d = byId.get(id);
    if (d?.category === 'reuniao') meetings.push({ demandId: d.id, label: d.label, participants: d.participants, occurrences: daysWith(d.id) });
  }
  meetings.sort((a, b) => b.occurrences - a.occurrences || a.label.localeCompare(b.label, 'pt-BR'));

  // ── Impedimentos: os que estiveram abertos em algum momento do período ──
  const until = input.today < period.end ? input.today : period.end;
  const blockerItems: ReportBlockerItem[] = input.blockers
    .filter((b) => b.since <= period.end && (b.resolvedAt === null || b.resolvedAt >= period.start) && byId.has(b.demandId))
    .map((b) => {
      const resolved = b.resolvedAt !== null && b.resolvedAt <= period.end ? b.resolvedAt : null;
      return {
        demandId: b.demandId,
        label: byId.get(b.demandId)!.label,
        owner: b.owner,
        description: b.description,
        since: b.since,
        resolvedAt: resolved,
        waitingWorkdays: waitingWorkdays([{ since: b.since, resolvedAt: resolved }], until),
      };
    })
    .sort((a, b) => Number(a.resolvedAt !== null) - Number(b.resolvedAt !== null) || b.waitingWorkdays - a.waitingWorkdays);

  return {
    period,
    done: { cycles, completedTasks, workedTasks, otherWork, meetings },
    blockers: {
      open: blockerItems.filter((b) => b.resolvedAt === null).length,
      resolved: blockerItems.filter((b) => b.resolvedAt !== null).length,
      items: blockerItems,
    },
    unplanned: unplannedTime(input.activities, demands, period),
  };
}

// ── Resumos em texto (tela e Markdown) ──────────────────────────────────────────

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "Relatório semanal" ou "Relatório mensal". */
export const periodReportTitle = (period: PeriodWindow) => (period.scale === 'week' ? 'Relatório semanal' : 'Relatório mensal');

/** "2 ciclos · 5 tarefas (3 concluídas) · 4 reuniões" — só o que houve. */
export function periodDoneSummary(done: PeriodReport['done']): string {
  const parts: string[] = [];
  if (done.cycles.length) parts.push(count(done.cycles.length, 'ciclo', 'ciclos'));
  const tasks = done.completedTasks.length + done.workedTasks.length;
  if (tasks) {
    const completed = done.completedTasks.length ? ` (${count(done.completedTasks.length, 'concluída', 'concluídas')})` : '';
    parts.push(`${count(tasks, 'tarefa', 'tarefas')}${completed}`);
  }
  if (done.meetings.length) parts.push(count(done.meetings.length, 'reunião', 'reuniões'));
  return parts.join(' · ');
}

/** "2 abertos · 1 resolvido no período" — só o que houve. */
export function periodBlockersSummary(blockers: PeriodReport['blockers']): string {
  const parts: string[] = [];
  if (blockers.open) parts.push(count(blockers.open, 'aberto', 'abertos'));
  if (blockers.resolved) parts.push(`${count(blockers.resolved, 'resolvido', 'resolvidos')} no período`);
  return parts.join(' · ');
}

/** "18% do tempo (6h10 de 34h20) em ciclos intempestivos", ou o motivo de não haver número. */
export function unplannedText(u: UnplannedTime): string {
  if (u.percent === null) return 'Sem apontamentos no período.';
  if (u.minutes === 0) return 'Nenhum tempo em ciclos intempestivos (0%).';
  return `${u.percent}% do tempo (${formatDuration(u.minutes)} de ${formatDuration(u.total)}) em ciclos intempestivos.`;
}

const taskLine = (i: PeriodTaskItem) =>
  `- **${i.label}** (${DEMAND_CATEGORY_LABEL[i.category]})${i.subtitle ? `: ${i.subtitle}` : ''} — ${i.status}`;

export function periodReportMarkdown(report: PeriodReport): string {
  const lines: string[] = [`# ${periodReportTitle(report.period)} — ${formatPeriodLabel(report.period)}`, ''];

  const d = report.done;
  lines.push('## O que foi feito');
  const summary = periodDoneSummary(d);
  if (!summary && d.otherWork.length === 0) {
    lines.push('Nada registrado neste período.');
  } else {
    if (summary) lines.push(summary);
    if (d.cycles.length) {
      lines.push('', '**Ciclos**');
      for (const c of d.cycles) {
        const kind = c.kind ? ` (${c.kind.toLowerCase()})` : '';
        const days = c.workedDays ? ` · ${count(c.workedDays, 'dia', 'dias')} de trabalho` : '';
        lines.push(`- **${c.label}**${kind} — ${c.status}${days}`, ...c.events.map((e) => `  - ${e}`));
      }
    }
    if (d.completedTasks.length) lines.push('', '**Tarefas concluídas**', ...d.completedTasks.map(taskLine));
    if (d.workedTasks.length) lines.push('', '**Tarefas em andamento**', ...d.workedTasks.map(taskLine));
    if (d.otherWork.length) lines.push('', '**Outras atividades**', ...d.otherWork.map(taskLine));
    if (d.meetings.length) {
      lines.push(
        '',
        '**Reuniões**',
        ...d.meetings.map((m) => `- ${m.label} (com ${m.participants}) — ${count(m.occurrences, 'vez', 'vezes')}`),
      );
    }
  }
  lines.push('');

  const b = report.blockers;
  lines.push('## Impedimentos');
  if (b.items.length === 0) {
    lines.push('Sem impedimentos.');
  } else {
    lines.push(periodBlockersSummary(b), '');
    for (const i of b.items) {
      const state = i.resolvedAt
        ? `resolvido em ${formatDayMonth(i.resolvedAt)} (${i.owner})`
        : `aguardando ${i.owner} desde ${formatDayMonth(i.since)} (${count(i.waitingWorkdays, 'dia útil', 'dias úteis')})`;
      lines.push(`- **${i.label}** — ${state}${i.description ? `: ${i.description}` : ''}`);
    }
  }
  lines.push('', '## Trabalho não planejado', unplannedText(report.unplanned));

  return `${lines.join('\n').trimEnd()}\n`;
}
