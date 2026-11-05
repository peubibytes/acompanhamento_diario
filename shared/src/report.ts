// Relatório diário para a daily ou o 1:1, no formato do consolidador de atividades (v0.11,
// docs/decisions/0008): dois tópicos, "O que foi feito ontem" e "O que será feito hoje", cada um
// aberto por uma frase pronta para ler em voz alta ("Ontem, atendi 2 chamados, participei de
// 1 reunião e fiz 3h30 de demandas de Ciclo."). Os registros soltos (apontamentos, eventos da linha
// do tempo, trocas de status) são agrupados por demanda, sem repetir, com a digitação arrumada.
// Funções puras: o servidor reúne os dados; a tela só mostra e exporta.

import { addDays, formatDayMonth, isWorkday, WEEKDAY_LONG, WEEKDAY_SHORT, weekdayOf, type ISODate } from './cycle.ts';
import {
  compareDemands,
  CYCLE_STATUS_LABEL,
  DEADLINE_LABEL,
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
import { unionMinutes } from './metrics.ts';
import { formatDuration } from './time.ts';
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

/** Acima disso, a frase cita a quantidade e os itens vão para uma tabela ou lista. */
export const REPORT_INLINE_LIMIT = 3;

/** Um ciclo, chamado, treinamento ou atividade trabalhado no dia. */
export interface ReportWorkItem {
  demandId: number;
  /** Número do chamado ou nome do ciclo/treinamento/atividade. */
  label: string;
  category: 'ciclo' | 'chamado' | 'treinamento' | 'atividade';
  /** Descrição curta e arrumada (chamados e treinamentos); vazia nos ciclos. */
  subtitle: string;
  /** Situação: a troca de status do dia (ex.: "Em andamento → Concluído") ou o status atual. */
  status: string;
  /** Trocou de status no dia. */
  changed: boolean;
  /** Passou a Concluído no dia. */
  completed: boolean;
  /** Minutos apontados no dia (sobreposições contadas uma vez). */
  minutes: number;
  /** O que andou: o "o que foi feito" dos apontamentos, os eventos e os impedimentos resolvidos no dia. */
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
  /** Chamados e treinamentos: a descrição curta. Ciclos: status, prazo e impedimento. */
  detail: string;
  /** Chamado declarado no dia do relatório ou depois (ainda não iniciado). */
  isNew: boolean;
}

export interface DailyReport {
  date: ISODate;
  done: {
    tickets: ReportWorkItem[];
    trainings: ReportWorkItem[];
    cycles: ReportWorkItem[];
    /** Atividades (o que não é chamado, reunião, treinamento nem ciclo): ficam numa seção própria, fora dos números. */
    otherWork: ReportWorkItem[];
    meetings: ReportMeeting[];
    /** Com quem foram as reuniões, sem repetir. */
    people: string[];
    /** Minutos em ciclos no dia (sobreposições contadas uma vez). */
    cycleMinutes: number;
    /** Chamados e treinamentos que passaram a Concluído no dia. */
    completedTasks: number;
  };
  blockers: {
    open: number;
    resolved: number;
    items: ReportBlockerItem[];
  };
  next: {
    date: ISODate;
    tickets: ReportNextItem[];
    trainings: ReportNextItem[];
    cycles: ReportNextItem[];
  };
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

// ── Arrumação do texto digitado ──────────────────────────────────────────────

const SUBTITLE_MAX = 80;

/**
 * Corrige imperfeições comuns de digitação sem mudar o conteúdo: espaços duplicados ou nas pontas,
 * espaço antes da pontuação, falta de espaço depois da vírgula, pontuação repetida e o ponto final
 * (o texto entra no meio de uma frase).
 */
export function tidyText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?)])/g, '$1')
    .replace(/([(])\s+/g, '$1')
    .replace(/([,;])(?=[^\s\d])/g, '$1 ')
    .replace(/([!?,;:])\1+/g, '$1')
    .replace(/(?<!\.)\.\.(?!\.)/g, '.')
    .trim()
    .replace(/[\s.,;:]+$/, '');
}

