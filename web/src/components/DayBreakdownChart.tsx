import { useState } from 'react';
import { Link } from 'react-router';
import {
  dayBreakdown,
  DEMAND_CATEGORY_LABEL,
  foldSlices,
  formatDayMonth,
  formatDuration,
  todayISO,
  type BreakdownSlice,
  type CycleSummary,
  type ISODate,
} from '@acomp/shared';
import { useDayActivities, useDemands } from '../api/client';
import { SectionTitle } from './SectionTitle';
import { Skeleton } from './States';
import { PlusIcon } from './icons';

/** Geometria interna do gráfico; o SVG escala com o contêiner (viewBox). */
const SIZE = 280;
const STROKE = 40;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** Espaço de 3px (cor da superfície) entre fatias vizinhas. */
const GAP = 3;
const SLOT_COLORS = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)', 'var(--series-5)'];

interface ColoredSlice extends BreakdownSlice {
  color: string;
}

/**
 * Cores pela identidade, não pelo tamanho: demandas (por id) e depois projetos (por nome)
 * recebem os slots na ordem fixa da paleta, e "Outros" fica sempre em cinza. As fatias são
 * desenhadas nessa mesma ordem, que é a que garante vizinhas distinguíveis para daltônicos.
 */
function colorize(slices: BreakdownSlice[]): ColoredSlice[] {
  const named = slices
    .filter((s) => s.kind !== 'outros')
    .sort(
      (a, b) =>
        (a.kind === 'demanda' ? 0 : 1) - (b.kind === 'demanda' ? 0 : 1) ||
        (a.demandId ?? 0) - (b.demandId ?? 0) ||
        a.label.localeCompare(b.label, 'pt-BR'),
    )
    .map((s, i) => ({ ...s, color: SLOT_COLORS[i] }));
  const others = slices.filter((s) => s.kind === 'outros').map((s) => ({ ...s, color: 'var(--series-other)' }));
  return [...named, ...others];
}

/** Dia inicial: hoje, se estiver no ciclo; senão o último dia útil já passado (ou a sexta). */
function initialDay(summary: CycleSummary): ISODate {
  const today = todayISO();
  return summary.days.map((d) => d.date).filter((d) => d <= today).at(-1) ?? summary.days[0].date;
}

const HINT = (
  <>
    <span className="block">Quais demandas ocuparam mais tempo nos apontamentos do dia escolhido.</span>
    <span className="mt-1.5 block">
      Trechos com apontamentos sobrepostos são divididos igualmente entre eles, para a soma das fatias bater com o
      total do dia.
    </span>
  </>
);

/** Painel: rosca com o tempo de um dia dividido por demanda. Detalhes no hover/foco. */
export function DayBreakdownChart({ summary }: { summary: CycleSummary }) {
  const [day, setDay] = useState(() => initialDay(summary));
  const [active, setActive] = useState<string | null>(null);
  const activities = useDayActivities(day);
  const demands = useDemands();
  const today = todayISO();
  const selected = summary.days.find((d) => d.date === day)!;

  const breakdown = activities.data && demands.data ? dayBreakdown(activities.data, demands.data) : null;
  const categoryOf = new Map(demands.data?.map((d) => [d.id, d.category]));
  const drawn = breakdown ? colorize(foldSlices(breakdown.slices)) : [];
  const legend = [...drawn].sort((a, b) => b.minutes - a.minutes);
  const focus = drawn.find((s) => s.key === active);

  const detail = (s: ColoredSlice) =>
    `${
      s.kind === 'demanda'
        ? DEMAND_CATEGORY_LABEL[categoryOf.get(s.demandId!) ?? 'ciclo']
        : s.kind === 'projeto'
          ? 'Sem demanda (antigo)'
          : 'Demais itens'
    } · ${s.activityCount} ${s.activityCount === 1 ? 'apontamento' : 'apontamentos'}`;

  let offset = 0;
  const arcs = drawn.map((s) => {
    const length = (s.minutes / (breakdown?.total || 1)) * CIRCUMFERENCE;
    const arc = { ...s, dash: Math.max(0.01, length - (drawn.length > 1 ? GAP : 0)), offset };
    offset += length;
    return arc;
  });

  return (
    <section className="card rise p-5 sm:p-6">
      <SectionTitle
        title="Distribuição do dia"
        hint={HINT}
        aside={
          <div className="flex w-full rounded-full bg-surface-2 p-1 sm:w-auto" role="tablist" aria-label="Dia analisado">
            {summary.days.map((d) => {
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
                  className={`min-w-0 flex-1 rounded-full px-3 py-1 text-center transition sm:flex-none ${
                    on ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:text-ink'
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
        }
      />

      {!breakdown ? (
        <Skeleton className="mt-6 h-72" />
      ) : breakdown.total === 0 ? (
        <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-dashed border-line px-6 py-16 text-center">
          <p className="font-semibold text-ink">
            Nenhum apontamento em {selected.weekdayShort} {formatDayMonth(day)}
          </p>
          <Link
            to={`/apontamentos?data=${day}`}
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
              className="h-auto w-full -rotate-90 overflow-visible"
              role="img"
              aria-label={`${formatDuration(breakdown.total)} em ${selected.weekdayLong}: ${legend
                .map((s) => `${s.label} ${formatDuration(s.minutes)} (${Math.round(s.share)}%)`)
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
                  <p className="tabular mt-0.5 text-2xl font-bold text-ink">{formatDuration(focus.minutes)}</p>
                  <p className="tabular text-xs text-ink-3">{Math.round(focus.share)}% do dia</p>
                  <p className="mt-1 text-2xs text-ink-3">{detail(focus)}</p>
                </div>
              ) : (
                <div>
                  <p className="tabular text-display font-bold tracking-tight text-ink">{formatDuration(breakdown.total)}</p>
                  <p className="text-2xs font-medium tracking-wider text-ink-3 uppercase">apontadas</p>
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
                  className={`flex items-center gap-3 rounded-lg px-2.5 py-2 outline-none transition focus-visible:ring-2 focus-visible:ring-accent ${
                    active === s.key ? 'bg-surface-2' : ''
                  }`}
                >
                  <span className="size-3 shrink-0 rounded-sm" style={{ background: s.color }} />
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{s.label}</span>
                  <span className="tabular shrink-0 text-sm font-semibold text-ink">{formatDuration(s.minutes)}</span>
                  <span className="tabular w-10 shrink-0 text-right text-xs text-ink-3">{Math.round(s.share)}%</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
