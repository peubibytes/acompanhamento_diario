import { useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  DEMAND_CATEGORY_PLURAL,
  formatDayMonth,
  formatDuration,
  todayISO,
  WEEKDAY_LONG,
  WEEKDAY_SHORT,
  weekdayOf,
  type CategorySplit,
  type PeriodScale,
  type SplitDay,
  type SplitGroup,
  type SplitMinutes,
  type UnplannedTime,
} from '@acomp/shared';
import { ChartTooltip, COLUMN_GAP, SIDE_GUTTER } from './ChartTooltip';
import { categoryIcon } from './DemandVisuals';
import { AlertIcon, DashIcon, PlusIcon } from './icons';
import { SectionTitle } from './SectionTitle';

const HINT = (
  <>
    <span className="block">
      Quanto do tempo apontado foi em chamados, reuniões, treinamentos, atividades e ciclos, por dia útil. Apontamentos antigos, sem
      demanda, aparecem à parte.
    </span>
    <span className="mt-1.5 block">
      Horários sobrepostos contam uma vez dentro da mesma categoria. O trecho em que categorias diferentes se sobrepõem
      (uma reunião durante um ciclo, por exemplo) é dividido igualmente entre elas, para a soma bater com o total do dia.
    </span>
    <span className="mt-1.5 block">
      <strong className="font-semibold text-ink">Predominou:</strong> a categoria (chamados, reuniões, treinamentos,
      atividades ou ciclos) com mais tempo e a fatia dela no total do período. Apontamentos sem demanda não concorrem.
      Em empate, aparecem as categorias empatadas.
    </span>
    <span className="mt-1.5 block">
      <strong className="font-semibold text-ink">Não planejado:</strong> a fatia do tempo em ciclos do tipo Intempestiva.
      Só os ciclos têm tipo; o trecho dividido com outra demanda vale metade.
    </span>
  </>
);

const LABEL = 'text-2xs font-semibold tracking-wider text-ink-3 uppercase';
const NUMBER = 'tabular mt-1 block text-2xl font-semibold tracking-tight text-ink sm:text-display sm:font-bold';

/** Folga acima da barra mais alta para o total do dia caber dentro do gráfico. */
const HEADROOM = 1.14;

// Do chão para cima: as Tarefas juntas e o Ciclo por cima. A cor é fixa por categoria e acompanha o ícone
// e o nome escritos na legenda e no tooltip: nunca é a única pista.
const PARTS: { key: SplitGroup; label: string; color: string; icon: (s: number) => ReactNode }[] = [
  { key: 'chamado', label: DEMAND_CATEGORY_PLURAL.chamado, color: 'var(--series-1)', icon: categoryIcon.chamado },
  { key: 'reuniao', label: DEMAND_CATEGORY_PLURAL.reuniao, color: 'var(--series-3)', icon: categoryIcon.reuniao },
  { key: 'treinamento', label: DEMAND_CATEGORY_PLURAL.treinamento, color: 'var(--series-5)', icon: categoryIcon.treinamento },
  { key: 'atividade', label: DEMAND_CATEGORY_PLURAL.atividade, color: 'var(--series-4)', icon: categoryIcon.atividade },
  { key: 'ciclo', label: DEMAND_CATEGORY_PLURAL.ciclo, color: 'var(--series-2)', icon: categoryIcon.ciclo },
  { key: 'semDemanda', label: 'Sem demanda', color: 'var(--series-other)', icon: (s) => <DashIcon size={s} /> },
];

/** As partes que aparecem: as quatro categorias sempre; "Sem demanda" só se houver. */
const visibleParts = (m: SplitMinutes) => PARTS.filter((p) => p.key !== 'semDemanda' || m.semDemanda > 0);

const percent = (part: number, total: number) => (total > 0 ? Math.round((part * 100) / total) : 0);

