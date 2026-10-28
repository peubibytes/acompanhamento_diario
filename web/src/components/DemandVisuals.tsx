import type { ReactNode } from 'react';
import {
  DEADLINE_LABEL,
  formatDuration,
  type DeadlineStatus,
  type DemandMetrics,
} from '@acomp/shared';
import { AlertIcon, BellIcon, CalendarIcon, CheckIcon, DashIcon } from './icons';

export const deadlineStyle: Record<DeadlineStatus, { badge: string; icon: (s: number) => ReactNode }> = {
  sem_prazo: { badge: 'bg-neutral-soft text-ink-2', icon: (s) => <DashIcon size={s} /> },
  no_prazo: { badge: 'bg-accent-soft text-accent', icon: (s) => <CalendarIcon size={s} /> },
  proxima: { badge: 'bg-warning-soft text-warning-text', icon: (s) => <BellIcon size={s} /> },
  vence_hoje: { badge: 'bg-warning-soft text-warning-text', icon: (s) => <BellIcon size={s} /> },
  atrasada: { badge: 'bg-critical-soft text-critical-text', icon: (s) => <AlertIcon size={s} /> },
  concluida: { badge: 'bg-good-soft text-good-text', icon: (s) => <CheckIcon size={s} /> },
};

export function DeadlineBadge({ status }: { status: DeadlineStatus }) {
  const style = deadlineStyle[status];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${style.badge}`}
    >
      {style.icon(13)}
      {DEADLINE_LABEL[status]}
    </span>
  );
}

/** Cor da barra de horas: excedida (vermelho), atingida (verde), em risco (âmbar) ou em andamento. */
export function progressColor(m: DemandMetrics): string {
  if (m.progress === 'excedida') return 'var(--critical)';
  if (m.progress === 'atingida') return 'var(--good)';
  if (m.atRisk) return 'var(--warning)';
  return 'var(--accent)';
}

/** Horas apontadas sobre a meta; acima de 100% a barra fica cheia e vermelha. */
export function DemandProgressBar({ metrics, height = 8 }: { metrics: DemandMetrics; height?: number }) {
  return (
    <div
      className="overflow-hidden rounded-full bg-grid"
      style={{ height }}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={metrics.target}
      aria-valuenow={metrics.logged}
      aria-valuetext={`${formatDuration(metrics.logged)} de ${formatDuration(metrics.target)} (${metrics.percent}%)`}
    >
      <div
        className="h-full rounded-full transition-[width] duration-700 ease-out"
        style={{ width: `${Math.min(100, metrics.percent)}%`, background: progressColor(metrics) }}
      />
    </div>
  );
}

/** "12h de 40h" e o que falta (ou excedeu), em texto — a cor nunca carrega a informação sozinha. */
export function DemandHoursCaption({ metrics }: { metrics: DemandMetrics }) {
  const tail =
    metrics.progress === 'excedida'
      ? { text: `excedeu ${formatDuration(metrics.excess)}`, tone: 'text-critical-text font-medium' }
      : metrics.progress === 'atingida'
        ? { text: 'meta atingida', tone: 'text-good-text font-medium' }
        : { text: `faltam ${formatDuration(metrics.remaining)}`, tone: 'text-ink-2' };
  return (
    <p className="tabular flex flex-wrap items-baseline gap-x-1.5 text-xs">
      <span className="font-semibold text-ink">{formatDuration(metrics.logged)}</span>
      <span className="text-ink-3">de {formatDuration(metrics.target)}</span>
      <span className="text-ink-3">·</span>
      <span className="text-ink-2">{metrics.percent}%</span>
      <span className="text-ink-3">·</span>
      <span className={tail.tone}>{tail.text}</span>
    </p>
  );
}
