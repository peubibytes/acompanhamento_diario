import { Link } from 'react-router';
import {
  formatDayMonth,
  formatDuration,
  WEEKDAY_SHORT,
  weekdayOf,
  type CycleProgress,
  type DemandSummary,
  type LastUpdate,
} from '@acomp/shared';
import { DeadlineBadge, StalledBadge } from './DemandVisuals';
import { SectionTitle } from './SectionTitle';
import { ArrowRight, PlusIcon, TargetIcon } from './icons';

const MAX_ROWS = 6;

const UPDATE_KIND = { evento: 'Evento', status: 'Status', apontamento: 'Apontamento' } as const;

/** "Ter 27/10 · Evento: Publicado em staging". */
const updateText = (u: LastUpdate) =>
  `${WEEKDAY_SHORT[weekdayOf(u.date)]} ${formatDayMonth(u.date)} · ${UPDATE_KIND[u.kind]}${u.text ? `: ${u.text}` : ''}`;

const HINT = (
  <>
    <span className="block">Horas apontadas em cada ciclo aberto, dos mais urgentes para os demais.</span>
    <span className="mt-1.5 block">As barras comparam os ciclos entre si: a maior ocupa a largura toda.</span>
    <span className="mt-1.5 block">
      <strong className="font-semibold text-ink">Última atualização:</strong> o evento, a troca de status ou o
      apontamento mais recente. Sem nenhuma há 3 dias úteis ou mais, o ciclo aparece como parado.
    </span>
  </>
);

/** Painel: horas apontadas em cada ciclo aberto. Prazo, apontamentos e lembrete aparecem no hover/foco. */
export function CyclesChart({ demands, progress }: { demands: DemandSummary[]; progress: CycleProgress[] }) {
  const cycles = demands.filter((d) => d.category === 'ciclo');
  const progressOf = (id: number) => progress.find((p) => p.id === id);
  const shown = cycles.slice(0, MAX_ROWS);
  const logged = cycles.reduce((sum, d) => sum + d.metrics.logged, 0);
  const max = Math.max(1, ...shown.map((d) => d.metrics.logged));

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
            {formatDuration(logged)} no total · {cycles.length} {cycles.length === 1 ? 'ciclo' : 'ciclos'}
          </p>
          <ul className="mt-5 space-y-1">
            {shown.map((d) => {
              const due = d.category === 'ciclo' ? d.dueDate : null;
              const pct = (d.metrics.logged / max) * 100;
              const p = progressOf(d.id);
              return (
                <li key={d.id}>
                  <Link
                    to={`/demandas#demanda-${d.id}`}
                    className="group relative block rounded-xl px-3 py-3 outline-none transition hover:bg-surface-2/70 focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate text-sm font-medium text-ink">{d.label}</span>
                      <span className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                        {p?.stalled && <StalledBadge idleWorkdays={p.idleWorkdays!} />}
                        <DeadlineBadge status={d.metrics.deadline} />
                      </span>
                    </div>
                    <div className="mt-2.5 flex items-center gap-3">
                      <div
                        className="h-3 flex-1 overflow-hidden rounded-full bg-grid"
                        role="img"
                        aria-label={`${d.label}: ${formatDuration(d.metrics.logged)} apontadas`}
                      >
                        <div
                          className="h-full rounded-full bg-accent transition-[width] duration-700 ease-out"
                          style={{ width: `${d.metrics.logged > 0 ? Math.max(2, pct) : 0}%` }}
                        />
                      </div>
                      <span className="tabular w-14 shrink-0 text-right text-sm font-semibold text-ink">
                        {formatDuration(d.metrics.logged)}
                      </span>
                    </div>
                    <p className="mt-1.5 truncate text-xs text-ink-3">
                      {p?.lastUpdate ? `Atualizado ${updateText(p.lastUpdate)}` : 'Sem atualizações'}
                    </p>

                    <span
                      role="tooltip"
                      className="tip-surface pointer-events-none absolute top-full left-3 z-20 mt-1 hidden w-64 max-w-[calc(100%-1.5rem)] p-3 text-left text-xs text-ink-2 group-hover:block group-focus-visible:block"
                    >
                      <span className="tabular block">
                        {d.metrics.activityCount === 0
                          ? 'Nenhum apontamento'
                          : `${d.metrics.activityCount} ${d.metrics.activityCount === 1 ? 'apontamento' : 'apontamentos'}${
                              d.metrics.dayCount > 1 ? ` em ${d.metrics.dayCount} dias` : ''
                            }`}
                      </span>
                      {p && (
                        <span className="tabular mt-1 block">{formatDuration(p.loggedInPeriod)} no ciclo de apontamento</span>
                      )}
                      {due && (
                        <span className="tabular mt-1 block">
                          Prazo {WEEKDAY_SHORT[weekdayOf(due)]} {formatDayMonth(due)}
                        </span>
                      )}
                      {d.metrics.reminder && <span className="mt-1 block font-medium text-ink">{d.metrics.reminder}</span>}
                    </span>
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
