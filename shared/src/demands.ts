// Demandas: o que o colaborador declara que faz. São de duas famílias:
// - Tarefas (rotina): chamados, reuniões e treinamentos;
// - Ciclo: trabalhos longos, com prazo, prioridade, linha do tempo e impedimentos.
// A declaração não tem horas: o tempo gasto é registrado em Apontamentos, sempre sobre uma
// demanda já declarada. Ver docs/decisions/0002-demandas-declaradas-e-apontamentos.md.

import { addDays, formatDayMonth, isWorkday, type ISODate } from './cycle.ts';
import { unionMinutesByDay } from './metrics.ts';
import { formatDuration } from './time.ts';
import type { Activity } from './types.ts';

export const DEMAND_CATEGORIES = ['ciclo', 'chamado', 'reuniao', 'treinamento'] as const;
export type DemandCategory = (typeof DEMAND_CATEGORIES)[number];

/** Categorias da família "Tarefas" (rotina). */
export const TASK_CATEGORIES = ['chamado', 'reuniao', 'treinamento'] as const;
export type TaskCategory = (typeof TASK_CATEGORIES)[number];

export const DEMAND_CATEGORY_LABEL: Record<DemandCategory, string> = {
  ciclo: 'Ciclo',
  chamado: 'Chamado',
  reuniao: 'Reunião',
  treinamento: 'Treinamento',
};

export const DEMAND_CATEGORY_PLURAL: Record<DemandCategory, string> = {
  ciclo: 'Ciclos',
  chamado: 'Chamados',
  reuniao: 'Reuniões',
  treinamento: 'Treinamentos',
};

// ── Ciclo ──────────────────────────────────────────────────────────────────────

export const CYCLE_STATUSES = [
  'novo',
  'em_andamento',
  'aguardando_terceiro',
  'em_homologacao',
  'concluido',
  'cancelado',
] as const;
export type CycleStatus = (typeof CYCLE_STATUSES)[number];

export const CYCLE_STATUS_LABEL: Record<CycleStatus, string> = {
  novo: 'Novo',
  em_andamento: 'Em andamento',
  aguardando_terceiro: 'Aguardando terceiro',
  em_homologacao: 'Em homologação',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};

export const DEMAND_KINDS = ['planejada', 'intempestiva', 'preventiva'] as const;
export type DemandKind = (typeof DEMAND_KINDS)[number];
export const DEMAND_KIND_LABEL: Record<DemandKind, string> = {
  planejada: 'Planejada',
  intempestiva: 'Intempestiva',
  preventiva: 'Preventiva',
};

export const DEMAND_PRIORITIES = ['baixa', 'media', 'alta', 'urgente'] as const;
export type DemandPriority = (typeof DEMAND_PRIORITIES)[number];
export const DEMAND_PRIORITY_LABEL: Record<DemandPriority, string> = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
  urgente: 'Urgente',
};

export const DEMAND_ENVIRONMENTS = ['desenvolvimento', 'staging', 'producao'] as const;
export type DemandEnvironment = (typeof DEMAND_ENVIRONMENTS)[number];
export const DEMAND_ENVIRONMENT_LABEL: Record<DemandEnvironment, string> = {
  desenvolvimento: 'Desenvolvimento',
  staging: 'Staging',
  producao: 'Produção (PRD)',
};

// ── Tarefas (chamados e treinamentos têm status; reuniões, não) ─────────────

export const TASK_STATUSES = ['nao_iniciado', 'iniciado', 'em_andamento', 'concluido'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  nao_iniciado: 'Não iniciado',
  iniciado: 'Iniciado',
  em_andamento: 'Em andamento',
  concluido: 'Concluído',
};

/** Sugestões para o tipo de reunião; o usuário pode digitar outro. */
export const MEETING_TYPE_SUGGESTIONS = ['Daily', 'Semanal', 'Planejamento', 'Treinamento'] as const;

// ── Declarações ────────────────────────────────────────────────────────────────