/** Selo de quem predominou: ícone(s), nome(s) e fatia escritos. Pode quebrar linha (cabe em 320 px). */
function Predominance({ split }: { split: CategorySplit }) {
  const p = split.predominant;
  const badge = 'mt-1.5 inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium';
  if (!p) {
    return (
      <span className={`${badge} bg-neutral-soft text-ink-2 whitespace-nowrap`}>
        <DashIcon size={13} />
        {split.total.total === 0 ? 'Sem apontamentos' : 'Sem categoria'}
      </span>
    );
  }
  const names = p.categories.map((c) => DEMAND_CATEGORY_PLURAL[c]);
  const tie = p.categories.length > 1;
  // Até duas empatadas, os nomes; acima disso, a contagem (os nomes vão no title e no texto acessível).
  const text = !tie
    ? `Mais em ${names[0]} · ${p.percent}%`
    : p.categories.length === 2
      ? `${names[0]} e ${names[1]} · ${p.percent}% cada`
      : `Empate · ${p.percent}% cada`;
  return (
    <span className={`${badge} bg-accent-soft text-accent`} title={tie ? `Empate: ${names.join(', ')}` : undefined}>
      <span className="flex shrink-0 items-center gap-0.5">
        {p.categories.slice(0, 2).map((c) => (
          <span key={c}>{categoryIcon[c](13)}</span>
        ))}
      </span>
      <span className="min-w-0">{text}</span>
      {p.categories.length > 2 && <span className="sr-only"> ({names.join(', ')})</span>}
    </span>
  );
}

/** Selo do trabalho não planejado: ícone e fatia escritos; âmbar quando houve. */
function Unplanned({ unplanned }: { unplanned: UnplannedTime }) {
  const badge = 'mt-1.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap';
  if (unplanned.percent === null || unplanned.minutes === 0) {
    return (
      <span className={`${badge} bg-neutral-soft text-ink-2`}>
        <DashIcon size={13} />
        {unplanned.percent === null ? 'Sem apontamentos' : 'Nenhum · 0%'}
      </span>
    );
  }
  return (
    <span className={`${badge} bg-warning-soft text-warning-text`}>
      <AlertIcon size={13} />
      Intempestivo · {unplanned.percent}%
    </span>
  );
}

/**
 * Rendimento: o tempo do período por categoria (chamados, reuniões, treinamentos, atividades e ciclos).
 * Faixa de indicadores (com Tarefas × Ciclos) e barras empilhadas por dia útil (mesmo padrão do gráfico
 * de horas por dia: tooltip no hover e no foco, valor em cima só quando cabe).
 */
export function FamilySplitChart({
  split,
  unplanned,
  scale,
}: {
  split: CategorySplit;
  unplanned: UnplannedTime;
  scale: PeriodScale;
}) {
  const { total, days } = split;

  // Em lg, o bloco encolhe com o cartão (Painel em fit-viewport): só as colunas cedem altura.
  return (
    <div className="lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
      <SectionTitle title="Tempo por categoria" hint={HINT} />

      <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <dt className={LABEL}>Horas em Tarefas</dt>
          <dd className={NUMBER}>{formatDuration(total.tarefas)}</dd>
        </div>
        <div>
          <dt className={LABEL}>Horas em Ciclos</dt>
          <dd className={NUMBER}>{formatDuration(total.ciclos)}</dd>
        </div>
        <div>
          <dt className={LABEL}>Predominou</dt>
          <dd>
            <Predominance split={split} />
          </dd>
        </div>
        <div>
          <dt className={LABEL}>Não planejado</dt>
          <dd>
            <Unplanned unplanned={unplanned} />
          </dd>
        </div>
      </dl>

      {total.total === 0 ? (
        <div className="mt-6 flex flex-col items-center rounded-2xl border border-dashed border-line px-6 py-14 text-center">
          <p className="font-semibold text-ink">Nenhum apontamento neste período</p>
          <Link
            to="/apontamentos"
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline"
          >
            <PlusIcon size={15} /> Registrar apontamentos
          </Link>
        </div>
      ) : (
        <>
          <Legend total={total} />
          <Columns days={days} scale={scale} />
        </>
      )}
    </div>
  );
}