/** Primeira letra maiúscula. */
export const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Primeira letra minúscula, para o meio da frase; siglas ("PR aberto", "API") ficam como estão. */
function lowerFirst(text: string): string {
  if (/^.[\p{Lu}\d]/u.test(text)) return text;
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/** Corta no limite, numa palavra inteira, com reticências. */
function shorten(text: string, max = SUBTITLE_MAX): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s.,;:]+$/, '')}…`;
}

/** Chave para reconhecer o mesmo texto com outra caixa, acento ou pontuação. */
const sameTextKey = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

function uniqueTexts(texts: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const text of texts) {
    const key = sameTextKey(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

/** "Equipe A, Fulano e Beltrano" → cada pessoa ou equipe, para juntar as reuniões sem repetir. */
function splitPeople(participants: string): string[] {
  return participants
    .split(/\s*(?:,|;|\/|\s+e\s+)\s*/)
    .map(tidyText)
    .filter(Boolean);
}

// ── Montagem ─────────────────────────────────────────────────────────────────

/** Status atual, com o rótulo de cada família. */
function currentStatus(d: DemandSummary): string {
  if (d.category === 'ciclo') return CYCLE_STATUS_LABEL[d.status];
  if (d.category === 'reuniao') return '';
  return TASK_STATUS_LABEL[d.status];
}

const isTask = (d: DemandSummary) => d.category === 'chamado' || d.category === 'treinamento';
const isTaskStarted = (d: DemandSummary) => !isTask(d) || d.status !== 'nao_iniciado';

export function buildDailyReport(input: DailyReportInput): DailyReport {
  const { date, demands } = input;
  const byId = new Map(demands.map((d) => [d.id, d]));

  // Uma demanda entra em "o que foi feito" se foi apontada no dia, trocou de status nele (a
  // declaração não conta), ganhou um evento na data ou teve um impedimento resolvido nela.
  // Apontamentos antigos, sem demanda, ficam de fora.
  const ofDay = input.activities
    .filter((a) => a.date === date && a.endMinute > a.startMinute && a.demandId !== null)
    .sort((a, b) => a.startMinute - b.startMinute);
  const changes = input.statusChanges.filter((c) => c.date === date && c.from !== null);
  const events = input.events.filter((e) => e.date === date);
  const resolvedToday = input.blockers.filter((b) => b.resolvedAt === date);
  const touched = new Set<number>([
    ...ofDay.map((a) => a.demandId!),
    ...changes.map((c) => c.demandId),
    ...events.map((e) => e.demandId),
    ...resolvedToday.map((b) => b.demandId),
  ]);

  const work = (d: DemandSummary): ReportWorkItem | null => {
    if (d.category === 'reuniao') return null;
    const dayChanges = changes.filter((c) => c.demandId === d.id);
    // Ida e volta no mesmo dia (ex.: concluiu e reabriu) não é mudança.
    const from = dayChanges[0]?.from;
    const to = dayChanges.at(-1)?.to;
    const changed = to !== undefined && to !== from;
    const own = ofDay.filter((a) => a.demandId === d.id);
    const progress = [
      ...own.map((a) => {
        const what = tidyText(a.description);
        const notes = tidyText(a.notes);
        return capitalize([what, notes].filter(Boolean).join(' – '));
      }),
      ...events
        .filter((e) => e.demandId === d.id)
        .map((e) => {
          const text = tidyText(e.text);
          return e.kind === 'acao' ? capitalize(text) : `${DEMAND_EVENT_LABEL[e.kind]}: ${lowerFirst(text)}`;
        }),
      ...resolvedToday
        .filter((b) => b.demandId === d.id)
        .map((b) => `Impedimento com ${tidyText(b.owner)} resolvido`),
    ];
    return {
      demandId: d.id,
      label: d.label,
      category: d.category,
      subtitle: d.category === 'ciclo' ? '' : capitalize(shorten(tidyText(d.subtitle))),
      status: changed ? statusChangeText({ from: from!, to }) : currentStatus(d),
      changed,
      completed: isTask(d) && d.completedAt === date,
      minutes: unionMinutes(own),
      progress: uniqueTexts(progress),
    };
  };

  const worked = [...touched].map((id) => byId.get(id)).filter((d): d is DemandSummary => d !== undefined);
  // Concluídas no dia primeiro, depois a ordem habitual.
  const byDone = (a: DemandSummary, b: DemandSummary) =>
    Number(b.completedAt === date) - Number(a.completedAt === date) || compareDemands(a, b);
  const cycles = worked.filter((d) => d.category === 'ciclo').sort(compareDemands).map((d) => work(d)!);
  const tickets = worked.filter((d) => d.category === 'chamado').sort(byDone).map((d) => work(d)!);
  const trainings = worked.filter((d) => d.category === 'treinamento').sort(byDone).map((d) => work(d)!);
  const otherWork = worked.filter((d) => d.category === 'atividade').sort(byDone).map((d) => work(d)!);

  const meetings: ReportMeeting[] = [];
  for (const a of ofDay) {
    const d = byId.get(a.demandId!);
    if (d?.category === 'reuniao' && !meetings.some((m) => m.demandId === d.id)) {
      meetings.push({ demandId: d.id, label: d.label, participants: tidyText(d.participants) });
    }
  }
  const people = uniqueTexts(meetings.flatMap((m) => splitPeople(m.participants)));
  const cycleMinutes = unionMinutes(ofDay.filter((a) => byId.get(a.demandId!)?.category === 'ciclo'));
  const completedTasks = [...tickets, ...trainings].filter((t) => t.completed).length;

  // ── Impedimentos: abertos no dia, mais os resolvidos nele ──
  const blockerItems: ReportBlockerItem[] = input.blockers
    .filter((b) => b.since <= date && (b.resolvedAt === null || b.resolvedAt >= date) && byId.has(b.demandId))
    .map((b) => ({
      demandId: b.demandId,
      label: byId.get(b.demandId)!.label,
      owner: tidyText(b.owner),
      description: tidyText(b.description),
      since: b.since,
      resolvedAt: b.resolvedAt !== null && b.resolvedAt <= date ? b.resolvedAt : null,
      waitingWorkdays: waitingWorkdays([b], date),
    }))
    .sort((a, b) => Number(a.resolvedAt !== null) - Number(b.resolvedAt !== null) || b.waitingWorkdays - a.waitingWorkdays);

  // ── O que será feito: o que ficou de ontem, o que chegou e os ciclos planejados ──
  const nextDate = nextWorkday(date);
  const declaredAt = new Map<number, ISODate>();
  for (const c of input.statusChanges) if (c.from === null) declaredAt.set(c.demandId, c.date);
  const isRecent = (d: DemandSummary) => (declaredAt.get(d.id) ?? '') >= date;
  const open = demands.filter((d) => d.category !== 'reuniao' && isOpenDemand(d)).sort(compareDemands);
  const nextItem = (d: DemandSummary, detail: string, isNew = false): ReportNextItem => ({
    demandId: d.id,
    label: d.label,
    category: d.category as ReportNextItem['category'],
    detail,
    isNew,
  });

  const nextTickets: ReportNextItem[] = [];
  const nextTrainings: ReportNextItem[] = [];
  const nextCycles: ReportNextItem[] = [];
  // Chamados: os que ficaram de ontem (já iniciados) antes dos que acabaram de chegar.
  const startedFirst = [...open].sort((a, b) => Number(!isTaskStarted(a)) - Number(!isTaskStarted(b)));
  for (const d of startedFirst) {
    if (d.category === 'ciclo') {
      // Os ciclos que já começaram até o dia do plano.
      if (d.startDate > nextDate) continue;
      const parts: string[] = [CYCLE_STATUS_LABEL[d.status]];
      if (d.dueDate) parts.push(`prazo ${formatDayMonth(d.dueDate)} (${DEADLINE_LABEL[d.metrics.deadline].toLowerCase()})`);
      if (d.tracking.openBlockers > 0) parts.push('impedimento aberto');
      nextCycles.push(nextItem(d, parts.join(' · ')));
    } else if (d.category === 'chamado' || d.category === 'treinamento') {
      const detail = capitalize(shorten(tidyText(d.subtitle)));
      const started = d.status !== 'nao_iniciado';
      // Todo chamado e treinamento aberto entra no plano; "novo" só no chamado ainda não iniciado e recém-declarado
      // (declarado no dia do relatório ou depois).
      if (d.category === 'chamado') nextTickets.push(nextItem(d, detail, !started && isRecent(d)));
      else nextTrainings.push(nextItem(d, detail));
    }
  }

  return {
    date,
    done: { tickets, trainings, cycles, otherWork, meetings, people, cycleMinutes, completedTasks },
    blockers: {
      open: blockerItems.filter((b) => b.resolvedAt === null).length,
      resolved: blockerItems.filter((b) => b.resolvedAt === date).length,
      items: blockerItems,
    },
    next: { date: nextDate, tickets: nextTickets, trainings: nextTrainings, cycles: nextCycles },
  };
}

// ── Frases (tela e Markdown) ────────────────────────────────────────────────

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const dayLabel = (iso: ISODate) => `${WEEKDAY_SHORT[weekdayOf(iso)]} ${formatDayMonth(iso)}`;

/** "A", "A e B", "A, B e C" (ou com "; " quando os itens já têm vírgula). */
export function joinList(items: string[], separator = ', '): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(separator)} e ${items.at(-1)}`;
}

