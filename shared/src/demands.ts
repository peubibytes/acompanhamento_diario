// Demandas / chamados: trabalhos acompanhados ao longo de vários dias, com status de fluxo,
// identificadores externos, linha do tempo (eventos), impedimentos e, opcionalmente, uma
// meta de horas e uma data de conclusão. Ver docs/decisions/0001-demandas-viram-chamados.md.

import { addDays, formatDayMonth, isWorkday, type ISODate } from './cycle.ts';
import { unionMinutesByDay } from './metrics.ts';
import { formatDuration } from './time.ts';
import type { Activity } from './types.ts';

export const DEMAND_STATUSES = [
  'novo',
  'em_andamento',
  'aguardando_terceiro',
  'em_homologacao',
  'concluido',
  'cancelado',
] as const;
export type DemandStatus = (typeof DEMAND_STATUSES)[number];

export const DEMAND_STATUS_LABEL: Record<DemandStatus, string> = {
  novo: 'Novo',
  em_andamento: 'Em andamento',
  aguardando_terceiro: 'Aguardando terceiro',
  em_homologacao: 'Em homologação',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};

/** Agrupamentos aceitos no filtro de status, além dos status em si. */
export const DEMAND_STATUS_GROUPS = ['abertas', 'encerradas'] as const;
export type DemandStatusGroup = (typeof DEMAND_STATUS_GROUPS)[number];
export type DemandFilter = DemandStatus | DemandStatusGroup;

/** Aberta = ainda pede trabalho ou acompanhamento (não concluída nem cancelada). */
export const isOpenDemand = (d: Pick<Demand, 'status'>) => d.status !== 'concluido' && d.status !== 'cancelado';

export const matchesDemandFilter = (d: Pick<Demand, 'status'>, filter: DemandFilter) =>
  filter === 'abertas' ? isOpenDemand(d) : filter === 'encerradas' ? !isOpenDemand(d) : d.status === filter;

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

export interface Demand {
  id: number;
  title: string;
  description: string;
  /** Identificadores externos (SCTASK, RITM, user story), normalizados em maiúsculas. */
  externalIds: string[];
  /** Sistema ou projeto ao qual a demanda pertence. */
  system: string;
  kind: DemandKind;
  priority: DemandPriority;
  /** Progresso informado pelo usuário, de 0 a 100. */
  progressPercent: number;
  /** Meta de horas totais, em minutos (opcional: nem todo chamado tem estimativa). */
  targetMinutes: number | null;
  startDate: ISODate;
  /** Prazo final (opcional). */
  dueDate: ISODate | null;
  status: DemandStatus;
  branch: string;
  prUrl: string;
  environment: DemandEnvironment | null;
}

export type DemandInput = Omit<Demand, 'id'>;

/** Valores dos campos de chamado quando a demanda é criada só com o essencial. */
export const DEMAND_DEFAULTS = {
  externalIds: [] as string[],
  system: '',
  kind: 'planejada',
  priority: 'media',
  progressPercent: 0,
  branch: '',
  prUrl: '',
  environment: null,
} satisfies Partial<DemandInput>;

/** Normaliza um identificador externo: sem espaços nas pontas e em maiúsculas. */
export const normalizeExternalId = (id: string) => id.trim().toUpperCase();

/** Lê identificadores separados por espaço, vírgula ou ponto e vírgula, sem repetir. */
export function parseExternalIds(text: string): string[] {
  const ids = text.split(/[\s,;]+/).map(normalizeExternalId).filter(Boolean);
  return [...new Set(ids)];
}

export const DEMAND_EVENT_KINDS = ['acao', 'decisao', 'impedimento', 'validacao', 'deploy'] as const;
export type DemandEventKind = (typeof DEMAND_EVENT_KINDS)[number];
export const DEMAND_EVENT_LABEL: Record<DemandEventKind, string> = {
  acao: 'Ação',
  decisao: 'Decisão',
  impedimento: 'Impedimento',
  validacao: 'Validação',
  deploy: 'Deploy',
};

/** Linha datada na linha do tempo de uma demanda. */
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
  /** Pessoa ou equipe de quem a demanda depende. */
  owner: string;
  description: string;
  since: ISODate;
  resolvedAt: ISODate | null;
}
export type DemandBlockerInput = Omit<DemandBlocker, 'id' | 'demandId'>;

