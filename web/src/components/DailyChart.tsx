import { useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router';
import { formatDayMonth, formatDuration, todayISO, type DayMetrics, type DemandCategory, type PeriodScale } from '@acomp/shared';
import { useDayActivities, useDemands } from '../api/client';
import { dayStyle } from './Badges';
import { ChartTooltip, COLUMN_GAP, SIDE_GUTTER } from './ChartTooltip';

/** Folga acima da barra mais alta para o valor (e o ícone de status) caber dentro do gráfico. */
const HEADROOM = 1.14;

/**
 * Horas apontadas por dia útil contra a linha de meta. O status de cada dia aparece na cor da
 * barra e no ícone ao lado do valor (a cor nunca é a única pista); o diagnóstico completo está
 * no tooltip. Clicar numa coluna abre o dia. Alturas em %, para o gráfico crescer com a tela.
 *
 * No mês são ~22 colunas: o ícone e o valor só aparecem quando cabem (pela largura do gráfico,
 * não da tela); o rótulo de baixo é só o dia (dd), e em gráficos estreitos só de 5 em 5. O que
 * não cabe fica no tooltip e no aria-label de cada coluna.
 */
export function DailyChart({ days, goal, scale = 'week' }: { days: DayMetrics[]; goal: number; scale?: PeriodScale }) {
  const navigate = useNavigate();
  const today = todayISO();
  const month = scale === 'month';
  const max = Math.max(goal * 1.2, ...days.map((d) => d.minutes * HEADROOM));
  // Só uma coluna mostra o tooltip por vez; ele fica dentro da largura do gráfico (ver Tooltip).
  const [open, setOpen] = useState<number | null>(null);

  return (
    // Em lg, a área das barras encolhe (até 9rem) quando o Painel cabe na janela; as alturas são em %, então acompanham.
    <div className="@container lg:flex lg:min-h-0 lg:flex-col">
      <div className="relative h-72 sm:h-[21rem] lg:min-h-36">
        <div className="pointer-events-none absolute inset-x-0 bottom-0 border-t border-baseline" />

        <div className={`absolute inset-0 flex items-end ${COLUMN_GAP[scale]} ${month ? SIDE_GUTTER.inset : ''}`}>
          {days.map((d, i) => {
            const style = dayStyle(d);
            return (
              <button
                key={d.date}
                onClick={() => navigate(`/apontamentos?data=${d.date}`)}
                onMouseEnter={() => setOpen(i)}
                onMouseLeave={() => setOpen(null)}
                onFocus={() => setOpen(i)}
                onBlur={() => setOpen(null)}
                className={`relative flex h-full min-w-0 flex-1 flex-col items-center justify-end rounded-t-xl outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  d.date === today ? 'bg-surface-2/70' : 'hover:bg-surface-2/50'
                }`}
                aria-label={`${d.weekdayLong} ${formatDayMonth(d.date)}: ${formatDuration(d.minutes)} apontadas, ${style.label}. ${d.diagnosis}.`}
              >
                {month ? (
                  <span
                    className={`tabular mb-1.5 hidden flex-col items-center gap-0.5 text-xs font-semibold @lg:flex ${d.minutes > 0 ? 'text-ink' : 'text-ink-3'}`}
                  >
                    <span className={style.text}>{style.icon(13)}</span>
                    <span className="hidden @[58rem]:inline">{d.minutes > 0 ? formatDuration(d.minutes) : '—'}</span>
                  </span>
                ) : (
                  <span
                    className={`tabular mb-1.5 inline-flex flex-col items-center gap-0.5 text-sm font-semibold sm:flex-row sm:gap-1 ${d.minutes > 0 ? 'text-ink' : 'text-ink-3'}`}
                  >
                    <span className={style.text}>{style.icon(13)}</span>
                    {d.minutes > 0 ? formatDuration(d.minutes) : '—'}
                  </span>
                )}
                <span
                  className={`grow-y w-full rounded-t-md transition-[height] duration-700 ease-out ${month ? 'max-w-10' : 'max-w-16'}`}
                  style={{
                    // As barras crescem da linha de base, uma depois da outra (mais rápido no mês, com ~22 colunas).
                    ...({ '--i': i, '--grow-step': month ? '14ms' : '45ms' } as CSSProperties),
                    height: `${(d.minutes / max) * 100}%`,
                    minHeight: d.minutes > 0 ? 3 : 0,
                    background: style.bar,
                  }}
                />
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

        {open !== null && <Tooltip day={days[open]} center={((open + 0.5) / days.length) * 100} />}
      </div>

      <div className={`mt-3 flex shrink-0 ${COLUMN_GAP[scale]} ${month ? SIDE_GUTTER.pad : ''}`}>
        {days.map((d, i) => (
          <div key={d.date} className="flex min-w-0 flex-1 flex-col items-center text-center">
            {month ? (
              <span
                className={`tabular text-xs whitespace-nowrap ${d.date === today ? 'font-semibold text-ink' : 'text-ink-3'} ${
                  i % 5 === 0 ? '' : '@max-2xl:invisible'
                }`}
              >
                {d.date.slice(8)}
              </span>
            ) : (
              <>
                <span className="text-sm font-semibold text-ink">{d.weekdayShort}</span>
                <span className="tabular text-xs text-ink-3">{d.date === today ? 'Hoje' : formatDayMonth(d.date)}</span>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Tipos de demanda contados no tooltip, na ordem em que aparecem. */
const KINDS: { category: DemandCategory; label: string }[] = [
  { category: 'reuniao', label: 'Reuniões' },
  { category: 'chamado', label: 'Chamados' },
  { category: 'treinamento', label: 'Treinamentos' },
  { category: 'atividade', label: 'Atividades' },
  { category: 'ciclo', label: 'Ciclos' },
];

function Tooltip({ day, center }: { day: DayMetrics; center: number }) {
  // Os apontamentos do dia (mesmo cache da tela Apontamentos) e o tipo de cada demanda apontada.
  const activities = useDayActivities(day.date);
  const demands = useDemands();
  const categoryOf = new Map(demands.data?.map((d) => [d.id, d.category]));
  // Demandas distintas por tipo: a mesma reunião apontada duas vezes no dia conta uma.
  const apontadas = new Map<DemandCategory, Set<number>>();
  for (const a of activities.data ?? []) {
    const category = a.demandId !== null ? categoryOf.get(a.demandId) : undefined;
    if (category) apontadas.set(category, (apontadas.get(category) ?? new Set()).add(a.demandId!));
  }
  const loaded = activities.isSuccess && demands.isSuccess;

  return (
    <ChartTooltip center={center}>
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
      <span className="mt-2 grid grid-cols-2 gap-y-1 border-t border-line pt-2 text-xs">
        {KINDS.map((k) => (
          <span key={k.category} className="contents">
            <span className="text-ink-3">{k.label}</span>
            <span className="tabular text-right font-medium text-ink">
              {loaded ? (apontadas.get(k.category)?.size ?? 0) : '—'}
            </span>
          </span>
        ))}
      </span>
      <span
        className={`mt-2 block border-t border-line pt-2 text-xs ${day.exceeded ? 'font-medium text-critical-text' : 'text-ink-2'}`}
      >
        {day.diagnosis}
      </span>
    </ChartTooltip>
  );
}
