import { Link, useNavigate } from 'react-router';
import { formatDayMonth, formatDuration, formatHM, WORKDAYS_PER_CYCLE, type CycleSummary } from '@acomp/shared';
import { useCycle } from '../api/client';
import { ConformityBadge } from '../components/Badges';
import { CycleNav } from '../components/CycleNav';
import { ArrowLeft, CheckIcon, AlertIcon } from '../components/icons';
import { ErrorState, Skeleton } from '../components/States';
import { useRefDate, withDate } from '../hooks';

/** Acompanhamento diário detalhado — espelha a primeira tabela da planilha. */
export function Details() {
  const [date, setDate] = useRefDate();
  const cycle = useCycle(date);

  return (
    <div className="space-y-6">
      <Link
        to={withDate('/', date)}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-2 transition hover:text-ink"
      >
        <ArrowLeft size={16} /> Voltar ao painel
      </Link>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">Acompanhamento diário</h1>
          <p className="mt-1 text-sm text-ink-2">
            {cycle.data
              ? `Meta diária de ${formatDuration(cycle.data.dailyGoal)} · ciclo de ${WORKDAYS_PER_CYCLE} dias úteis`
              : 'Detalhamento por dia útil'}
          </p>
        </div>
        <CycleNav date={date} onChange={setDate} />
      </div>

      {cycle.isPending ? (
        <Skeleton className="h-96" />
      ) : cycle.isError ? (
        <ErrorState message={cycle.error.message} onRetry={() => cycle.refetch()} />
      ) : (
        <DetailTable summary={cycle.data} />
      )}
    </div>
  );
}

function DiffCell({ label }: { label: string }) {
  if (!label) return <span className="text-ink-3">—</span>;
  const tone = label === '00:00' ? 'text-good-text' : label.startsWith('+') ? 'text-critical-text' : 'text-warning-text';
  return <span className={`font-semibold ${tone}`}>{label}</span>;
}

function DetailTable({ summary }: { summary: CycleSummary }) {
  const navigate = useNavigate();
  const { days, week } = summary;
  const allConform = week.conformDays === WORKDAYS_PER_CYCLE;

  const th = 'px-4 py-3 text-left text-[11px] font-semibold tracking-wider text-ink-3 uppercase whitespace-nowrap';
  const td = 'px-4 py-3.5 whitespace-nowrap';

  return (
    <div className="card rise overflow-hidden">
      <div className="overflow-x-auto">
        <table className="tabular w-full text-sm">
          <thead className="border-b border-line bg-surface-2/60">
            <tr>
              <th className={th}>Data</th>
              <th className={th}>Dia da semana</th>
              <th className={`${th} text-right!`}>Meta</th>
              <th className={`${th} text-right!`}>Horas apontadas</th>
              <th className={`${th} text-right!`}>Diferença</th>
              <th className={`${th} text-right!`}>Apontamentos</th>
              <th className={th}>Conformidade</th>
              <th className={th}>Diagnóstico</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {days.map((d) => (
              <tr
                key={d.date}
                onClick={() => navigate(`/apontamentos?data=${d.date}`)}
                className="cursor-pointer transition hover:bg-surface-2/60"
                title="Abrir apontamentos do dia"
              >
                <td className={`${td} font-semibold text-ink`}>{formatDayMonth(d.date)}</td>
                <td className={`${td} text-ink-2 [font-variant-numeric:normal]`}>{d.weekdayLong}</td>
                <td className={`${td} text-right text-ink-2`}>{formatHM(d.goal)}</td>
                <td className={`${td} text-right font-semibold text-ink`}>{formatHM(d.minutes)}</td>
                <td className={`${td} text-right`}>
                  <DiffCell label={d.diffLabel} />
                </td>
                <td className={`${td} text-right text-ink`}>{d.activityCount}</td>
                <td className={td}>
                  <ConformityBadge day={d} />
                </td>
                <td className={`${td} min-w-64 whitespace-normal! ${d.exceeded ? 'font-medium text-critical-text' : 'text-ink-2'}`}>
                  {d.diagnosis}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-line bg-surface-2/60">
            <tr className="font-semibold">
              <td className={`${td} text-ink`}>Total geral</td>
              <td className={`${td} text-ink-2`}>{WORKDAYS_PER_CYCLE} dias</td>
              <td className={`${td} text-right text-ink`}>{formatHM(week.goal)}</td>
              <td className={`${td} text-right text-ink`}>{formatHM(week.total)}</td>
              <td className={`${td} text-right`}>
                <DiffCell label={week.diffLabel} />
              </td>
              <td className={`${td} text-right text-ink`}>{week.activityCount}</td>
              <td className={td}>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${
                    allConform ? 'bg-good-soft text-good-text' : 'bg-warning-soft text-warning-text'
                  }`}
                >
                  {allConform ? <CheckIcon size={13} /> : <AlertIcon size={13} />}
                  {week.conformityLabel}
                </span>
              </td>
              <td className={`${td} text-ink`}>{week.diagnosis}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3 text-xs text-ink-3">
        <span>
          Semana {week.fillPercent}% preenchida · {formatDuration(week.total)} de {formatDuration(week.goal)}
        </span>
        <span>Clique em um dia para editar os apontamentos.</span>
      </div>
    </div>
  );
}
