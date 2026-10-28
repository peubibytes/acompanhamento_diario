import { useNavigate } from 'react-router';
import { formatDayMonth, formatDuration, todayISO, type DayMetrics } from '@acomp/shared';
import { dayStyle } from './Badges';

const PLOT_HEIGHT = 200;

/** Horas apontadas por dia útil contra a linha de meta. Clicar numa coluna abre o dia. */
export function DailyChart({ days, goal }: { days: DayMetrics[]; goal: number }) {
  const navigate = useNavigate();
  const today = todayISO();
  const max = Math.max(goal * 1.2, ...days.map((d) => d.minutes * 1.08));
  const goalY = (goal / max) * PLOT_HEIGHT;

  return (
    <div className="relative">
      <div className="relative" style={{ height: PLOT_HEIGHT + 28 }}>
        {/* Linha de meta */}
        <div
          className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-baseline"
          style={{ bottom: goalY }}
        >
          <span className="absolute -top-5 right-0 rounded bg-surface px-1 text-[11px] font-medium text-ink-2">
            Meta {formatDuration(goal)}
          </span>
        </div>
        {/* Linha de base */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 border-t border-baseline" />

        <div className="absolute inset-0 flex items-end gap-2 sm:gap-4">
          {days.map((d, i) => {
            const height = (d.minutes / max) * PLOT_HEIGHT;
            const isToday = d.date === today;
            return (
              <button
                key={d.date}
                onClick={() => navigate(`/apontamentos?data=${d.date}`)}
                className={`group relative flex h-full flex-1 flex-col items-center justify-end rounded-t-xl outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  isToday ? 'bg-accent-soft/60' : 'hover:bg-surface-2/70'
                }`}
                aria-label={`${d.weekdayLong} ${formatDayMonth(d.date)}: ${formatDuration(d.minutes)} apontadas, ${dayStyle(d).label}. ${d.diagnosis}.`}
              >
                <span className="tabular mb-1.5 text-xs font-semibold text-ink">
                  {d.minutes > 0 ? formatDuration(d.minutes) : '—'}
                </span>
                <span
                  className="w-full max-w-14 rounded-t transition-[height] duration-700 ease-out"
                  style={{ height: Math.max(height, d.minutes > 0 ? 3 : 0), background: dayStyle(d).bar }}
                />
                <Tooltip day={d} align={i === 0 ? 'start' : i === days.length - 1 ? 'end' : 'center'} />
              </button>
            );
          })}
        </div>
      </div>

      {/* Eixo: dia, data e status (ícone + rótulo, nunca só cor) */}
      <div className="mt-3 flex gap-2 sm:gap-4">
        {days.map((d) => {
          const isToday = d.date === today;
          return (
            <div key={d.date} className="flex flex-1 flex-col items-center gap-0.5 text-center">
              <span className={`text-sm font-semibold ${isToday ? 'text-accent' : 'text-ink'}`}>
                {d.weekdayShort}
              </span>
              <span className="tabular text-xs text-ink-3">{isToday ? 'Hoje' : formatDayMonth(d.date)}</span>
              <span
                className={`mt-1 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium sm:text-[11px] ${dayStyle(d).badge}`}
              >
                {dayStyle(d).icon(11)}
                <span className="hidden sm:inline">{dayStyle(d).short}</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const TOOLTIP_ALIGN = {
  start: 'left-0',
  center: 'left-1/2 -translate-x-1/2',
  end: 'right-0',
};

/** Ancorado à borda nas colunas das pontas para não vazar da tela no celular. */
function Tooltip({ day, align }: { day: DayMetrics; align: keyof typeof TOOLTIP_ALIGN }) {
  return (
    <span
      role="tooltip"
      className={`card pointer-events-none absolute bottom-full z-20 mb-2 w-48 ${TOOLTIP_ALIGN[align]} -translate-y-1 p-3 text-left opacity-0 transition group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100`}
    >
      <span className="block text-xs font-semibold text-ink">
        {day.weekdayLong}, {formatDayMonth(day.date)}
      </span>
      <span className="mt-2 grid grid-cols-2 gap-y-1 text-xs">
        <span className="text-ink-3">Apontado</span>
        <span className="tabular text-right font-medium text-ink">{formatDuration(day.minutes)}</span>
        <span className="text-ink-3">Diferença</span>
        <span className="tabular text-right font-medium text-ink">{day.diffLabel || '—'}</span>
        <span className="text-ink-3">Apontamentos</span>
        <span className="tabular text-right font-medium text-ink">{day.activityCount}</span>
      </span>
      <span
        className={`mt-2 block border-t border-line pt-2 text-xs ${day.exceeded ? 'font-medium text-critical-text' : 'text-ink-2'}`}
      >
        {day.diagnosis}
      </span>
    </span>
  );
}