export interface CycleDemand {
  id: number;
  category: 'ciclo';
  /** Nome do projeto. */
  title: string;
  description: string;
  kind: DemandKind;
  status: CycleStatus;
  priority: DemandPriority;
  startDate: ISODate;
  /** Prazo (opcional). */
  dueDate: ISODate | null;
  branch: string;
  prUrl: string;
  environment: DemandEnvironment | null;
}

export interface TicketDemand {
  id: number;
  category: 'chamado';
  /** Número do chamado, normalizado em maiúsculas (único entre os chamados). */
  ticketNumber: string;
  /** Qual o problema, quem solicitou e outras informações relevantes. */
  description: string;
  status: TaskStatus;
}

export interface MeetingDemand {
  id: number;
  category: 'reuniao';
  /** Ex.: Daily, Semanal, Planejamento, Treinamento. */
  meetingType: string;
  /** Com quem é a reunião (pessoas ou equipes). */
  participants: string;
  subject: string;
}

export interface TrainingDemand {
  id: number;
  category: 'treinamento';
  /** Nome do treinamento. */
  title: string;
  description: string;
  status: TaskStatus;
}

export type Demand = CycleDemand | TicketDemand | MeetingDemand | TrainingDemand;

/** Omit que preserva a união discriminada (um Omit comum a desfaria). */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type DemandInput = DistributiveOmit<Demand, 'id'>;

/** Só os campos declarados (sem id, nome calculado e métricas), para regravar com uma alteração pontual. */
export function demandInputOf(d: Demand): DemandInput {
  switch (d.category) {
    case 'ciclo':
      return {
        category: 'ciclo',
        title: d.title,
        description: d.description,
        kind: d.kind,
        status: d.status,
        priority: d.priority,
        startDate: d.startDate,
        dueDate: d.dueDate,
        branch: d.branch,
        prUrl: d.prUrl,
        environment: d.environment,
      };
    case 'chamado':
      return { category: 'chamado', ticketNumber: d.ticketNumber, description: d.description, status: d.status };
    case 'reuniao':
      return { category: 'reuniao', meetingType: d.meetingType, participants: d.participants, subject: d.subject };
    case 'treinamento':
      return { category: 'treinamento', title: d.title, description: d.description, status: d.status };
  }
}

/** Normaliza o número de um chamado: sem espaços nas pontas e em maiúsculas. */
export const normalizeTicketNumber = (n: string) => n.trim().toUpperCase();

/** Nome curto da demanda, usado em listas, gráficos e no apontamento. */
export function demandLabel(d: DemandInput): string {
  switch (d.category) {
    case 'ciclo':
    case 'treinamento':
      return d.title;
    case 'chamado':
      return d.ticketNumber;
    case 'reuniao':
      return `${d.meetingType} · ${d.subject}`;
  }
}

/** Complemento do nome: o começo da descrição ou, na reunião, com quem ela é. */
export function demandSubtitle(d: DemandInput): string {
  if (d.category === 'reuniao') return `com ${d.participants}`;
  return d.description.split('\n')[0].trim();
}

/** Aberta = ainda aparece para apontar. Reuniões não têm status e ficam sempre abertas. */
export function isOpenDemand(d: DemandInput): boolean {
  if (d.category === 'reuniao') return true;
  return d.status !== 'concluido' && d.status !== 'cancelado';
}

export const DEMAND_STATUS_GROUPS = ['abertas', 'encerradas'] as const;
export type DemandStatusGroup = (typeof DEMAND_STATUS_GROUPS)[number];

export const matchesStatusGroup = (d: Demand, group: DemandStatusGroup) =>
  group === 'abertas' ? isOpenDemand(d) : !isOpenDemand(d);

// ── Acompanhamento do ciclo: linha do tempo e impedimentos ─────────────────────

export const DEMAND_EVENT_KINDS = ['acao', 'decisao', 'impedimento', 'validacao', 'deploy'] as const;
export type DemandEventKind = (typeof DEMAND_EVENT_KINDS)[number];
export const DEMAND_EVENT_LABEL: Record<DemandEventKind, string> = {
  acao: 'Ação',
  decisao: 'Decisão',
  impedimento: 'Impedimento',
  validacao: 'Validação',
  deploy: 'Deploy',
};