/** Como a frase se refere a um dia, a partir de hoje: "ontem", "hoje" ou "na terça-feira (27/10)". */
export function dayReference(date: ISODate, today: ISODate): string {
  if (date === today) return 'hoje';
  if (date === addDays(today, -1)) return 'ontem';
  return `na ${WEEKDAY_LONG[weekdayOf(date)].toLowerCase()} (${formatDayMonth(date)})`;
}

/** "O que foi feito ontem". */
export const doneTitle = (date: ISODate, today: ISODate) => `O que foi feito ${dayReference(date, today)}`;

/** O dia do plano: "hoje" ou "na quinta-feira (29/10)" (num relatório antigo, nunca "ontem"). */
const planReference = (nextDate: ISODate, today: ISODate) =>
  nextDate === today ? 'hoje' : `na ${WEEKDAY_LONG[weekdayOf(nextDate)].toLowerCase()} (${formatDayMonth(nextDate)})`;

/** "O que será feito hoje" ou "O que será feito na quinta-feira (29/10)". */
export const nextTitle = (nextDate: ISODate, today: ISODate) => `O que será feito ${planReference(nextDate, today)}`;

/** Houve algo no dia (chamado, treinamento, ciclo, atividade ou reunião). */
export const hasDoneWork = (done: DailyReport['done']) =>
  done.tickets.length + done.trainings.length + done.cycles.length + done.otherWork.length + done.meetings.length > 0;