/** Rótulos diretos: nome, horas e % do período sempre visíveis (só as partes que existem). */
function Legend({ total }: { total: SplitMinutes }) {
  return (
    <ul className="mt-5 flex flex-wrap gap-x-6 gap-y-2" aria-label="Tempo por categoria no período">
      {visibleParts(total).map((p) => (
        <li key={p.key} className="flex items-center gap-2 text-sm">
          <span className="size-3 shrink-0 rounded-sm" style={{ background: p.color }} />
          <span className="shrink-0 text-ink-3">{p.icon(14)}</span>
          <span className="text-ink">{p.label}</span>
          <span className="tabular font-semibold text-ink">{formatDuration(total[p.key])}</span>
          <span className="tabular text-xs text-ink-3">{percent(total[p.key], total.total)}%</span>
        </li>
      ))}
    </ul>
  );
}

function Columns({ days, scale }: { days: SplitDay[]; scale: PeriodScale }) {
  const navigate = useNavigate();
  const today = todayISO();
  const month = scale === 'month';
  const max = Math.max(1, ...days.map((d) => d.total * HEADROOM));
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className="@container mt-6 lg:mt-5 lg:flex lg:min-h-0 lg:flex-col">
      <div className="relative h-60 sm:h-72 lg:min-h-36">
        <div className="pointer-events-none absolute inset-x-0 bottom-0 border-t border-baseline" />
        <div className={`absolute inset-0 flex items-end ${COLUMN_GAP[scale]} ${month ? SIDE_GUTTER.inset : ''}`}>
          {days.map((d, i) => {
            const wd = weekdayOf(d.date);
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
                aria-label={`${WEEKDAY_LONG[wd]} ${formatDayMonth(d.date)}: ${
                  d.total === 0
                    ? 'sem apontamento'
                    : PARTS.filter((p) => d[p.key] > 0)
                        .map((p) => `${p.label} ${formatDuration(d[p.key])} (${percent(d[p.key], d.total)}%)`)
                        .join(', ')
                }.`}
              >
                <span
                  className={`tabular mb-1.5 text-sm font-semibold ${d.total > 0 ? 'text-ink' : 'text-ink-3'} ${
                    month ? 'hidden text-xs @[58rem]:block' : ''
                  }`}
                >
                  {d.total > 0 ? formatDuration(d.total) : '—'}
                </span>
                <span
                  className={`grow-y flex w-full flex-col-reverse overflow-hidden rounded-t-md transition-[height] duration-700 ease-out ${month ? 'max-w-10' : 'max-w-16'}`}
                  style={{
                    height: `${(d.total / max) * 100}%`,
                    minHeight: d.total > 0 ? 3 : 0,
                    ...({ '--i': i, '--grow-step': month ? '14ms' : '45ms' } as CSSProperties),
                  }}
                >
                  {PARTS.map((p) => (
                    <span key={p.key} style={{ height: `${(d[p.key] / (d.total || 1)) * 100}%`, background: p.color }} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
        {open !== null && <SplitTooltip day={days[open]} center={((open + 0.5) / days.length) * 100} />}
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
                <span className="text-sm font-semibold text-ink">{WEEKDAY_SHORT[weekdayOf(d.date)]}</span>
                <span className="tabular text-xs text-ink-3">{d.date === today ? 'Hoje' : formatDayMonth(d.date)}</span>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function SplitTooltip({ day, center }: { day: SplitDay; center: number }) {
  return (
    <ChartTooltip center={center}>
      <span className="block text-xs font-semibold text-ink">
        {WEEKDAY_LONG[weekdayOf(day.date)]}, {formatDayMonth(day.date)}
      </span>
      <span className="mt-2 grid grid-cols-[auto_auto_1fr_auto] items-center gap-x-2 gap-y-1 text-xs">
        {visibleParts(day).map((p) => (
          <span key={p.key} className="contents">
            <span className="size-2.5 rounded-sm" style={{ background: p.color }} />
            <span className="text-ink-3">{p.icon(12)}</span>
            <span className="text-ink-3">{p.label}</span>
            <span className="tabular text-right font-medium text-ink">
              {formatDuration(day[p.key])} · {percent(day[p.key], day.total)}%
            </span>
          </span>
        ))}
      </span>
      <span className="mt-2 flex justify-between border-t border-line pt-2 text-xs">
        <span className="text-ink-3">Total do dia</span>
        <span className="tabular font-medium text-ink">{day.total > 0 ? formatDuration(day.total) : 'Sem apontamento'}</span>
      </span>
    </ChartTooltip>
  );
}