/** Linha datada na linha do tempo de um ciclo. */
export interface DemandEvent {
  id: number;
  demandId: number;
  date: ISODate;
  kind: DemandEventKind;
  text: string;
}
export type DemandEventInput = Omit<DemandEvent, 'id' | 'demandId'>;

/** Bloqueio com responsável externo; aberto enquanto `resolvedAt` for nulo. */
export interface DemandBlocker {
  id: number;
  demandId: number;
  /** Pessoa ou equipe de quem o ciclo depende. */
  owner: string;
  description: string;
  since: ISODate;
  resolvedAt: ISODate | null;
}
export type DemandBlockerInput = Omit<DemandBlocker, 'id' | 'demandId'>;

/**
 * Dias úteis em que o ciclo esteve parado por algum impedimento (de `since` até a
 * resolução, ou até hoje se ainda aberto), sem contar duas vezes impedimentos simultâneos.
 * Separa o tempo de espera do esforço (horas apontadas).
 */
export function waitingWorkdays(blockers: Pick<DemandBlocker, 'since' | 'resolvedAt'>[], today: ISODate): number {
  const days = new Set<ISODate>();
  for (const b of blockers) {
    const end = b.resolvedAt && b.resolvedAt < today ? b.resolvedAt : today;
    for (let d = b.since; d <= end; d = addDays(d, 1)) if (isWorkday(d)) days.add(d);
  }
  return days.size;
}

/** Troca de status de uma demanda; `from` é nulo na declaração. */
export interface DemandStatusChange {
  demandId: number;
  from: string | null;
  to: string;
  date: ISODate;
}

/** A última coisa que aconteceu numa demanda: um evento, uma troca de status ou um apontamento. */
export interface LastUpdate {
  date: ISODate;
  kind: 'evento' | 'status' | 'apontamento';
  text: string;
}

export interface DemandTracking {
  eventCount: number;
  lastEventDate: ISODate | null;
  openBlockers: number;
  waitingWorkdays: number;
  lastUpdate: LastUpdate | null;
}

// ── Métricas (vindas dos apontamentos) ─────────────────────────────────────────

/** A partir de quantos dias úteis antes do prazo o ciclo entra em alerta. */
export const DEADLINE_WARNING_WORKDAYS = 2;

export type DeadlineStatus =
  | 'sem_prazo'
  | 'no_prazo'
  | 'proxima'
  | 'vence_hoje'
  | 'atrasada'
  | 'concluida'
  | 'cancelada';

export const DEADLINE_LABEL: Record<DeadlineStatus, string> = {
  sem_prazo: 'Sem prazo',
  no_prazo: 'No prazo',
  proxima: 'Prazo próximo',
  vence_hoje: 'Vence hoje',
  atrasada: 'Atrasada',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
};

export interface DemandMetrics {
  /** Minutos apontados, contando sobreposições do mesmo dia uma única vez. */
  logged: number;
  /** Quantidade de apontamentos. */
  activityCount: number;
  /** Dias distintos com apontamento (ex.: em quantos dias a Daily aconteceu). */
  dayCount: number;
  lastActivityDate: ISODate | null;
  /** Situação do prazo; só os ciclos têm prazo. */
  deadline: DeadlineStatus;
  /** Dias úteis disponíveis até o prazo, contando hoje se for dia útil. */
  workdaysLeft: number | null;
  /** Lembrete quando o prazo está próximo, vence hoje ou venceu. */
  reminder: string | null;
}

export interface DemandSummaryExtras {
  label: string;
  subtitle: string;
  /** Data em que a demanda passou a Concluído (a última vez); nula se não está concluída. */
  completedAt: ISODate | null;
  metrics: DemandMetrics;
  tracking: DemandTracking;
}
export type DemandSummary = Demand & DemandSummaryExtras;