/**
 * A frase de métricas: "Ontem, atendi 2 chamados, participei de 1 reunião e fiz 3h30 de demandas
 * de Ciclo." Só entra o que houve (nada de "0 reuniões"). Vazia se não há nada a dizer.
 */
export function doneHeadline(report: DailyReport, today: ISODate): string {
  const d = report.done;
  const parts: string[] = [];
  if (d.tickets.length) parts.push(`atendi ${count(d.tickets.length, 'chamado', 'chamados')}`);
  if (d.meetings.length) parts.push(`participei de ${count(d.meetings.length, 'reunião', 'reuniões')}`);
  if (d.trainings.length) parts.push(`avancei em ${count(d.trainings.length, 'treinamento', 'treinamentos')}`);
  if (d.cycleMinutes > 0) parts.push(`fiz ${formatDuration(d.cycleMinutes)} de demandas de Ciclo`);
  if (!parts.length) return '';
  return `${capitalize(dayReference(report.date, today))}, ${joinList(parts)}.`;
}

const ticketText = (i: { label: string; subtitle?: string; detail?: string }, extra = '') => {
  const description = i.subtitle ?? i.detail ?? '';
  return `${i.label}${description ? ` – ${description}` : ''}${extra}`;
};

const cycleText = (i: ReportWorkItem) =>
  i.progress.length ? `${i.label} (${i.progress.map(lowerFirst).join('; ')})` : i.label;

