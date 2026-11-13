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

  const navButton =
    'press grid w-9 shrink-0 place-items-center self-stretch text-ink-2 outline-none hover:bg-surface-2 hover:text-ink focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent';

  // Um controle só, encaixado como num painel: ‹ período ›. A situação (atual, anterior, próximo) vai junto do
  // nome, em caixa normal, no lugar da antiga "sobrancelha" em caixa alta.
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex h-9 min-w-0 items-stretch rounded-control border border-line-strong bg-surface">
        <button className={navButton} onClick={() => onChange(shiftPeriod(date, scale, -1))} aria-label="Período anterior">
          <ChevronLeft />
        </button>
        <div className="flex min-w-0 items-center gap-1.5 border-x border-line px-3">
          <p className="hidden text-sm text-ink-3 md:inline">{tag}</p>
          <span aria-hidden="true" className="hidden text-ink-3 md:inline">·</span>
          {/* A chave refaz a entrada do texto a cada período. */}
          <p key={period.start} className="swap-in tabular text-sm font-semibold whitespace-nowrap text-ink">
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
      </div>
      {!isCurrent && (
        <button onClick={() => onChange(todayISO())} className="btn-secondary btn-sm h-9">
          <CalendarIcon size={14} /> Hoje
        </button>
      )}
    </div>
  );
}