/** Dias úteis `d` com `from < d ≤ to`. */
export function workdaysBetween(from: ISODate, to: ISODate): number {
  let count = 0;
  for (let d = addDays(from, 1); d <= to; d = addDays(d, 1)) if (isWorkday(d)) count++;
  return count;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

type LinkedActivity = Pick<Activity, 'demandId' | 'date' | 'startMinute' | 'endMinute'> & Partial<Pick<Activity, 'description'>>;
type TimelineEvent = Pick<DemandEvent, 'demandId' | 'date'> & Partial<Pick<DemandEvent, 'kind' | 'text'>>;

export function demandMetrics(demand: Demand, activities: LinkedActivity[], today: ISODate): DemandMetrics {
  const ofDemand = activities.filter((a) => a.demandId === demand.id && a.endMinute > a.startMinute);
  const logged = unionMinutesByDay(ofDemand);
  const open = isOpenDemand(demand);

  let deadline: DeadlineStatus = open ? 'sem_prazo' : 'concluida';
  let workdaysLeft: number | null = null;
  let reminder: string | null = null;

  if (demand.category === 'ciclo') {
    const due = demand.dueDate;
    let ahead = 0;
    if (!open) deadline = demand.status === 'cancelado' ? 'cancelada' : 'concluida';
    else if (due && today > due) {
      deadline = 'atrasada';
      workdaysLeft = 0;
    } else if (due) {
      ahead = workdaysBetween(today, due);
      workdaysLeft = ahead + (isWorkday(today) ? 1 : 0);
      deadline = today === due ? 'vence_hoje' : ahead <= DEADLINE_WARNING_WORKDAYS ? 'proxima' : 'no_prazo';
    }

    if (open && due) {
      const hours = logged > 0 ? `${formatDuration(logged)} apontadas até agora.` : 'Nenhum apontamento ainda.';
      if (deadline === 'atrasada') reminder = `Prazo venceu em ${formatDayMonth(due)}. Conclua o ciclo ou ajuste o prazo.`;
      else if (deadline === 'vence_hoje') reminder = `Vence hoje. ${hours}`;
      else if (deadline === 'proxima')
        reminder = `Vence em ${plural(ahead, 'dia útil', 'dias úteis')} (${formatDayMonth(due)}). ${hours}`;
    }
  }

  return {
    logged,
    activityCount: ofDemand.length,
    dayCount: new Set(ofDemand.map((a) => a.date)).size,
    lastActivityDate: ofDemand.reduce<ISODate | null>((last, a) => (!last || a.date > last ? a.date : last), null),
    deadline,
    workdaysLeft,
    reminder,
  };
}

const shortText = (text: string, max = 80) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** Rótulo de um status de qualquer categoria (ciclo ou tarefa). */
export const statusLabel = (status: string): string =>
  (CYCLE_STATUS_LABEL as Record<string, string>)[status] ?? (TASK_STATUS_LABEL as Record<string, string>)[status] ?? status;

/** "Em andamento → Concluído" (na declaração, só o status inicial). */
export const statusChangeText = (c: Pick<DemandStatusChange, 'from' | 'to'>) =>
  c.from === null ? `Declarada como ${statusLabel(c.to)}` : `${statusLabel(c.from)} → ${statusLabel(c.to)}`;

/** Data em que a demanda passou a Concluído pela última vez; nula se hoje não está concluída. */
export function completedAtOf(demand: Demand, changes: DemandStatusChange[]): ISODate | null {
  if (demand.category === 'reuniao' || demand.status !== 'concluido') return null;
  const done = changes.filter((c) => c.demandId === demand.id && c.to === 'concluido');
  return done.reduce<ISODate | null>((last, c) => (!last || c.date > last ? c.date : last), null);
}

/**
 * O mais recente entre evento, troca de status e apontamento. No mesmo dia vale esta ordem:
 * evento (o mais informativo), troca de status, apontamento.
 */
export function lastUpdateOf(
  demandId: number,
  events: TimelineEvent[],
  changes: DemandStatusChange[],
  activities: LinkedActivity[],
): LastUpdate | null {
  const candidates: LastUpdate[] = [
    ...events.filter((e) => e.demandId === demandId).map((e) => ({ date: e.date, kind: 'evento' as const, text: shortText(e.text ?? '') })),
    ...changes.filter((c) => c.demandId === demandId).map((c) => ({ date: c.date, kind: 'status' as const, text: statusChangeText(c) })),
    ...activities
      .filter((a) => a.demandId === demandId && a.endMinute > a.startMinute)
      .map((a) => ({ date: a.date, kind: 'apontamento' as const, text: shortText(a.description ?? '') })),
  ];
  const rank = { evento: 0, status: 1, apontamento: 2 };
  // Empate no mesmo dia e tipo: vale o primeiro da lista (o servidor ordena do mais recente).
  return candidates.reduce<LastUpdate | null>(
    (best, c) => (!best || c.date > best.date || (c.date === best.date && rank[c.kind] < rank[best.kind]) ? c : best),
    null,
  );
}

export function demandTracking(
  demandId: number,
  events: Pick<DemandEvent, 'demandId' | 'date'>[],
  blockers: Pick<DemandBlocker, 'demandId' | 'since' | 'resolvedAt'>[],
  today: ISODate,
  lastUpdate: LastUpdate | null = null,
): DemandTracking {
  const ofEvents = events.filter((e) => e.demandId === demandId);
  const ofBlockers = blockers.filter((b) => b.demandId === demandId);
  return {
    eventCount: ofEvents.length,
    lastEventDate: ofEvents.reduce<ISODate | null>((last, e) => (!last || e.date > last ? e.date : last), null),
    openBlockers: ofBlockers.filter((b) => b.resolvedAt === null).length,
    waitingWorkdays: waitingWorkdays(ofBlockers, today),
    lastUpdate,
  };
}

export function buildDemandSummary(
  demand: Demand,
  activities: LinkedActivity[],
  today: ISODate,
  history: {
    events?: TimelineEvent[];
    blockers?: Pick<DemandBlocker, 'demandId' | 'since' | 'resolvedAt'>[];
    statusChanges?: DemandStatusChange[];
  } = {},
): DemandSummary {
  const events = history.events ?? [];
  const changes = history.statusChanges ?? [];
  return {
    ...demand,
    label: demandLabel(demand),
    subtitle: demandSubtitle(demand),
    completedAt: completedAtOf(demand, changes),
    metrics: demandMetrics(demand, activities, today),
    tracking: demandTracking(
      demand.id,
      events,
      history.blockers ?? [],
      today,
      lastUpdateOf(demand.id, events, changes, activities),
    ),
  };
}

const CATEGORY_ORDER: Record<DemandCategory, number> = { ciclo: 0, chamado: 1, reuniao: 2, treinamento: 3 };

const URGENCY: Record<DeadlineStatus, number> = {
  atrasada: 0,
  vence_hoje: 1,
  proxima: 2,
  no_prazo: 3,
  sem_prazo: 4,
  concluida: 5,
  cancelada: 6,
};

const PRIORITY_ORDER: Record<DemandPriority, number> = { urgente: 0, alta: 1, media: 2, baixa: 3 };

/**
 * Por categoria; dentro dela, as abertas primeiro. Ciclos seguem a urgência do prazo e a
 * prioridade; as tarefas, da declarada mais recente para a mais antiga.
 */
export function compareDemands(a: DemandSummary, b: DemandSummary): number {
  const byCategory = CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category];
  if (byCategory) return byCategory;
  const byOpen = Number(!isOpenDemand(a)) - Number(!isOpenDemand(b));
  if (byOpen) return byOpen;
  if (a.category === 'ciclo' && b.category === 'ciclo') {
    return (
      URGENCY[a.metrics.deadline] - URGENCY[b.metrics.deadline] ||
      PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
      (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') ||
      a.label.localeCompare(b.label, 'pt-BR')
    );
  }
  return b.id - a.id;
}
