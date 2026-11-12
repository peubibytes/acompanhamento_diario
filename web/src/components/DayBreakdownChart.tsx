import { useState } from 'react';
import { Link } from 'react-router';
import {
  anchorDate,
  dayBreakdown,
  DEMAND_CATEGORY_LABEL,
  formatDayMonth,
  formatPeriodLabel,
  formatDuration,
  todayISO,
  type BreakdownSlice,
  type DemandCategory,
  type DayMetrics,
  type ISODate,
  type PeriodScale,
  type PeriodWindow,
} from '@acomp/shared';
import { useDayActivities, useDemands, useRangeActivities } from '../api/client';
import { SectionTitle } from './SectionTitle';
import { Skeleton } from './States';
import { DashIcon, PlusIcon } from './icons';
import { categoryColor, categoryIcon, categoryInk } from './DemandVisuals';

/** Geometria interna do gráfico; o SVG escala com o contêiner (viewBox). */
const SIZE = 280;
const STROKE = 40;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** Espaço (cor da superfície) entre fatias vizinhas: 3px, mas nunca mais que 40% do arco, para fatia pequena não sumir. */
const GAP = 3;
const GAP_MAX_SHARE = 0.4;
/** Tamanho mínimo visível de um arco (px do SVG). */
const MIN_ARC = 1.5;
/** Ordem dos tipos na rosca (a mesma do Rendimento) e cor dos apontamentos antigos, sem demanda. */
const CATEGORY_ORDER: DemandCategory[] = ['chamado', 'reuniao', 'treinamento', 'atividade', 'ciclo'];
const NO_DEMAND_COLOR = 'var(--series-other)';

/** Tons de um tipo: a cor dele, a variante que desenha e as duas mais suaves; passando de quatro, repetem. */
const tonesOf = (c: DemandCategory) => [
  categoryColor[c],
  categoryInk[c],
  `color-mix(in srgb, ${categoryColor[c]} 55%, var(--surface))`,
  `color-mix(in srgb, ${categoryInk[c]} 55%, var(--surface))`,
];

interface ColoredSlice extends BreakdownSlice {
  color: string;
  category: DemandCategory | null;
}

/**
 * Cor pelo tipo da demanda (v0.18): a mesma do Rendimento e do seletor de categoria. Duas demandas do mesmo tipo
 * recebem tons dele, pela identidade (id), não pelo tamanho. As fatias saem agrupadas por tipo, na ordem fixa, e o
 * ícone do tipo acompanha cada nome na legenda: a cor nunca é a única pista.
 */
function colorize(slices: BreakdownSlice[], categoryOf: Map<number, DemandCategory>): ColoredSlice[] {
  const withCategory = slices.map((s) => ({
    ...s,
    category: s.kind === 'demanda' ? (categoryOf.get(s.demandId!) ?? null) : null,
  }));
  const rank = (c: DemandCategory | null) => (c ? CATEGORY_ORDER.indexOf(c) : CATEGORY_ORDER.length);
  const sorted = withCategory.sort(
    (a, b) =>
      rank(a.category) - rank(b.category) ||
      (a.demandId ?? 0) - (b.demandId ?? 0) ||
      a.label.localeCompare(b.label, 'pt-BR'),
  );
  const seen = new Map<DemandCategory, number>();
  return sorted.map((s) => {
    if (!s.category) return { ...s, color: NO_DEMAND_COLOR };
    const n = seen.get(s.category) ?? 0;
    seen.set(s.category, n + 1);
    const tones = tonesOf(s.category);
    return { ...s, color: tones[n % tones.length] };
  });
}

/** "<1%" para fatia pequena, em vez de "0%". */
const percentText = (share: number) => (share > 0 && share < 1 ? '<1%' : `${Math.round(share)}%`);

/** Dia inicial: hoje, se estiver no ciclo; senão o último dia útil já passado (ou a sexta). */
function initialDay(days: DayMetrics[]): ISODate {
  const today = todayISO();
  return days.map((d) => d.date).filter((d) => d <= today).at(-1) ?? days[0].date;
}

