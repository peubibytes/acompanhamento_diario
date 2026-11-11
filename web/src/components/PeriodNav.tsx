import { formatDayMonth, formatPeriodLabel, getPeriod, shiftPeriod, todayISO, type ISODate, type PeriodScale } from '@acomp/shared';
import { CalendarIcon, ChevronLeft, ChevronRight } from './icons';

/** Navegação entre períodos: semana (sexta → quinta) ou mês. */
export function PeriodNav({
  date,
  scale,
  onChange,
}: {
  date: ISODate;
  scale: PeriodScale;
  onChange: (date: ISODate) => void;
}) {
  const period = getPeriod(date, scale);
  const current = getPeriod(todayISO(), scale).start;
  const isCurrent = period.start === current;
  const tag = isCurrent ? 'Período atual' : period.start < current ? 'Período anterior' : 'Próximo período';

  const navButton = 'press btn-icon';

  return (
    <div className="flex flex-wrap items-center gap-1">
      <button className={navButton} onClick={() => onChange(shiftPeriod(date, scale, -1))} aria-label="Período anterior">
        <ChevronLeft />
      </button>
      <div className="min-w-0 px-1 text-center sm:text-left">
        <p className="text-2xs font-semibold tracking-wider text-ink-3 uppercase">{tag}</p>
        {/* A chave refaz a entrada do texto a cada período. */}
        <p key={period.start} className="swap-in tabular text-sm font-semibold whitespace-nowrap text-ink sm:text-base">
          {scale === 'week' ? (
            <>
              Sex {formatDayMonth(period.start)} <span className="text-ink-3">→</span> Qui {formatDayMonth(period.end)}
            </>
          ) : (
            formatPeriodLabel(period)
          )}
        </p>
      </div>
      <button className={navButton} onClick={() => onChange(shiftPeriod(date, scale, 1))} aria-label="Próximo período">
        <ChevronRight />
      </button>
      {!isCurrent && (
        <button
          onClick={() => onChange(todayISO())}
          className="ml-1 inline-flex items-center gap-1.5 rounded-control bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent transition hover:brightness-95"
        >
          <CalendarIcon size={14} /> Hoje
        </button>
      )}
    </div>
  );
}