/** Itens no texto, ou só a quantidade quando passam do limite e vão para a tabela. */
const inline = (n: number) => n <= REPORT_INLINE_LIMIT;

/**
 * A frase de detalhamento: "Atendi aos chamados (número – descrição), entrei em reunião com (pessoas),
 * e fiz minhas demandas de ciclo: (ciclo e ações)." Cada oração só aparece se houve; acima de três
 * itens, a oração cita a quantidade e os itens vão para a tabela.
 */
export function doneDetail(done: DailyReport['done']): string {
  const clauses: string[] = [];
  const t = done.tickets;
  if (t.length) {
    const items = t.map((i) => ticketText(i, i.completed ? ' (concluído)' : ''));
    clauses.push(
      !inline(t.length)
        ? `atendi aos ${t.length} chamados da tabela abaixo`
        : t.length === 1
          ? `atendi ao chamado ${items[0]}`
          : `atendi aos chamados ${joinList(items, '; ')}`,
    );
  }
  if (done.meetings.length) {
    const n = done.meetings.length;
    const who = done.people.length ? ` com ${joinList(done.people)}` : '';
    clauses.push(inline(n) ? `entrei em reunião${who}` : `entrei em ${n} reuniões${who} (lista abaixo)`);
  }
  const tr = done.trainings;
  if (tr.length) {
    clauses.push(
      !inline(tr.length)
        ? `avancei nos ${tr.length} treinamentos da lista abaixo`
        : `avancei ${tr.length === 1 ? 'no treinamento' : 'nos treinamentos'} ${joinList(tr.map((i) => i.label))}`,
    );
  }
  const c = done.cycles;
  if (c.length) {
    clauses.push(
      !inline(c.length)
        ? `fiz minhas demandas de ciclo nos ${c.length} ciclos da tabela abaixo`
        : `fiz minhas demandas de ciclo: ${joinList(c.map(cycleText), '; ')}`,
    );
  }
  return clauses.length ? `${capitalize(joinList(clauses))}.` : '';
}

/** Itens de "O que será feito" a deixar de fora: ids de demanda. */
export type SkipNext = ReadonlySet<number>;

/** O plano sem os itens desmarcados. */
export function selectedNext(next: DailyReport['next'], skip: SkipNext = new Set()) {
  const keep = (i: ReportNextItem) => !skip.has(i.demandId);
  return {
    tickets: next.tickets.filter(keep),
    trainings: next.trainings.filter(keep),
    cycles: next.cycles.filter(keep),
  };
}

/**
 * A frase de planejamento: "Para hoje, buscarei encerrar os chamados (número – descrição) e atuarei
 * nas demandas (ciclos)." Sem nada aberto: "Para hoje, não há demandas em aberto."
 */
export function planSentence(next: DailyReport['next'], today: ISODate, skip?: SkipNext): string {
  const s = selectedNext(next, skip);
  const lead = `Para ${planReference(next.date, today).replace(/^na /, '')}`;
  const clauses: string[] = [];
  if (s.tickets.length) {
    const n = s.tickets.length;
    clauses.push(
      !inline(n)
        ? `buscarei encerrar os ${n} chamados da tabela abaixo`
        : `buscarei encerrar ${n === 1 ? 'o chamado' : 'os chamados'} ${joinList(s.tickets.map((i) => ticketText(i)), '; ')}`,
    );
  }
  if (s.trainings.length) {
    const n = s.trainings.length;
    clauses.push(
      !inline(n)
        ? `seguirei nos ${n} treinamentos da lista abaixo`
        : `seguirei ${n === 1 ? 'no treinamento' : 'nos treinamentos'} ${joinList(s.trainings.map((i) => i.label))}`,
    );
  }
  if (s.cycles.length) {
    const n = s.cycles.length;
    clauses.push(
      !inline(n)
        ? `atuarei nas ${n} demandas de ciclo da tabela abaixo`
        : `atuarei ${n === 1 ? 'na demanda' : 'nas demandas'} ${joinList(s.cycles.map((i) => i.label))}`,
    );
  }
  if (!clauses.length) return `${lead}, não há demandas em aberto.`;
  return `${lead}, ${joinList(clauses)}.`;
}

