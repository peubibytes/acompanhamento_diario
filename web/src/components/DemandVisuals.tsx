import type { ReactNode } from 'react';
import {
  DEADLINE_LABEL,
  DEMAND_KIND_LABEL,
  DEMAND_PRIORITY_LABEL,
  DEMAND_STATUS_LABEL,
  formatDuration,
  type DeadlineStatus,
  type DemandKind,
  type DemandMetrics,
  type DemandPriority,
  type DemandStatus,
  type DemandSummary,
} from '@acomp/shared';
import { AlertIcon, BellIcon, CalendarIcon, CheckIcon, ClockIcon, DashIcon, HourglassIcon, TargetIcon, XIcon } from './icons';

export const deadlineStyle: Record<DeadlineStatus, { badge: string; icon: (s: number) => ReactNode }> = {
  sem_prazo: { badge: 'bg-neutral-soft text-ink-2', icon: (s) => <DashIcon size={s} /> },
  no_prazo: { badge: 'bg-accent-soft text-accent', icon: (s) => <CalendarIcon size={s} /> },
  proxima: { badge: 'bg-warning-soft text-warning-text', icon: (s) => <BellIcon size={s} /> },
  vence_hoje: { badge: 'bg-warning-soft text-warning-text', icon: (s) => <BellIcon size={s} /> },
  atrasada: { badge: 'bg-critical-soft text-critical-text', icon: (s) => <AlertIcon size={s} /> },
  concluida: { badge: 'bg-good-soft text-good-text', icon: (s) => <CheckIcon size={s} /> },
  cancelada: { badge: 'bg-neutral-soft text-ink-2', icon: (s) => <XIcon size={s} /> },
};

const BADGE = 'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap';

export function DeadlineBadge({ status }: { status: DeadlineStatus }) {
  const style = deadlineStyle[status];
  return (
    <span className={`${BADGE} ${style.badge}`}>
      {style.icon(13)}
      {DEADLINE_LABEL[status]}
    </span>
  );
}

export const demandStatusStyle: Record<DemandStatus, { badge: string; icon: (s: number) => ReactNode }> = {
  novo: { badge: 'bg-neutral-soft text-ink-2', icon: (s) => <DashIcon size={s} /> },
  em_andamento: { badge: 'bg-accent-soft text-accent', icon: (s) => <ClockIcon size={s} /> },
  aguardando_terceiro: { badge: 'bg-warning-soft text-warning-text', icon: (s) => <HourglassIcon size={s} /> },
  em_homologacao: { badge: 'bg-accent-soft text-accent', icon: (s) => <TargetIcon size={s} /> },
  concluido: { badge: 'bg-good-soft text-good-text', icon: (s) => <CheckIcon size={s} /> },
  cancelado: { badge: 'bg-neutral-soft text-ink-3', icon: (s) => <XIcon size={s} /> },
};

export function DemandStatusBadge({ status }: { status: DemandStatus }) {
  const style = demandStatusStyle[status];
  return (
    <span className={`${BADGE} ${style.badge}`}>
      {style.icon(13)}
      {DEMAND_STATUS_LABEL[status]}
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

/** Cor da barra de horas: excedida (vermelho), atingida (verde), em risco (âmbar) ou em andamento. */
export function progressColor(m: DemandMetrics): string {
  if (m.progress === 'excedida') return 'var(--critical)';
  if (m.progress === 'atingida') return 'var(--good)';
  if (m.atRisk) return 'var(--warning)';
  return 'var(--accent)';
}

type ProgressSource = Pick<DemandSummary, 'metrics' | 'progressPercent'>;

/**
 * Com meta de horas: horas apontadas sobre a meta (acima de 100% a barra fica cheia e vermelha).
 * Sem meta: o % de progresso informado pelo usuário.
 */
export function DemandProgressBar({ demand, height = 8 }: { demand: ProgressSource; height?: number }) {
  const m = demand.metrics;
  const byHours = m.target !== null && m.percent !== null;
  const percent = byHours ? m.percent! : demand.progressPercent;
  return (
    <div
      className="overflow-hidden rounded-full bg-grid"
      style={{ height }}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={byHours ? m.target! : 100}
      aria-valuenow={byHours ? m.logged : percent}
      aria-valuetext={
        byHours
          ? `${formatDuration(m.logged)} de ${formatDuration(m.target!)} (${percent}%)`
          : `Progresso informado: ${percent}%`
      }
    >
      <div
        className="h-full rounded-full transition-[width] duration-700 ease-out"
        style={{ width: `${Math.min(100, percent)}%`, background: byHours ? progressColor(m) : 'var(--accent)' }}
      />
    </div>
  );
}

/** "12h de 40h" e o que falta (ou excedeu), em texto — a cor nunca carrega a informação sozinha. */
export function DemandHoursCaption({ demand }: { demand: ProgressSource }) {
  const m = demand.metrics;
  if (m.target === null) {
    return (
      <p className="tabular flex flex-wrap items-baseline gap-x-1.5 text-xs">
        <span className="font-semibold text-ink">{demand.progressPercent}%</span>
        <span className="text-ink-3">concluído</span>
        <span className="text-ink-3">·</span>
        <span className="text-ink-2">{formatDuration(m.logged)} apontadas, sem meta de horas</span>
      </p>
    );
  }
  const tail =
    m.progress === 'excedida'
      ? { text: `excedeu ${formatDuration(m.excess)}`, tone: 'text-critical-text font-medium' }
      : m.progress === 'atingida'
        ? { text: 'meta atingida', tone: 'text-good-text font-medium' }
        : { text: `faltam ${formatDuration(m.remaining)}`, tone: 'text-ink-2' };
  return (
    <p className="tabular flex flex-wrap items-baseline gap-x-1.5 text-xs">
      <span className="font-semibold text-ink">{formatDuration(m.logged)}</span>
      <span className="text-ink-3">de {formatDuration(m.target)}</span>
      <span className="text-ink-3">·</span>
      <span className="text-ink-2">{m.percent}%</span>
      <span className="text-ink-3">·</span>
      <span className={tail.tone}>{tail.text}</span>
    </p>
  );
}
