import { Link } from 'react-router';
import { formatDayMonth, formatDuration, WEEKDAY_SHORT, weekdayOf, type DemandSummary } from '@acomp/shared';
import { DeadlineBadge } from './DemandVisuals';
import { ArrowRight, PlusIcon, TargetIcon } from './icons';

const MAX_ROWS = 6;

/**
 * Painel: horas apontadas em cada ciclo aberto, dos mais urgentes para os demais. Sem meta de
 * horas, as barras comparam os ciclos entre si (a maior ocupa a largura toda).
 */
export function CyclesChart({ demands }: { demands: DemandSummary[] }) {
  const cycles = demands.filter((d) => d.category === 'ciclo');
  const shown = cycles.slice(0, MAX_ROWS);
  const logged = cycles.reduce((sum, d) => sum + d.metrics.logged, 0);
  const max = Math.max(1, ...shown.map((d) => d.metrics.logged));

  return (
    <section className="card rise p-5 sm:p-6" style={{ animationDelay: '240ms' }}>
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-ink">Ciclos em andamento</h2>
        <p className="text-sm text-ink-2">Horas apontadas em cada ciclo aberto e a situação do prazo.</p>
        {cycles.length > 0 && (
          <p className="tabular mt-3 inline-flex items-baseline gap-1.5 rounded-full bg-surface-2 px-3 py-1 text-xs text-ink-2">
            Total nos ciclos
            <strong className="text-sm font-bold text-ink">{formatDuration(logged)}</strong>
          </p>
        )}
      </div>

      {cycles.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-line px-6 py-8 text-center">
          <span className="grid size-10 place-items-center rounded-full bg-accent-soft text-accent">
            <TargetIcon size={20} />
          </span>
          <p className="mt-2 font-semibold text-ink">Nenhum ciclo aberto</p>
          <p className="mt-1 max-w-xs text-sm text-ink-2">
            Declare trabalhos longos, com prazo e prioridade, para acompanhá-los aqui.
          </p>
          <Link
            to="/demandas?tipo=ciclo"
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-on-accent hover:bg-accent-hover"
          >
            <PlusIcon size={16} /> Declarar ciclo
          </Link>
        </div>
      ) : (
        <ul className="space-y-1">
          {shown.map((d) => {
            const due = d.category === 'ciclo' ? d.dueDate : null;
            const pct = (d.metrics.logged / max) * 100;
            return (
              <li key={d.id}>
                <Link
                  to={`/demandas#demanda-${d.id}`}
                  title={d.metrics.reminder ?? d.label}
                  className="block rounded-xl px-2 py-2.5 transition hover:bg-surface-2/70 sm:px-3"
                >
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="truncate text-sm font-medium text-ink">{d.label}</span>
                    <DeadlineBadge status={d.metrics.deadline} />
                  </div>
                  <div
                    className="h-2.5 overflow-hidden rounded-full bg-grid"
                    role="img"
                    aria-label={`${d.label}: ${formatDuration(d.metrics.logged)} apontadas`}
                  >
                    <div
                      className="h-full rounded-full bg-accent transition-[width] duration-700 ease-out"
                      style={{ width: `${d.metrics.logged > 0 ? Math.max(2, pct) : 0}%` }}
                    />
                  </div>
                  <div className="tabular mt-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-xs">
                    <span className="text-ink-2">
                      <strong className="font-semibold text-ink">{formatDuration(d.metrics.logged)}</strong> apontadas
                      {d.metrics.activityCount > 0 &&
                        ` · ${d.metrics.activityCount === 1 ? '1 apontamento' : `${d.metrics.activityCount} apontamentos`}`}
                    </span>
                    {due && (
                      <span className="text-ink-3">
                        Prazo {WEEKDAY_SHORT[weekdayOf(due)]} {formatDayMonth(due)}
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {cycles.length > 0 && (
        <div className="mt-3 flex justify-end">
          <Link
            to="/demandas?tipo=ciclo"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline"
          >
            {cycles.length > MAX_ROWS ? `Ver todos (${cycles.length})` : 'Gerenciar ciclos'}
            <ArrowRight size={15} />
          </Link>
        </div>
      )}
    </section>
  );
}