/** "Aguardando Equipe B desde 26/10 (3 dias úteis): Libera o acesso". */
export function blockerText(i: ReportBlockerItem): string {
  const state = i.resolvedAt
    ? `resolvido em ${formatDayMonth(i.resolvedAt)} (${i.owner})`
    : `aguardando ${i.owner} desde ${formatDayMonth(i.since)} (${count(i.waitingWorkdays, 'dia útil', 'dias úteis')})`;
  return `${state}${i.description ? `: ${i.description}` : ''}`;
}

// ── Markdown ────────────────────────────────────────────────────────────────

export interface MarkdownOptions {
  skipNext?: SkipNext;
  /** Data de hoje, para escrever "ontem" e "hoje" nas frases e nos títulos. */
  today?: ISODate;
}

const cell = (text: string) => text.replace(/\|/g, '\\|').replace(/\n/g, ' ') || '—';
const table = (head: string[], rows: string[][]) => [
  `| ${head.join(' | ')} |`,
  `| ${head.map(() => '---').join(' | ')} |`,
  ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`),
];

export function dailyReportMarkdown(report: DailyReport, options: MarkdownOptions = {}): string {
  const today = options.today ?? '';
  const lines: string[] = [`# Daily — ${dayLabel(report.date)}`, ''];

  // 1. O que foi feito
  const d = report.done;
  lines.push(`## ${doneTitle(report.date, today)}`);
  if (!hasDoneWork(d)) {
    lines.push(`Nada registrado ${dayReference(report.date, today)}.`);
  } else {
    const headline = doneHeadline(report, today);
    const detail = doneDetail(d);
    if (headline) lines.push(headline, '');
    if (detail) lines.push(detail);
    if (d.otherWork.length) {
      // Atividades não entram nos números nem nas frases: só nesta seção.
      lines.push('', '**Outras atividades**', ...d.otherWork.map((i) => `- ${cycleText(i)}`));
    }
    if (!inline(d.tickets.length)) {
      lines.push('', ...table(['Chamado', 'Descrição', 'Situação'], d.tickets.map((i) => [i.label, i.subtitle, i.status])));
    }
    if (!inline(d.meetings.length)) {
      lines.push('', ...d.meetings.map((m) => `- ${m.label} (com ${m.participants})`));
    }
    if (!inline(d.trainings.length)) {
      lines.push('', ...d.trainings.map((i) => `- ${i.label} — ${i.status}`));
    }
    if (!inline(d.cycles.length)) {
      lines.push(
        '',
        ...table(
          ['Ciclo', 'Situação', 'Horas', 'Ações'],
          d.cycles.map((i) => [i.label, i.status, i.minutes ? formatDuration(i.minutes) : '', i.progress.join('; ')]),
        ),
      );
    }
  }
  lines.push('');

  // 2. O que será feito
  const next = report.next;
  const s = selectedNext(next, options.skipNext);
  lines.push(`## ${nextTitle(next.date, today)}`, planSentence(next, today, options.skipNext));
  if (!inline(s.tickets.length)) {
    lines.push('', ...table(['Chamado', 'Descrição'], s.tickets.map((i) => [i.label + (i.isNew ? ' (novo)' : ''), i.detail])));
  }
  if (!inline(s.trainings.length)) lines.push('', ...s.trainings.map((i) => `- ${i.label}`));
  if (!inline(s.cycles.length)) lines.push('', ...table(['Ciclo', 'Situação'], s.cycles.map((i) => [i.label, i.detail])));
  const open = report.blockers.items.filter((b) => b.resolvedAt === null);
  const notes = [
    ...open.map((b) => `- **${b.label}** — impedimento ${blockerText(b)}`),
  ];
  if (notes.length) lines.push('', ...notes);

  return `${lines.join('\n').trimEnd()}\n`;
}
