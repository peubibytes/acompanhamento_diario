import { useState } from 'react';
import { Link } from 'react-router';
import {
  formatDayMonth,
  formatDuration,
  todayISO,
  WEEKDAY_LONG,
  WEEKDAY_SHORT,
  weekdayOf,
  type CycleYield,
  type CycleYieldDay,
} from '@acomp/shared';
import { toneStyle } from './Badges';
import { ChartTooltip } from './ChartTooltip';
import { ArrowRight, DashIcon, PlusIcon, TargetIcon, TrendDownIcon, TrendUpIcon } from './icons';
import { SectionTitle } from './SectionTitle';

const HINT = (
  <>
    <span className="block">
      Quanto cada ciclo recebeu de apontamentos no período, do maior total para o menor, comparado ao período anterior
      equivalente (a semana anterior ou o mês anterior).
    </span>
    <span className="mt-1.5 block">
      <strong className="font-semibold text-ink">Barras:</strong> as horas de cada dia útil.{' '}
      <strong className="font-semibold text-ink">Linha tracejada:</strong> a média dos dias anteriores do mesmo período
      em que o ciclo teve apontamento; o primeiro dia não tem média. Passe o mouse ou foque um dia para ler os valores.
    </span>
    <span className="mt-1.5 block">
      <strong className="font-semibold text-ink">Registros:</strong> ações, decisões, validações e deploys da linha do
      tempo no período, mais o início e a resolução de impedimentos.
    </span>
    <span className="mt-1.5 block">
      Horários sobrepostos do mesmo ciclo no mesmo dia contam uma vez. Entram os ciclos com apontamento ou registro no
      período e os abertos.
    </span>
  </>
);

/** Altura útil do gráfico de cada ciclo: pequena, para vários caberem juntos. */
const HEADROOM = 1.14;

const signed = (minutes: number) => `${minutes < 0 ? '−' : '+'}${formatDuration(minutes)}`;

/**
 * Variação sobre o período anterior: ícone de seta e o texto escrito (a cor nunca é a única pista).
 * Mais horas, menos horas ou igual.
 */