/**
 * Dias úteis em que a demanda esteve parada por algum impedimento (de `since` até a
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

/** Acompanhamento do chamado: linha do tempo e impedimentos. */
export interface DemandTracking {
  eventCount: number;
  lastEventDate: ISODate | null;
  openBlockers: number;
  waitingWorkdays: number;
}

/** A partir de quantos dias úteis antes do prazo a demanda entra em alerta. */
export const DEADLINE_WARNING_WORKDAYS = 2;

export type DemandProgress = 'nao_iniciada' | 'em_andamento' | 'atingida' | 'excedida';
export type DeadlineStatus =
  | 'sem_prazo'
  | 'no_prazo'
  | 'proxima'
  | 'vence_hoje'
  | 'atrasada'
  | 'concluida'
  | 'cancelada';

export const PROGRESS_LABEL: Record<DemandProgress, string> = {
  nao_iniciada: 'Não iniciada',
  em_andamento: 'Em andamento',
  atingida: 'Meta atingida',
  excedida: 'Meta excedida',
};

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
  logged: number;
  /** Meta de horas; nula quando a demanda não tem estimativa. */
  target: number | null;
  remaining: number;
  excess: number;
  /** Horas apontadas ÷ meta, em % inteiro arredondado para baixo (nulo sem meta). */
  percent: number | null;
  progress: DemandProgress;
  diagnosis: string;
  deadline: DeadlineStatus;
  /** Dias úteis disponíveis até o prazo, contando hoje se for dia útil. */
  workdaysLeft: number | null;
  /** Minutos por dia útil necessários para cumprir a meta no prazo. */
  requiredPerDay: number | null;
  /** O que falta não cabe no prazo nem apontando a meta diária inteira (ou o prazo já venceu). */
  atRisk: boolean;
  /** Lembrete para o usuário quando o prazo está próximo, vence hoje, venceu ou está em risco. */
  reminder: string | null;
  activityCount: number;
  lastActivityDate: ISODate | null;
}

/** "12h de 40h", ou só as horas apontadas quando a demanda não tem meta. */
export const formatDemandHours = (m: Pick<DemandMetrics, 'logged' | 'target'>) =>
  m.target === null ? `${formatDuration(m.logged)} apontadas` : `${formatDuration(m.logged)} de ${formatDuration(m.target)}`;

export interface DemandSummary extends Demand {
  metrics: DemandMetrics;
  tracking: DemandTracking;
}

