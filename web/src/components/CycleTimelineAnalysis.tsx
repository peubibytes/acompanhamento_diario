import { Link, useSearchParams } from 'react-router';
import {
  DEMAND_EVENT_KINDS,
  DEMAND_EVENT_LABEL,
  filterTimeline,
  isOpenDemand,
  timelineMetrics,
  todayISO,
  type DemandEventKind,
  type DemandSummary,
  type TimelineEntry,
} from '@acomp/shared';
import { useDemands, useTimeline } from '../api/client';
import { FilterSelect } from './FilterSelect';
import { FlagIcon } from './icons';
import { ErrorState, Skeleton } from './States';
import { kindStyle, TimelineList } from './Timeline';

const MONTHS = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];
const monthLabel = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

const LABEL = 'text-2xs font-semibold tracking-wider text-ink-3 uppercase';
const NUMBER = 'tabular mt-1 block text-2xl font-semibold tracking-tight text-ink';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Valor do filtro de ciclo: 'abertos' (padrão), 'todos' ou o id de um ciclo. */
type CycleChoice = string;

function parseKinds(raw: string | null): Set<DemandEventKind> {
  return new Set((raw ?? '').split(',').filter((k): k is DemandEventKind => DEMAND_EVENT_KINDS.includes(k as DemandEventKind)));
}

/**
 * Detalhes → Ciclos: a linha do tempo dos ciclos para analisar. Filtros por ciclo, tipo e
 * marcados (na URL, para o link levar à mesma visão), métricas do que está filtrado e a bandeira.
 */
