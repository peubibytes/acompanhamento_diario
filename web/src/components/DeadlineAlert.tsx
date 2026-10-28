import { Link } from 'react-router';
import type { DemandSummary } from '@acomp/shared';
import { ArrowRight, BellIcon } from './icons';

/** Lembrete das demandas com prazo próximo, vencendo hoje, vencido ou em risco. */
export function DeadlineAlert({ demands }: { demands: DemandSummary[] }) {
  const due = demands.filter((d) => d.metrics.reminder);
  if (due.length === 0) return null;

  // Vermelho se alguma já venceu ou não cabe mais no prazo; âmbar se só está chegando.
  const critical = due.some((d) => d.metrics.deadline === 'atrasada' || d.metrics.atRisk);
  const tone = critical
    ? { box: 'border-critical/30 bg-critical-soft', icon: 'bg-critical text-white', title: 'text-critical-text' }
    : { box: 'border-warning/40 bg-warning-soft', icon: 'bg-warning text-[#0b0b0b]', title: 'text-warning-text' };

  return (
    <div role="alert" className={`rise rounded-[1.25rem] border px-4 py-3.5 ${tone.box}`}>
      <div className="flex items-start gap-3">
        <span className={`grid size-9 shrink-0 place-items-center rounded-full ${tone.icon}`}>
          <BellIcon size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold ${tone.title}`}>
            {due.length === 1 ? 'Demanda perto da data de conclusão' : `${due.length} demandas pedem atenção ao prazo`}
          </p>
          <ul className="mt-1.5 space-y-1.5">
            {due.map((d) => (
              <li key={d.id}>
                <Link
                  to={`/demandas#demanda-${d.id}`}
                  className="group flex items-start gap-1.5 text-sm text-ink-2 hover:text-ink"
                >
                  <span>
                    <strong className="font-semibold text-ink">{d.title}:</strong> {d.metrics.reminder}
                  </span>
                  <ArrowRight size={14} className="mt-1 shrink-0 text-ink-3 transition group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
