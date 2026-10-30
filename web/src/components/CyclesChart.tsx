import { Link } from 'react-router';
import {
  formatDayMonth,
  formatDuration,
  WEEKDAY_SHORT,
  weekdayOf,
  type CycleProgress,
  type DemandSummary,
  type LastUpdate,
  type TimelineEntry,
} from '@acomp/shared';
import { DeadlineBadge, StalledBadge } from './DemandVisuals';
import { SectionTitle } from './SectionTitle';
import { ArrowRight, PlusIcon, TargetIcon } from './icons';
import { TimelineMap } from './TimelineMap';

const MAX_ROWS = 6;

const UPDATE_KIND = { evento: 'Evento', status: 'Status', apontamento: 'Apontamento' } as const;

/** "Ter 27/10 · Evento: Publicado em staging". */
const updateText = (u: LastUpdate) =>
  `${WEEKDAY_SHORT[weekdayOf(u.date)]} ${formatDayMonth(u.date)} · ${UPDATE_KIND[u.kind]}${u.text ? `: ${u.text}` : ''}`;

const HINT = (
  <>
    <span className="block">Os ciclos abertos, dos mais urgentes para os demais.</span>
    <span className="mt-1.5 block">
      O mapa é a linha do tempo do ciclo: do início ao prazo, com as ações, decisões, impedimentos, validações e deploys
      registrados. Ele segue da esquerda para a direita e, no limite, desce e volta da direita para a esquerda. Passe o
      mouse ou foque um ponto para ler o registro.
    </span>
    <span className="mt-1.5 block">
      <strong className="font-semibold text-ink">Bandeira vermelha:</strong> registro marcado para chamar atenção.
    </span>
    <span className="mt-1.5 block">
      <strong className="font-semibold text-ink">Última atualização:</strong> o evento, a troca de status ou o
      apontamento mais recente. Sem nenhuma há 3 dias úteis ou mais, o ciclo aparece como parado.
    </span>
  </>
);

/**
 * Painel: cada ciclo aberto com o mapa da sua linha do tempo (serpentina), o prazo, a última
 * atualização e as horas apontadas (como número: o mapa conta o que aconteceu, não o esforço).
 */
export function CyclesChart({
  demands,
  progress,
  timeline,
}: {
  demands: DemandSummary[];
  progress: CycleProgress[];
  timeline: TimelineEntry[];
}) {
  const cycles = demands.filter((d) => d.category === 'ciclo');
  const shown = cycles.slice(0, MAX_ROWS);
  const logged = cycles.reduce((sum, d) => sum + d.metrics.logged, 0);
  const progressOf = (id: number) => progress.find((p) => p.id === id);
  const entriesByCycle = Map.groupBy(timeline, (e) => e.demandId);

  return (
    <section className="card rise p-5 sm:p-6">
      <SectionTitle
        title="Ciclos em andamento"
        hint={HINT}
        aside={
          cycles.length > 0 && (
            <Link
              to="/demandas?tipo=ciclo"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-2 transition hover:text-ink"
            >
              {cycles.length > MAX_ROWS ? `Ver todos (${cycles.length})` : 'Gerenciar'}
              <ArrowRight size={14} />
            </Link>
          )
        }
      />

      {cycles.length === 0 ? (
        <div className="mt-6 flex flex-col items-center rounded-2xl border border-dashed border-line px-6 py-14 text-center">
          <span className="grid size-10 place-items-center rounded-full bg-surface-2 text-ink-2">
            <TargetIcon size={20} />
          </span>
          <p className="mt-3 font-semibold text-ink">Nenhum ciclo aberto</p>
          <Link
            to="/demandas?tipo=ciclo"
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline"
          >
            <PlusIcon size={15} /> Declarar ciclo
          </Link>
        </div>
      ) : (
        <>
          <p className="tabular mt-1 text-xs text-ink-3">
            {formatDuration(logged)} apontadas no total · {cycles.length} {cycles.length === 1 ? 'ciclo' : 'ciclos'}
          </p>
          <ul className="mt-5 divide-y divide-line">
            {shown.map((d) => {
              if (d.category !== 'ciclo') return null;
              const p = progressOf(d.id);
              const entries = entriesByCycle.get(d.id) ?? [];
              return (
                <li key={d.id} className="py-5 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                    <Link
                      to={`/demandas#demanda-${d.id}`}
                      className="min-w-0 truncate rounded text-sm font-semibold text-ink outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      {d.label}
                    </Link>
                    <span className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                      {p?.stalled && <StalledBadge idleWorkdays={p.idleWorkdays!} />}
                      <DeadlineBadge status={d.metrics.deadline} />
                    </span>
                  </div>
                  <p className="tabular mt-1 text-xs text-ink-3">
                    {d.metrics.logged > 0 ? `${formatDuration(d.metrics.logged)} apontadas` : 'Nenhum apontamento'}
                    {p && p.loggedInPeriod > 0 && ` · ${formatDuration(p.loggedInPeriod)} neste ciclo de apontamento`}
                    {' · '}
                    {p?.lastUpdate ? `Atualizado ${updateText(p.lastUpdate)}` : 'Sem atualizações'}
                  </p>
                  {d.metrics.reminder && <p className="mt-1 text-xs font-medium text-ink">{d.metrics.reminder}</p>}

                  <div className="mt-4">
                    <TimelineMap demand={d} label={d.label} entries={entries} />
                  </div>

                  <Link
                    to={`/detalhes?aba=ciclos&ciclo=${d.id}`}
                    className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:underline"
                  >
                    Analisar linha do tempo <ArrowRight size={13} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
