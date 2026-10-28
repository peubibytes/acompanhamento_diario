import { Link } from 'react-router';
import { formatDayMonth, formatDuration, WEEKDAY_SHORT, weekdayOf, type DemandSummary } from '@acomp/shared';
import { DeadlineBadge, DemandHoursCaption, DemandProgressBar } from './DemandVisuals';
import { ArrowRight, PlusIcon, TargetIcon } from './icons';

const MAX_ROWS = 6;

/** Painel: horas apontadas × meta de cada demanda aberta, das mais urgentes para as demais. */
export function DemandsChart({ demands }: { demands: DemandSummary[] }) {
  const shown = demands.slice(0, MAX_ROWS);
  const logged = demands.reduce((sum, d) => sum + d.metrics.logged, 0);
  // Demandas sem meta de horas entram no total apontado, mas não na soma das metas.
  const target = demands.reduce((sum, d) => sum + (d.metrics.target ?? 0), 0);

  return (
    <section className="card rise p-5 sm:p-6" style={{ animationDelay: '240ms' }}>
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-ink">Demandas em andamento</h2>
        <p className="text-sm text-ink-2">Horas apontadas em cada demanda em relação à meta (ou o progresso informado).</p>
        {demands.length > 0 && (
          <p className="tabular mt-3 inline-flex items-baseline gap-1.5 rounded-full bg-surface-2 px-3 py-1 text-xs text-ink-2">
            Total nas demandas
            <strong className="text-sm font-bold text-ink">{formatDuration(logged)}</strong>
            {target > 0 && <span className="text-ink-3">de {formatDuration(target)} em metas</span>}
          </p>
        )}
      </div>

      {demands.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-line px-6 py-8 text-center">
          <span className="grid size-10 place-items-center rounded-full bg-accent-soft text-accent">
            <TargetIcon size={20} />
          </span>
          <p className="mt-2 font-semibold text-ink">Nenhuma demanda aberta</p>
          <p className="mt-1 max-w-xs text-sm text-ink-2">
            Cadastre demandas e chamados com prazo e, se quiser, meta de horas para acompanhá-los aqui.
          </p>
          <Link
            to="/demandas"
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-on-accent hover:bg-accent-hover"
          >
            <PlusIcon size={16} /> Nova demanda
          </Link>
        </div>
      ) : (
        <ul className="space-y-1">
          {shown.map((d) => (
            <li key={d.id}>
              <Link
                to={`/demandas#demanda-${d.id}`}
                title={`${d.metrics.diagnosis}${d.metrics.requiredPerDay ? ` · ritmo necessário: ${formatDuration(d.metrics.requiredPerDay)} por dia útil` : ''}`}
                className="block rounded-xl px-2 py-2.5 transition hover:bg-surface-2/70 sm:px-3"
              >
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="truncate text-sm font-medium text-ink">{d.title}</span>
                  <DeadlineBadge status={d.metrics.deadline} />
                </div>
                <DemandProgressBar demand={d} height={10} />
                <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <DemandHoursCaption demand={d} />
                  {d.dueDate && (
                    <span className="tabular text-xs text-ink-3">
                      Prazo {WEEKDAY_SHORT[weekdayOf(d.dueDate)]} {formatDayMonth(d.dueDate)}
                    </span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {demands.length > 0 && (
        <div className="mt-3 flex justify-end">
          <Link to="/demandas" className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline">
            {demands.length > MAX_ROWS ? `Ver todas (${demands.length})` : 'Gerenciar demandas'}
            <ArrowRight size={15} />
          </Link>
        </div>
      )}
    </section>
  );
}
