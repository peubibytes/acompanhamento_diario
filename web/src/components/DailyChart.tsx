import { useNavigate } from 'react-router';
import { formatDayMonth, formatDuration, todayISO, type DayMetrics } from '@acomp/shared';
import { dayStyle } from './Badges';

/** Folga acima da barra mais alta para o valor (e o ícone de status) caber dentro do gráfico. */
const HEADROOM = 1.14;

/**
 * Horas apontadas por dia útil contra a linha de meta. O status de cada dia aparece na cor da
 * barra e no ícone ao lado do valor (a cor nunca é a única pista); o diagnóstico completo está
 * no tooltip. Clicar numa coluna abre o dia. Alturas em %, para o gráfico crescer com a tela.
 */
export function DailyChart({ days, goal }: { days: DayMetrics[]; goal: number }) {
  const navigate = useNavigate();
  const today = todayISO();
  const max = Math.max(goal * 1.2, ...days.map((d) => d.minutes * HEADROOM));

  return (
    <div>
      <div className="relative h-72 sm:h-[21rem]">
        <div className="pointer-events-none absolute inset-x-0 bottom-0 border-t border-baseline" />

        <div className="absolute inset-0 flex items-end gap-2 sm:gap-4">
          {days.map((d, i) => {
            const style = dayStyle(d);
            return (
              <button
                key={d.date}
                onClick={() => navigate(`/apontamentos?data=${d.date}`)}
                className={`group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end rounded-t-xl outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  d.date === today ? 'bg-surface-2/70' : 'hover:bg-surface-2/50'
                }`}
                aria-label={`${d.weekdayLong} ${formatDayMonth(d.date)}: ${formatDuration(d.minutes)} apontadas, ${style.label}. ${d.diagnosis}.`}
              >
                <span className={`tabular mb-1.5 inline-flex flex-col items-center gap-0.5 text-sm font-semibold sm:flex-row sm:gap-1 ${d.minutes > 0 ? 'text-ink' : 'text-ink-3'}`}>
                  <span className={style.text}>{style.icon(13)}</span>
                  {d.minutes > 0 ? formatDuration(d.minutes) : '—'}
                </span>
                <span
                  className="w-full max-w-16 rounded-t-md transition-[height] duration-700 ease-out"
                  style={{
                    height: `${(d.minutes / max) * 100}%`,
                    minHeight: d.minutes > 0 ? 3 : 0,
                    background: style.bar,
                  }}
                />
                <Tooltip day={d} align={i < 2 ? 'start' : i > days.length - 3 ? 'end' : 'center'} />
              </button>
            );
          })}
        </div>

        {/* Linha de meta por cima das barras, para ficar evidente mesmo quando uma barra a cruza. */}
        <div
          className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-dashed border-ink-3"
          style={{ bottom: `${(goal / max) * 100}%` }}
        >
          <span className="absolute right-0 bottom-1 rounded bg-surface px-1.5 py-0.5 text-2xs font-semibold text-ink-2">
            Meta {formatDuration(goal)}
          </span>
        </div>
      </div>

      <div className="mt-3 flex gap-2 sm:gap-4">
        {days.map((d) => (
          <div key={d.date} className="flex flex-1 flex-col items-center text-center">
            <span className="text-sm font-semibold text-ink">{d.weekdayShort}</span>
            <span className="tabular text-xs text-ink-3">{d.date === today ? 'Hoje' : formatDayMonth(d.date)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const TOOLTIP_ALIGN = {
  start: 'left-0',
  center: 'left-1/2 -translate-x-1/2',
  end: 'right-0',
};

/**
 * Ancorado à borda nas duas primeiras e nas duas últimas colunas, para não vazar da tela no
 * celular. Fechado, sai do layout (display: none): invisível mas presente, ainda criaria rolagem.
 */
function Tooltip({ day, align }: { day: DayMetrics; align: keyof typeof TOOLTIP_ALIGN }) {
  return (
    <span
      role="tooltip"
      className={`tip-surface pointer-events-none absolute bottom-full z-20 mb-2 hidden w-48 ${TOOLTIP_ALIGN[align]} p-3 text-left group-hover:block group-hover:animate-[hint-in_0.15s_ease-out_both] group-focus-visible:block group-focus-visible:animate-[hint-in_0.15s_ease-out_both]`}
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