function ChangeBadge({ change }: { change: CycleYield['change'] }) {
  const [tone, icon] =
    change.minutes > 0
      ? [toneStyle.conforme, <TrendUpIcon key="up" size={13} />]
      : change.minutes < 0
        ? [toneStyle.abaixo, <TrendDownIcon key="down" size={13} />]
        : [toneStyle.pendente, <DashIcon key="same" size={13} />];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${tone.badge}`}
    >
      {icon}
      {change.minutes === 0 ? 'Igual ao período anterior' : `${signed(change.minutes)} vs. período anterior`}
    </span>
  );
}

/**
 * Rendimento, bloco 2: uma linha por ciclo, com o total no período, a variação sobre o período
 * anterior e um mini-gráfico das horas por dia útil com a média dos dias anteriores.
 */
export function CycleYieldChart({ cycles }: { cycles: CycleYield[] }) {
  const empty = cycles.every((c) => c.total === 0);

  return (
    <div>
      <SectionTitle title="Rendimento por ciclo" hint={HINT} />

      {empty ? (
        <div className="mt-6 flex flex-col items-center rounded-2xl border border-dashed border-line px-6 py-14 text-center">
          <span className="grid size-10 place-items-center rounded-full bg-surface-2 text-ink-2">
            <TargetIcon size={20} />
          </span>
          <p className="mt-3 font-semibold text-ink">Nenhum apontamento em ciclos neste período</p>
          <Link
            to="/apontamentos"
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline"
          >
            <PlusIcon size={15} /> Registrar apontamentos
          </Link>
        </div>
      ) : (
        <ul className="mt-5 divide-y divide-line">
          {cycles.map((c) => (
            <li key={c.id} className="py-5 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <Link
                  to={`/demandas#demanda-${c.id}`}
                  className="min-w-0 truncate rounded text-sm font-semibold text-ink outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent"
                >
                  {c.label}
                </Link>
                <ChangeBadge change={c.change} />
              </div>
              <p className="tabular mt-1 text-xs text-ink-3">
                {c.total > 0 ? `${formatDuration(c.total)} no período` : 'Nenhum apontamento no período'}
                {c.change.percent !== null && ` · ${c.change.percent > 0 ? '+' : c.change.percent < 0 ? '−' : ''}${Math.abs(c.change.percent)}%`}
                {' · '}
                {c.timelineCount} {c.timelineCount === 1 ? 'registro' : 'registros'} na linha do tempo
                {!c.open && ' · Encerrado'}
              </p>

              <div className="mt-4">
                <MiniChart days={c.days} />
              </div>

              <Link
                to={`/detalhes?aba=ciclos&ciclo=${c.id}`}
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:underline"
              >
                Analisar linha do tempo <ArrowRight size={13} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Barras das horas de cada dia útil e, por cima, a linha tracejada da média dos dias anteriores.
 * Grade de colunas iguais: o centro de cada dia cai exatamente em (i + ½) ÷ n, onde a linha (SVG
 * esticado, de traço constante) liga os pontos.
 */
function MiniChart({ days }: { days: CycleYieldDay[] }) {
  const today = todayISO();
  const n = days.length;
  const month = n > 7;
  const max = Math.max(1, ...days.flatMap((d) => [d.minutes * HEADROOM, (d.priorAverage ?? 0) * HEADROOM]));
  const [open, setOpen] = useState<number | null>(null);

  // Os pontos da média: só os dias que a têm (o primeiro dia com apontamento em diante).
  const points = days.flatMap((d, i) =>
    d.priorAverage === null ? [] : [{ x: ((i + 0.5) / n) * 100, y: 100 - (d.priorAverage / max) * 100 }],
  );
  const line = points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');

  return (
    <div className="@container">
      <div className="relative h-24 sm:h-28">
        <div className="pointer-events-none absolute inset-x-0 bottom-0 border-t border-baseline" />
        <div className="absolute inset-0 grid items-end" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
          {days.map((d, i) => {
            const label = `${WEEKDAY_LONG[weekdayOf(d.date)]} ${formatDayMonth(d.date)}: ${
              d.minutes > 0 ? formatDuration(d.minutes) : 'sem apontamento'
            }; ${d.priorAverage === null ? 'sem média dos dias anteriores' : `média dos dias anteriores ${formatDuration(d.priorAverage)}`}.`;
            return (
              <button
                key={d.date}
                type="button"
                // Só os dias com apontamento entram na ordem do Tab; os demais seguem acessíveis pelo mouse.
                tabIndex={d.minutes > 0 ? 0 : -1}
                onMouseEnter={() => setOpen(i)}
                onMouseLeave={() => setOpen(null)}
                onFocus={() => setOpen(i)}
                onBlur={() => setOpen(null)}
                aria-label={label}
                className={`flex h-full min-w-0 items-end justify-center rounded-t-md outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  d.date === today ? 'bg-surface-2/70' : 'hover:bg-surface-2/50'
                } ${month ? 'px-px @lg:px-0.5' : 'px-1 sm:px-2'}`}
              >
                <span
                  className="w-full max-w-10 rounded-t-sm"
                  style={{ height: `${(d.minutes / max) * 100}%`, minHeight: d.minutes > 0 ? 2 : 0, background: 'var(--series-1)' }}
                />
              </button>
            );
          })}
        </div>
        {points.length > 1 && (
          <svg
            className="pointer-events-none absolute inset-0 size-full overflow-visible text-ink-2"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <polyline
              points={line}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeDasharray="5 4"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        )}
        {open !== null && <YieldTooltip day={days[open]} center={((open + 0.5) / n) * 100} />}
      </div>

      <div className="mt-2 grid" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        {days.map((d, i) => (
          <span
            key={d.date}
            className={`tabular text-center text-2xs whitespace-nowrap ${d.date === today ? 'font-semibold text-ink' : 'text-ink-3'} ${
              month && i % 5 !== 0 ? '@max-2xl:invisible' : ''
            }`}
          >
            {month ? d.date.slice(8) : WEEKDAY_SHORT[weekdayOf(d.date)]}
          </span>
        ))}
      </div>
    </div>
  );
}

function YieldTooltip({ day, center }: { day: CycleYieldDay; center: number }) {
  const diff = day.priorAverage === null ? null : day.minutes - day.priorAverage;
  return (
    <ChartTooltip center={center}>
      <span className="block text-xs font-semibold text-ink">
        {WEEKDAY_LONG[weekdayOf(day.date)]}, {formatDayMonth(day.date)}
      </span>
      <span className="mt-2 grid grid-cols-2 gap-y-1 text-xs">
        <span className="text-ink-3">Apontado</span>
        <span className="tabular text-right font-medium text-ink">{day.minutes > 0 ? formatDuration(day.minutes) : '—'}</span>
        <span className="text-ink-3">Média anterior</span>
        <span className="tabular text-right font-medium text-ink">
          {day.priorAverage === null ? '—' : formatDuration(day.priorAverage)}
        </span>
        <span className="text-ink-3">Diferença</span>
        <span className="tabular text-right font-medium text-ink">{diff === null ? '—' : diff === 0 ? 'Igual' : signed(diff)}</span>
      </span>
    </ChartTooltip>
  );
}