export function CycleTimelineAnalysis() {
  const [params, setParams] = useSearchParams();
  const demands = useDemands();
  const timeline = useTimeline();

  const choice: CycleChoice = params.get('ciclo') ?? 'abertos';
  const kinds = parseKinds(params.get('tipos'));
  const flaggedOnly = params.get('marcados') === '1';

  const update = (change: (p: URLSearchParams) => void) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        change(next);
        return next;
      },
      { replace: true },
    );

  if (demands.isPending || timeline.isPending) return <Skeleton className="h-96" />;
  if (demands.isError) return <ErrorState message={demands.error.message} onRetry={() => demands.refetch()} />;
  if (timeline.isError) return <ErrorState message={timeline.error.message} onRetry={() => timeline.refetch()} />;

  const cycles = demands.data.filter((d): d is DemandSummary & { category: 'ciclo' } => d.category === 'ciclo');
  const single = /^\d+$/.test(choice) ? Number(choice) : null;
  const allowed = new Set(
    single !== null ? [single] : choice === 'todos' ? cycles.map((c) => c.id) : cycles.filter(isOpenDemand).map((c) => c.id),
  );

  // Métricas e contagens por tipo: do ciclo escolhido, antes do filtro de tipo.
  const ofCycles = timeline.data.filter((e) => allowed.has(e.demandId));
  const metrics = timelineMetrics(ofCycles, todayISO());
  const shown = filterTimeline(ofCycles, { kinds, flaggedOnly });

  const toggleKind = (k: DemandEventKind) =>
    update((p) => {
      const next = new Set(kinds);
      if (!next.delete(k)) next.add(k);
      if (next.size) p.set('tipos', [...next].join(','));
      else p.delete('tipos');
    });
  const clear = () =>
    update((p) => {
      p.delete('tipos');
      p.delete('marcados');
      p.delete('ciclo');
    });

  const hasFilters = kinds.size > 0 || flaggedOnly || choice !== 'abertos';

  return (
    <div className="space-y-section">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-3">
        <FilterSelect
          label="Ciclo"
          value={choice}
          onChange={(v) =>
            update((p) => {
              if (v === 'abertos') p.delete('ciclo');
              else p.set('ciclo', v);
            })
          }
          options={[
            { value: 'abertos', label: `Todos os abertos (${cycles.filter(isOpenDemand).length})` },
            { value: 'todos', label: `Todos (${cycles.length})` },
            ...cycles.map((c) => ({ value: String(c.id), label: isOpenDemand(c) ? c.label : `${c.label} · encerrado` })),
          ]}
        />
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-line px-3 py-1.5 text-sm text-ink-2 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent sm:ml-auto">
          <input
            type="checkbox"
            checked={flaggedOnly}
            onChange={(e) =>
              update((p) => {
                if (e.target.checked) p.set('marcados', '1');
                else p.delete('marcados');
              })
            }
            className="size-3.5 accent-[var(--accent)]"
          />
          <FlagIcon size={14} className="text-critical-text" />
          Só marcados
          <span className="tabular text-ink-3">{metrics.flagged}</span>
        </label>
      </div>

      <section className="card rise p-5 sm:p-6" aria-label="Métricas da linha do tempo">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <dt className={LABEL}>Registros</dt>
            <dd className={NUMBER}>{metrics.total}</dd>
          </div>
          <div>
            <dt className={LABEL}>Marcados</dt>
            <dd className={NUMBER}>{metrics.flagged}</dd>
          </div>
          <div>
            <dt className={LABEL}>Impedimentos abertos</dt>
            <dd className={NUMBER}>{metrics.openBlockers}</dd>
            {metrics.openBlockers > 0 && (
              <dd className="tabular text-xs text-ink-3">maior espera: {plural(metrics.longestWait, 'dia útil', 'dias úteis')}</dd>
            )}
          </div>
          <div>
            <dt className={LABEL}>Último registro</dt>
            <dd className={NUMBER}>{metrics.idleWorkdays === null ? '—' : metrics.idleWorkdays === 0 ? 'Hoje' : plural(metrics.idleWorkdays, 'dia útil', 'dias úteis')}</dd>
            {metrics.idleWorkdays !== null && metrics.idleWorkdays > 0 && <dd className="text-xs text-ink-3">atrás</dd>}
          </div>
        </dl>

        <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-5" role="group" aria-label="Filtrar por tipo">
          {DEMAND_EVENT_KINDS.map((k) => {
            const active = kinds.has(k);
            return (
              <button
                key={k}
                type="button"
                aria-pressed={active}
                onClick={() => toggleKind(k)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-accent ${
                  active ? `${kindStyle[k].badge} border-transparent` : 'border-line text-ink-2 hover:bg-surface-2'
                }`}
              >
                {kindStyle[k].icon(14)}
                {DEMAND_EVENT_LABEL[k]}
                <span className="tabular text-ink-3">{metrics.byKind[k]}</span>
              </button>
            );
          })}
        </div>
      </section>

      {ofCycles.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line px-6 py-14 text-center">
          <p className="font-semibold text-ink">Nenhum registro na linha do tempo</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-ink-2">
            Registre ações, decisões, validações, deploys e impedimentos nos ciclos para analisá-los aqui.
          </p>
          <Link to="/demandas?tipo=ciclo" className="mt-3 inline-block text-sm font-semibold text-accent hover:underline">
            Ir para os ciclos
          </Link>
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line px-6 py-14 text-center">
          <p className="font-semibold text-ink">Nada com estes filtros</p>
          {hasFilters && (
            <button type="button" onClick={clear} className="mt-3 text-sm font-semibold text-accent hover:underline">
              Limpar filtros
            </button>
          )}
        </div>
      ) : (
        <MonthGroups entries={shown} showCycle={single === null} />
      )}
    </div>
  );
}

/** Lista agrupada por mês, do mais recente ao mais antigo. */
function MonthGroups({ entries, showCycle }: { entries: TimelineEntry[]; showCycle: boolean }) {
  const groups = Map.groupBy(entries, (e) => e.date.slice(0, 7));
  return (
    <div className="space-y-6">
      {[...groups].map(([month, items]) => (
        <section key={month} aria-label={monthLabel(month)}>
          <h2 className="mb-2 text-sm font-semibold text-ink">{monthLabel(month)}</h2>
          <TimelineList entries={items} showCycle={showCycle} actions="flag" />
        </section>
      ))}
    </div>
  );
}
