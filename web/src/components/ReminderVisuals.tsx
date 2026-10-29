import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { AppNotification, Severity } from '@acomp/shared';
import { targetHref } from '../api/reminders';
import { BellIcon, CalendarIcon, TargetIcon, TrendUpIcon } from './icons';

export const severityStyle: Record<Severity, { chip: string; label: string }> = {
  critical: { chip: 'bg-critical-soft text-critical-text', label: 'Urgente' },
  warning: { chip: 'bg-warning-soft text-warning-text', label: 'Atenção' },
  info: { chip: 'bg-accent-soft text-accent', label: 'Informativo' },
};

const kindIcon: Record<AppNotification['kind'], (s: number) => ReactNode> = {
  dia_irregular: (s) => <TrendUpIcon size={s} />,
  prazo_demanda: (s) => <TargetIcon size={s} />,
  apontamento: (s) => <CalendarIcon size={s} />,
};

const actionLabel: Record<AppNotification['kind'], string> = {
  dia_irregular: 'Abrir o dia',
  prazo_demanda: 'Ver demanda',
  apontamento: 'Ver painel',
};

export function SeverityIcon({ severity, kind, size = 16 }: { severity: Severity; kind: AppNotification['kind']; size?: number }) {
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full ${severityStyle[severity].chip}`}
      style={{ width: size + 14, height: size + 14 }}
      title={severityStyle[severity].label}
    >
      {kindIcon[kind](size)}
    </span>
  );
}

/** Uma notificação. `compact` = versão do resumo do sino (sem botão de ação). */
export function ReminderRow({
  item,
  compact = false,
  onNavigate,
}: {
  item: AppNotification;
  compact?: boolean;
  onNavigate?: () => void;
}) {
  const body = (
    <>
      <SeverityIcon severity={item.severity} kind={item.kind} size={compact ? 14 : 16} />
      <span className="min-w-0 flex-1">
        <span className={`flex min-w-0 items-center gap-x-2 gap-y-1 ${compact ? '' : 'flex-wrap'}`}>
          {/* Resumo do sino: uma linha só; tela completa: o título quebra para não esconder a data. */}
          <span className={`min-w-0 font-semibold text-ink ${compact ? 'truncate text-xs' : 'text-sm'}`}>{item.title}</span>
          {!compact && item.severity !== 'info' && (
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-2xs font-semibold ${severityStyle[item.severity].chip}`}>
              {severityStyle[item.severity].label}
            </span>
          )}
        </span>
        <span className={`mt-0.5 block text-ink-2 ${compact ? 'line-clamp-2 text-xs' : 'text-sm'}`}>{item.detail}</span>
        {!compact && (
          <span className="mt-2 inline-block text-xs font-semibold text-accent group-hover:underline">
            {actionLabel[item.kind]} →
          </span>
        )}
      </span>
    </>
  );

  return (
    <Link
      to={targetHref(item.target)}
      onClick={onNavigate}
      className={`group flex items-start gap-3 rounded-xl transition hover:bg-surface-2 ${compact ? 'px-2.5 py-2' : 'p-3'}`}
    >
      {body}
    </Link>
  );
}

export function EmptyReminders({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`flex flex-col items-center text-center ${compact ? 'px-4 py-6' : 'px-6 py-10'}`}>
      <span className="grid size-10 place-items-center rounded-full bg-good-soft text-good-text">
        <BellIcon size={18} />
      </span>
      <p className="mt-2 text-sm font-semibold text-ink">Nada pendente</p>
      <p className="mt-0.5 text-xs text-ink-3">Nenhum lembrete pedindo atenção agora.</p>
    </div>
  );
}

