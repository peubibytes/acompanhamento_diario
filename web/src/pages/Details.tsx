import { Link, useNavigate, useSearchParams } from 'react-router';
import { formatDayMonth, formatDuration, formatHM, WORKDAYS_PER_CYCLE, type CycleSummary } from '@acomp/shared';
import { useCycle } from '../api/client';
import { ConformityBadge } from '../components/Badges';
import { CycleNav } from '../components/CycleNav';
import { CycleTimelineAnalysis } from '../components/CycleTimelineAnalysis';
import { AlertIcon, CheckIcon } from '../components/icons';
import { PageHeader } from '../components/PageHeader';
import { Segmented } from '../components/Segmented';
import { ErrorState, Skeleton } from '../components/States';
import { useRefDate } from '../hooks';

type Tab = 'dia' | 'ciclos';

/**
 * Detalhes: a aba "Dia a dia" espelha a primeira tabela da planilha (o ciclo de apontamento);
 * a aba "Ciclos" analisa a linha do tempo dos ciclos de trabalho (v0.8).
 */
export function Details() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('aba') === 'ciclos' ? 'ciclos' : 'dia';
  const [date, setDate] = useRefDate();
  const cycle = useCycle(date);

  const chooseTab = (next: Tab) =>
    setParams(
      (current) => {
        // Cada aba tem seus filtros; trocar de aba começa limpo (a data de referência fica).
        const kept = new URLSearchParams();
        const data = current.get('data');
        if (data) kept.set('data', data);
        if (next === 'ciclos') kept.set('aba', 'ciclos');
        return kept;
      },
      { replace: true },
    );

  const tabs = (
    <Segmented
      label="Detalhes"
      value={tab}
      onChange={chooseTab}
      stretch
      options={[
        { value: 'dia', label: 'Dia a dia' },
        { value: 'ciclos', label: 'Ciclos' },
      ]}
    />
  );

  if (tab === 'ciclos') {
    return (
      <div className="space-y-section">
        <PageHeader
          title="Detalhes"
          hint={
            <>
              <span className="block">A linha do tempo dos ciclos para analisar: ações, decisões, impedimentos, validações e deploys.</span>
              <span className="mt-1.5 block">
                Filtre por ciclo e por tipo (os números são o que já foi registrado). Marque com a bandeira o que merece
                atenção: a linha ganha uma faixa vermelha, também nas telas Demandas e Painel.
              </span>
              <span className="mt-1.5 block">
                O padrão é todos os ciclos abertos. Os filtros ficam no endereço da página.
              </span>
            </>
          }
        />
        {tabs}
        <CycleTimelineAnalysis />
      </div>
    );
  }

  return (
    <div className="space-y-section">
      <PageHeader
        title="Detalhes"
        hint={
          <>
            <span className="block">
              O acompanhamento diário do ciclo, como na planilha
              {cycle.data && `: meta diária de ${formatDuration(cycle.data.dailyGoal)}, ${WORKDAYS_PER_CYCLE} dias úteis`}.
            </span>
            {cycle.data && (
              <span className="mt-1.5 block">
                Semana {cycle.data.week.fillPercent}% preenchida: {formatDuration(cycle.data.week.total)} de{' '}
                {formatDuration(cycle.data.week.goal)}.
              </span>
            )}
            <span className="mt-1.5 block">Clique em um dia para editar os apontamentos.</span>
          </>
        }
        action={<CycleNav date={date} onChange={setDate} />}
      />
      {tabs}

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

  // Cabeçalho fixo dentro da área rolável (que também rola na horizontal no celular).
  const th =
    'sticky top-0 z-10 bg-surface px-4 py-3 text-left text-2xs font-semibold tracking-wider whitespace-nowrap text-ink-3 uppercase shadow-[inset_0_-1px_0_var(--border)]';
  const td = 'px-4 py-3.5 whitespace-nowrap';

  return (
    <div className="card rise overflow-hidden">
      <div className="max-h-[calc(100dvh-13rem)] overflow-auto">
        <table className="tabular w-full text-sm">
          <thead>
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
          <tbody>
            {days.map((d) => (
              <tr
                key={d.date}
                onClick={(e) => {
                  // O link da data já navega; sem isto, o clique nele navegaria duas vezes.
                  if (!(e.target as HTMLElement).closest('a')) navigate(`/apontamentos?data=${d.date}`);
                }}
                className="cursor-pointer transition even:bg-surface-2/50 hover:bg-surface-2"
              >
                <td className={td}>
                  <Link
                    to={`/apontamentos?data=${d.date}`}
                    className="rounded font-semibold text-ink outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    {formatDayMonth(d.date)}
                  </Link>
                </td>
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
          <tfoot>
            <tr className="bg-surface-2 font-semibold">
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
    </div>
  );
}
