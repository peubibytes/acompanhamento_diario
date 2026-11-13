import type { ReactNode } from 'react';
import {
  CYCLE_STATUS_LABEL,
  DEADLINE_LABEL,
  DEMAND_CATEGORY_LABEL,
  formatDayMonth,
  formatDuration,
  TASK_STATUS_LABEL,
  type CycleStatus,
  type DeadlineStatus,
  type DemandCategory,
  type DemandMetrics,
  type TaskStatus,
  type TicketStatus,
} from '@acomp/shared';
import {
  AlertIcon,
  BellIcon,
  CalendarIcon,
  CapIcon,
  CheckIcon,
  ChecklistIcon,
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
  atividade: (s) => <ChecklistIcon size={s} />,
};

/** Cor fixa de cada tipo (tokens --cat-* em index.css): preenche gráficos e o fundo do chip escolhido. */
export const categoryColor: Record<DemandCategory, string> = {
  ciclo: 'var(--cat-ciclo)',
  chamado: 'var(--cat-chamado)',
  reuniao: 'var(--cat-reuniao)',
  treinamento: 'var(--cat-treinamento)',
  atividade: 'var(--cat-atividade)',
};

/** A mesma cor, na variante para desenhar sobre o fundo (ícone, anel): contraste ≥ 3:1 nos dois temas. */
export const categoryInk: Record<DemandCategory, string> = {
  ciclo: 'var(--cat-ciclo-ink)',
  chamado: 'var(--cat-chamado-ink)',
  reuniao: 'var(--cat-reuniao-ink)',
  treinamento: 'var(--cat-treinamento-ink)',
  atividade: 'var(--cat-atividade-ink)',
};

/** Ícone do tipo num quadrado suave na cor do tipo, para listas e cabeçalhos de grupo. */
export function CategoryAvatar({ category, size = 32 }: { category: DemandCategory; size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-control"
      style={{
        width: size,
        height: size,
        color: categoryInk[category],
        background: `color-mix(in srgb, ${categoryColor[category]} 14%, var(--surface))`,
      }}
      title={DEMAND_CATEGORY_LABEL[category]}
    >
      {categoryIcon[category](Math.round(size * 0.5))}
    </span>
  );
}

const BADGE = 'badge';

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

/** Ciclo aberto sem atualização há dias úteis demais (ver STALLED_WORKDAYS). */
export function StalledBadge({ idleWorkdays }: { idleWorkdays: number }) {
  return (
    <span className={`${BADGE} bg-warning-soft text-warning-text`}>
      <HourglassIcon size={13} />
      Parado há {idleWorkdays} dias úteis
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

export const taskStatusStyle: Record<TaskStatus | TicketStatus, { badge: string; icon: (s: number) => ReactNode }> = {
  nao_iniciado: { badge: 'bg-neutral-soft text-ink-2', icon: (s) => <DashIcon size={s} /> },
  em_andamento: { badge: 'bg-accent-soft text-accent', icon: (s) => <ClockIcon size={s} /> },
  // Em espera (chamados, treinamentos e atividades): âmbar com ampulheta; a cor nunca é a única pista.
  em_espera: { badge: 'bg-warning-soft text-warning-text', icon: (s) => <HourglassIcon size={s} /> },
  concluido: { badge: 'bg-good-soft text-good-text', icon: (s) => <CheckIcon size={s} /> },
};

export function TaskStatusBadge({ status }: { status: TaskStatus | TicketStatus }) {
  const style = taskStatusStyle[status];
  return (
    <span className={`${BADGE} ${style.badge}`}>
      {style.icon(13)}
      {TASK_STATUS_LABEL[status]}
    </span>
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
