import type { ReactNode } from 'react';
import { CONFORMITY_LABEL, type DayMetrics } from '@acomp/shared';
import { AlertIcon, CheckIcon, DashIcon, TrendUpIcon } from './icons';

function Badge({ className, icon, children }: { className: string; icon: ReactNode; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${className}`}>
      {icon}
      {children}
    </span>
  );
}

/**
 * Situação visual do dia. "Não conforme" da planilha se divide em dois casos com
 * tratamentos diferentes: abaixo da meta (falta apontar) e acima (irregular, reajustar).
 */
export type DayTone = 'conforme' | 'abaixo' | 'acima' | 'pendente';

export const dayTone = (d: Pick<DayMetrics, 'conformity' | 'exceeded'>): DayTone =>
  d.conformity === 'nao_conforme' ? (d.exceeded ? 'acima' : 'abaixo') : d.conformity;

export const toneStyle: Record<
  DayTone,
  { label: string; short: string; badge: string; text: string; bar: string; icon: (size: number) => ReactNode }
> = {
  conforme: {
    label: 'Conforme',
    short: 'Conforme',
    badge: 'bg-good-soft text-good-text',
    text: 'text-good-text',
    bar: 'var(--good)',
    icon: (s) => <CheckIcon size={s} />,
  },
  abaixo: {
    label: 'Abaixo da meta',
    short: 'Abaixo',
    badge: 'bg-warning-soft text-warning-text',
    text: 'text-warning-text',
    bar: 'var(--warning)',
    icon: (s) => <AlertIcon size={s} />,
  },
  acima: {
    label: 'Acima da meta · irregular',
    short: 'Irregular',
    badge: 'bg-critical-soft text-critical-text',
    text: 'text-critical-text',
    bar: 'var(--critical)',
    icon: (s) => <TrendUpIcon size={s} />,
  },
  pendente: {
    label: 'Pendente',
    short: 'Pendente',
    badge: 'bg-neutral-soft text-ink-2',
    text: 'text-ink-3',
    bar: 'var(--neutral)',
    icon: (s) => <DashIcon size={s} />,
  },
};

export const dayStyle = (d: Pick<DayMetrics, 'conformity' | 'exceeded'>) => toneStyle[dayTone(d)];

/** Badge de conformidade (rótulo da planilha); o excedido ganha cor e ícone próprios. */
export function ConformityBadge({ day }: { day: Pick<DayMetrics, 'conformity' | 'exceeded'> }) {
  const style = dayStyle(day);
  return (
    <Badge className={style.badge} icon={style.icon(13)}>
      {day.exceeded ? 'Irregular' : CONFORMITY_LABEL[day.conformity]}
    </Badge>
  );
}