const HINT = (scale: PeriodScale) => (
  <>
    <span className="block">
      {scale === 'month'
        ? 'Quais demandas ocuparam mais tempo nos apontamentos do mês inteiro.'
        : 'Quais demandas ocuparam mais tempo nos apontamentos do dia escolhido.'}
    </span>
    <span className="mt-1.5 block">
      Trechos com apontamentos sobrepostos são divididos igualmente entre eles, para a soma das fatias bater com o
      total {scale === 'month' ? 'de cada dia' : 'do dia'}.
    </span>
  </>
);

/**
 * Painel: rosca com o tempo dividido por demanda. Na semana, de um dia escolhido (Sex–Qui); no mês,
 * do mês inteiro, sem escolha de dia. Detalhes no hover/foco.
 */
export function DayBreakdownChart({ days, period }: { days: DayMetrics[]; period: PeriodWindow }) {
  const month = period.scale === 'month';
  const [day, setDay] = useState(() => initialDay(days));
  const [active, setActive] = useState<string | null>(null);
  const dayActivities = useDayActivities(day, !month);
  const rangeActivities = useRangeActivities(period.start, period.end, month);
  const activities = month ? rangeActivities : dayActivities;
  const demands = useDemands();
  const today = todayISO();
  const selected = days.find((d) => d.date === day)!;
  const scope = month ? 'mês' : 'dia';

  const breakdown = activities.data && demands.data ? dayBreakdown(activities.data, demands.data) : null;
  const categoryOf = new Map(demands.data?.map((d) => [d.id, d.category]));
  const drawn = breakdown ? colorize(breakdown.slices, categoryOf) : [];
  const legend = [...drawn].sort((a, b) => b.minutes - a.minutes);
  const focus = drawn.find((s) => s.key === active);

  const detail = (s: ColoredSlice) =>
    `${
      s.kind === 'demanda'
        ? DEMAND_CATEGORY_LABEL[categoryOf.get(s.demandId!) ?? 'ciclo']
        : 'Sem demanda (antigo)'
    } · ${s.activityCount} ${s.activityCount === 1 ? 'apontamento' : 'apontamentos'}`;

  let offset = 0;
  const arcs = drawn.map((s) => {
    const length = (s.minutes / (breakdown?.total || 1)) * CIRCUMFERENCE;
    // O espaço é proporcional: 3px, no máximo 40% do arco; e o arco nunca fica abaixo do mínimo visível.
    const gap = drawn.length > 1 ? Math.min(GAP, length * GAP_MAX_SHARE) : 0;
    const arc = { ...s, dash: Math.max(MIN_ARC, length - gap), offset };
    offset += length;
    return arc;
  });

  return (
    <section className="card rise p-5 sm:p-6">
      <SectionTitle
        title={`Distribuição do ${scope}`}
        hint={HINT(period.scale)}
        aside={
          month ? undefined : (
          <div className="flex w-full rounded-control bg-surface-2 p-0.5 sm:w-auto" role="tablist" aria-label="Dia analisado">
            {days.map((d) => {
              const on = d.date === day;
              return (
                <button
                  key={d.date}
                  role="tab"
                  aria-selected={on}
                  onClick={() => {
                    setDay(d.date);
                    setActive(null);
                  }}
                  className={`min-w-0 flex-1 rounded-badge px-3 py-1 text-center outline-none transition focus-visible:ring-2 focus-visible:ring-accent sm:flex-none ${
                    on ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-ink-2 hover:text-ink'
                  }`}
                >
                  <span className="block text-xs font-semibold">{d.weekdayShort}</span>
                  <span className="tabular block text-2xs text-ink-3">
                    {d.date === today ? 'Hoje' : d.minutes ? formatDuration(d.minutes) : '—'}
                  </span>
                </button>
              );
            })}
          </div>
          )
        }
      />

      {!breakdown ? (
        <Skeleton className="mt-6 h-72" />
      ) : breakdown.total === 0 ? (
        <div className="mt-6 flex flex-col items-center justify-center rounded-card border border-dashed border-line px-6 py-16 text-center">
          <p className="font-semibold text-ink">
            Nenhum apontamento em {month ? formatPeriodLabel(period) : `${selected.weekdayShort} ${formatDayMonth(day)}`}
          </p>
          <Link
            to={`/apontamentos?data=${month ? anchorDate(period, today) : day}`}
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline"
          >
            <PlusIcon size={15} /> Registrar apontamentos
          </Link>
        </div>
      ) : (
        <div className="mt-6 flex flex-col items-center gap-8 md:flex-row md:gap-12">
          <div className="relative w-full max-w-[17.5rem] shrink-0 md:max-w-80">
            <svg
              viewBox={`0 0 ${SIZE} ${SIZE}`}
              className="donut-in h-auto w-full -rotate-90 overflow-visible"
              role="img"
              aria-label={`${formatDuration(breakdown.total)} em ${month ? formatPeriodLabel(period) : selected.weekdayLong}: ${legend
                .map((s) => `${s.label} ${formatDuration(s.minutes)} (${percentText(s.share)})`)
                .join(', ')}`}
            >
              {arcs.map((a) => (
                <circle
                  key={a.key}
                  cx={SIZE / 2}
                  cy={SIZE / 2}
                  r={RADIUS}
                  fill="none"
                  stroke={a.color}
                  strokeWidth={active === a.key ? STROKE + 8 : STROKE}
                  strokeDasharray={`${a.dash} ${CIRCUMFERENCE}`}
                  strokeDashoffset={-a.offset}
                  opacity={active && active !== a.key ? 0.3 : 1}
                  onMouseEnter={() => setActive(a.key)}
                  onMouseLeave={() => setActive(null)}
                  className="cursor-pointer transition-[opacity,stroke-width] duration-200"
                />
              ))}
            </svg>
            <div className="pointer-events-none absolute inset-0 grid place-items-center px-[22%] text-center">
              {focus ? (
                <div>
                  <p className="line-clamp-2 text-xs font-medium text-ink-2">{focus.label}</p>
                  <p className="num mt-0.5 text-2xl font-medium text-ink">{formatDuration(focus.minutes)}</p>
                  <p className="tabular text-xs text-ink-3">{percentText(focus.share)} do {scope}</p>
                  <p className="mt-1 text-2xs text-ink-3">{detail(focus)}</p>
                </div>
              ) : (
                <div>
                  <p className="kpi-value mt-0">{formatDuration(breakdown.total)}</p>
                  <p className="kpi-label">apontadas</p>
                </div>
              )}
            </div>
          </div>

          {/* Rótulos diretos: nome, horas e % sempre visíveis; a cor nunca é a única pista. */}
          <ul className="w-full min-w-0 flex-1 space-y-1">
            {legend.map((s) => (
              <li key={s.key}>
                <div
                  tabIndex={0}
                  onMouseEnter={() => setActive(s.key)}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(s.key)}
                  onBlur={() => setActive(null)}
                  className={`flex items-center gap-3 rounded-control px-2.5 py-2 outline-none transition focus-visible:ring-2 focus-visible:ring-accent ${
                    active === s.key ? 'bg-surface-2' : ''
                  }`}
                >
                  <span className="size-3 shrink-0 rounded-sm" style={{ background: s.color }} />
                  <span
                    className="shrink-0"
                    style={{ color: s.category ? categoryInk[s.category] : undefined }}
                    title={s.category ? DEMAND_CATEGORY_LABEL[s.category] : 'Sem demanda (antigo)'}
                  >
                    {s.category ? categoryIcon[s.category](14) : <DashIcon size={14} className="text-ink-3" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{s.label}</span>
                  <span className="num shrink-0 text-sm font-medium text-ink">{formatDuration(s.minutes)}</span>
                  <span className="num w-10 shrink-0 text-right text-xs text-ink-3">{percentText(s.share)}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
