import type { ReactNode } from 'react';
import {
  CYCLE_STATUS_LABEL,
  DEADLINE_LABEL,
  DEMAND_CATEGORY_LABEL,
  DEMAND_KIND_LABEL,
  DEMAND_PRIORITY_LABEL,
  formatDayMonth,
  formatDuration,
  ROUTINE_STATUS_LABEL,
  type CycleStatus,
  type DeadlineStatus,
  type DemandCategory,
  type DemandKind,
  type DemandMetrics,
  type DemandPriority,
  type RoutineStatus,
} from '@acomp/shared';
import {
  AlertIcon,
  BellIcon,
  CalendarIcon,
  CapIcon,
  CheckIcon,
  ClockIcon,
  DashIcon,
  HourglassIcon,
  TargetIcon,
  TicketIcon,
  UsersIcon,
  XIcon,
} from './icons';

/** Ícone de cada tipo de demanda: a forma diferencia, o rótulo confirma (nunca só cor). */
export const categoryIcon: Record<DemandCategory, (s: number) => ReactNode> = {
  ciclo: (s) => <TargetIcon size={s} />,
  chamado: (s) => <TicketIcon size={s} />,
  reuniao: (s) => <UsersIcon size={s} />,
  treinamento: (s) => <CapIcon size={s} />,
};

/** Ícone do tipo num círculo suave, para listas e cabeçalhos de grupo. */
export function CategoryAvatar({ category, size = 32 }: { category: DemandCategory; size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full bg-accent-soft text-accent"
      style={{ width: size, height: size }}
      title={DEMAND_CATEGORY_LABEL[category]}
    >
      {categoryIcon[category](Math.round(size * 0.5))}
    </span>
  );
}

const BADGE = 'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap';

export const deadlineStyle: Record<DeadlineStatus, { badge: string; icon: (s: number) => ReactNode }> = {
  sem_prazo: { badge: 'bg-neutral-soft text-ink-2', icon: (s) => <DashIcon size={s} /> },
  no_prazo: { badge: 'bg-accent-soft text-accent', icon: (s) => <CalendarIcon size={s} /> },
  proxima: { badge: 'bg-warning-soft text-warning-text', icon: (s) => <BellIcon size={s} /> },
  vence_hoje: { badge: 'bg-warning-soft text-warning-text', icon: (s) => <BellIcon size={s} /> },
  atrasada: { badge: 'bg-critical-soft text-critical-text', icon: (s) => <AlertIcon size={s} /> },
  concluida: { badge: 'bg-good-soft text-good-text', icon: (s) => <CheckIcon size={s} /> },
  cancelada: { badge: 'bg-neutral-soft text-ink-2', icon: (s) => <XIcon size={s} /> },
};

export function DeadlineBadge({ status }: { status: DeadlineStatus }) {
  const style = deadlineStyle[status];
  return (
    <span className={`${BADGE} ${style.badge}`}>
      {style.icon(13)}
      {DEADLINE_LABEL[status]}
    </span>
  );
}

export const cycleStatusStyle: Record<CycleStatus, { badge: string; icon: (s: number) => ReactNode }> = {
  novo: { badge: 'bg-neutral-soft text-ink-2', icon: (s) => <DashIcon size={s} /> },
  em_andamento: { badge: 'bg-accent-soft text-accent', icon: (s) => <ClockIcon size={s} /> },
  aguardando_terceiro: { badge: 'bg-warning-soft text-warning-text', icon: (s) => <HourglassIcon size={s} /> },
  em_homologacao: { badge: 'bg-accent-soft text-accent', icon: (s) => <TargetIcon size={s} /> },
  concluido: { badge: 'bg-good-soft text-good-text', icon: (s) => <CheckIcon size={s} /> },
  cancelado: { badge: 'bg-neutral-soft text-ink-3', icon: (s) => <XIcon size={s} /> },
};

export function CycleStatusBadge({ status }: { status: CycleStatus }) {
  const style = cycleStatusStyle[status];
  return (
    <span className={`${BADGE} ${style.badge}`}>
      {style.icon(13)}
      {CYCLE_STATUS_LABEL[status]}
    </span>
  );
}

export const routineStatusStyle: Record<RoutineStatus, { badge: string; icon: (s: number) => ReactNode }> = {
  nao_iniciado: { badge: 'bg-neutral-soft text-ink-2', icon: (s) => <DashIcon size={s} /> },
  iniciado: { badge: 'bg-accent-soft text-accent', icon: (s) => <ClockIcon size={s} /> },
  em_andamento: { badge: 'bg-accent-soft text-accent', icon: (s) => <ClockIcon size={s} /> },
  concluido: { badge: 'bg-good-soft text-good-text', icon: (s) => <CheckIcon size={s} /> },
};

export function RoutineStatusBadge({ status }: { status: RoutineStatus }) {
  const style = routineStatusStyle[status];
  return (
    <span className={`${BADGE} ${style.badge}`}>
      {style.icon(13)}
      {ROUTINE_STATUS_LABEL[status]}
    </span>
  );
}

/** Só o que foge do comum ganha selo: tipo diferente de "planejada" e prioridade alta/urgente. */
export function DemandFlags({ kind, priority }: { kind: DemandKind; priority: DemandPriority }) {
  return (
    <>
      {kind !== 'planejada' && (
        <span
          className={`${BADGE} ${kind === 'intempestiva' ? 'bg-warning-soft text-warning-text' : 'bg-neutral-soft text-ink-2'}`}
        >
          {DEMAND_KIND_LABEL[kind]}
        </span>
      )}
      {(priority === 'alta' || priority === 'urgente') && (
        <span
          className={`${BADGE} ${priority === 'urgente' ? 'bg-critical-soft text-critical-text' : 'bg-warning-soft text-warning-text'}`}
        >
          <AlertIcon size={13} />
          Prioridade {DEMAND_PRIORITY_LABEL[priority].toLowerCase()}
        </span>
      )}
    </>
  );
}

/** "3h20 apontadas · 4 apontamentos em 3 dias · último em 28/10" (ou o convite a apontar). */
export function LoggedSummary({ metrics: m, compact = false }: { metrics: DemandMetrics; compact?: boolean }) {
  if (m.activityCount === 0) {
    return <span className="text-xs text-ink-3">Nenhum apontamento ainda</span>;
  }
  return (
    <span className="tabular flex flex-wrap items-baseline gap-x-1.5 text-xs text-ink-2">
      <strong className="text-sm font-semibold text-ink">{formatDuration(m.logged)}</strong>
      <span>apontadas</span>
      <span className="text-ink-3">·</span>
      <span>
        {m.activityCount === 1 ? '1 apontamento' : `${m.activityCount} apontamentos`}
        {m.dayCount > 1 && ` em ${m.dayCount} dias`}
      </span>
      {!compact && m.lastActivityDate && (
        <>
          <span className="text-ink-3">·</span>
          <span>último em {formatDayMonth(m.lastActivityDate)}</span>
        </>
      )}
    </span>
  );
}
