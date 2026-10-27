import { Link } from 'react-router';
import { formatDayMonth, formatDuration, formatHM, type DayMetrics } from '@acomp/shared';
import { ArrowRight, TrendUpIcon } from './icons';

/** Dias com apontamento acima da meta definida pelo usuário: irregular, precisa de reajuste. */
export function IrregularAlert({ days, dailyGoal }: { days: DayMetrics[]; dailyGoal: number }) {
  const exceeded = days.filter((d) => d.exceeded);
  if (exceeded.length === 0) return null;

  return (
    <div role="alert" className="rise rounded-[1.25rem] border border-critical/30 bg-critical-soft px-4 py-3.5">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-critical text-white">
          <TrendUpIcon size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-critical-text">
            {exceeded.length === 1 ? 'Apontamento irregular' : `${exceeded.length} dias com apontamento irregular`}
          </p>
          <p className="text-sm text-ink-2">
            {exceeded.length === 1 ? 'O dia abaixo excedeu' : 'Os dias abaixo excederam'} a meta diária de{' '}
            <strong className="text-ink">{formatDuration(dailyGoal)}</strong>. Reajuste os horários para fechar
            exatamente a meta.
          </p>
          <ul className="mt-2.5 flex flex-wrap gap-2">
            {exceeded.map((d) => (
              <li key={d.date}>
                <Link
                  to={`/atividades?data=${d.date}`}
                  className="tabular inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-xs font-semibold text-ink shadow-sm transition hover:bg-surface-2"
                >
                  {d.weekdayShort} {formatDayMonth(d.date)}
                  <span className="text-critical-text">+{formatHM(d.diff)}</span>
                  <ArrowRight size={13} className="text-ink-3" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