/** Dias úteis `d` com `from < d ≤ to`. */
export function workdaysBetween(from: ISODate, to: ISODate): number {
  let count = 0;
  for (let d = addDays(from, 1); d <= to; d = addDays(d, 1)) if (isWorkday(d)) count++;
  return count;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function demandMetrics(
  demand: Demand,
  activities: Pick<Activity, 'demandId' | 'date' | 'startMinute' | 'endMinute'>[],
  today: ISODate,
  dailyGoal: number,
): DemandMetrics {
  const ofDemand = activities.filter((a) => a.demandId === demand.id && a.endMinute > a.startMinute);
  const target = demand.targetMinutes;
  const logged = unionMinutesByDay(ofDemand);
  const remaining = target === null ? 0 : Math.max(0, target - logged);
  const excess = target === null ? 0 : Math.max(0, logged - target);

  let progress: DemandProgress;
  let diagnosis: string;
  if (target === null) {
    progress = logged === 0 ? 'nao_iniciada' : 'em_andamento';
    diagnosis =
      logged === 0 ? 'Nenhuma hora apontada. Sem meta de horas' : `${formatDuration(logged)} apontadas, sem meta de horas`;
  } else if (logged === 0) {
    progress = 'nao_iniciada';
    diagnosis = `Nenhuma hora apontada. Meta de ${formatDuration(target)}`;
  } else if (logged < target) {
    progress = 'em_andamento';
    diagnosis = `Faltam ${formatDuration(remaining)} para a meta de ${formatDuration(target)}`;
  } else if (logged === target) {
    progress = 'atingida';
    diagnosis = `Meta de ${formatDuration(target)} atingida`;
  } else {
    progress = 'excedida';
    diagnosis = `Excedeu a meta de ${formatDuration(target)} em ${formatDuration(excess)}. Revise os apontamentos`;
  }

  const active = isOpenDemand(demand);
  const due = demand.dueDate;
  let deadline: DeadlineStatus;
  let workdaysLeft: number | null = null;
  let ahead = 0;

  if (!active) deadline = demand.status === 'cancelado' ? 'cancelada' : 'concluida';
  else if (!due) deadline = 'sem_prazo';
  else if (today > due) {
    deadline = 'atrasada';
    workdaysLeft = 0;
  } else {
    ahead = workdaysBetween(today, due);
    workdaysLeft = ahead + (isWorkday(today) ? 1 : 0);
    deadline = today === due ? 'vence_hoje' : ahead <= DEADLINE_WARNING_WORKDAYS ? 'proxima' : 'no_prazo';
  }

  const requiredPerDay =
    active && workdaysLeft && remaining > 0 ? Math.ceil(remaining / workdaysLeft) : null;
  const atRisk =
    active && due !== null && remaining > 0 && (workdaysLeft === 0 || remaining > (workdaysLeft ?? 0) * dailyGoal);

  let reminder: string | null = null;
  if (active && due) {
    const left =
      target === null
        ? `Progresso informado: ${demand.progressPercent}%`
        : remaining > 0
        ? `Faltam ${formatDuration(remaining)}`
        : excess > 0
          ? `Meta de horas excedida em ${formatDuration(excess)}: revise os apontamentos e conclua a demanda`
          : 'Meta de horas atingida: marque a demanda como concluída';
    const pace = requiredPerDay ? `, cerca de ${formatDuration(requiredPerDay)} por dia útil` : '';
    if (deadline === 'atrasada') reminder = `Prazo venceu em ${formatDayMonth(due)}. ${left}.`;
    else if (deadline === 'vence_hoje') reminder = `Vence hoje. ${left}.`;
    else if (deadline === 'proxima')
      reminder = `Vence em ${plural(ahead, 'dia útil', 'dias úteis')} (${formatDayMonth(due)}). ${left}${pace}.`;
    else if (atRisk)
      reminder = `Faltam ${formatDuration(remaining)} em ${plural(workdaysLeft ?? 0, 'dia útil', 'dias úteis')}: não cabe nem com a meta diária inteira.`;
  }

  return {
    logged,
    target,
    remaining,
    excess,
    percent: target ? Math.floor((logged * 100) / target) : null,
    progress,
    diagnosis,
    deadline,
    workdaysLeft,
    requiredPerDay,
    atRisk,
    reminder,
    activityCount: ofDemand.length,
    lastActivityDate: ofDemand.reduce<ISODate | null>((last, a) => (!last || a.date > last ? a.date : last), null),
  };
}

export function demandTracking(
  demandId: number,
  events: Pick<DemandEvent, 'demandId' | 'date'>[],
  blockers: Pick<DemandBlocker, 'demandId' | 'since' | 'resolvedAt'>[],
  today: ISODate,
): DemandTracking {
  const ofEvents = events.filter((e) => e.demandId === demandId);
  const ofBlockers = blockers.filter((b) => b.demandId === demandId);
  return {
    eventCount: ofEvents.length,
    lastEventDate: ofEvents.reduce<ISODate | null>((last, e) => (!last || e.date > last ? e.date : last), null),
    openBlockers: ofBlockers.filter((b) => b.resolvedAt === null).length,
    waitingWorkdays: waitingWorkdays(ofBlockers, today),
  };
}

export function buildDemandSummary(
  demand: Demand,
  activities: Pick<Activity, 'demandId' | 'date' | 'startMinute' | 'endMinute'>[],
  today: ISODate,
  dailyGoal: number,
  history: {
    events?: Pick<DemandEvent, 'demandId' | 'date'>[];
    blockers?: Pick<DemandBlocker, 'demandId' | 'since' | 'resolvedAt'>[];
  } = {},
): DemandSummary {
  return {
    ...demand,
    metrics: demandMetrics(demand, activities, today, dailyGoal),
    tracking: demandTracking(demand.id, history.events ?? [], history.blockers ?? [], today),
  };
}

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

/** Ordena pela urgência do prazo e depois pela prioridade; encerradas por último. */
export function compareDemands(a: DemandSummary, b: DemandSummary): number {
  return (
    URGENCY[a.metrics.deadline] - URGENCY[b.metrics.deadline] ||
    PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
    (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') ||
    a.title.localeCompare(b.title, 'pt-BR')
  );
}
