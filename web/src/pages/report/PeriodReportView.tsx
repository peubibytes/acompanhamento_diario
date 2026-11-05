import { Link } from 'react-router';
import {
  formatPeriodLabel,
  getPeriod,
  periodBlockersSummary,
  periodDoneSummary,
  periodReportMarkdown,
  periodReportTitle,
  unplannedText,
  type ISODate,
  type PeriodReport,
  type PeriodScale,
  type PeriodTaskItem,
} from '@acomp/shared';
import { usePeriodReport } from '../../api/client';
import { categoryIcon } from '../../components/DemandVisuals';
import { AlertIcon } from '../../components/icons';
import { PageHeader } from '../../components/PageHeader';
import { PeriodNav } from '../../components/PeriodNav';
import { SectionTitle } from '../../components/SectionTitle';
import { ErrorState, Skeleton } from '../../components/States';
import { BlockerList, ExportButtons, GROUP, plural, ScaleSwitch, useReportExport, type ReportScale } from './parts';

const PAGE_HINT = (
  <>
    <span className="block">
      Resumo da semana (sexta → quinta) ou do mês para o 1:1 e a prestação de contas: os ciclos que andaram e o que
      aconteceu neles, as tarefas concluídas e trabalhadas, as reuniões e os impedimentos.
    </span>
    <span className="mt-1.5 block">
      Como no diário, horários e horas não entram. A exceção é o <strong className="font-semibold text-ink">trabalho
      não planejado</strong>: quanto do tempo foi para ciclos intempestivos.
    </span>
  </>
);

const UNPLANNED_HINT = (
  <>
    <span className="block">
      Fatia do tempo apontado no período em ciclos do tipo <strong className="font-semibold text-ink">Intempestiva</strong>{' '}
      (demandas não planejadas). Só os ciclos têm tipo; tarefas e reuniões contam no total.
    </span>
    <span className="mt-1.5 block">
      Horários sobrepostos contam uma vez; o trecho dividido com outra demanda vale metade para cada uma.
    </span>
  </>
);

/** Relatório da semana ou do mês, com a mesma navegação do Painel. */
export function PeriodReportView({
  date,
  scale,
  reportScale,
  onDate,
  onScale,
}: {
  date: ISODate;
  scale: PeriodScale;
  reportScale: ReportScale;
  onDate: (date: ISODate) => void;
  onScale: (scale: ReportScale) => void;
}) {
  const report = usePeriodReport(date, scale);
  const period = getPeriod(date, scale);
  const markdown = report.data ? periodReportMarkdown(report.data) : '';
  const { copy, download } = useReportExport(markdown, `relatorio-${scale === 'week' ? 'semanal' : 'mensal'}-${period.start}.md`);

  return (
    <>
      <PageHeader
        title="Relatório"
        hint={PAGE_HINT}
        action={
          <button type="button" onClick={copy} disabled={!report.data} className="btn-primary print:hidden">
            Copiar
          </button>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <ScaleSwitch value={reportScale} onChange={onScale} />
          <PeriodNav date={date} scale={scale} onChange={onDate} />
        </div>
        <ExportButtons ready={Boolean(report.data)} onDownload={download} />
      </div>

      <h2 className="hidden text-lg font-semibold text-ink print:block">
        {periodReportTitle(period)} — {formatPeriodLabel(period)}
      </h2>

      {report.isPending ? (
        <Skeleton className="h-[30rem]" />
      ) : report.isError ? (
        <ErrorState message={report.error.message} onRetry={() => report.refetch()} />
      ) : (
        <div className="space-y-section">
          <DoneSection report={report.data} />
          <BlockersSection report={report.data} />
          <UnplannedSection report={report.data} />
        </div>
      )}
    </>
  );
}

function DoneSection({ report }: { report: PeriodReport }) {
  const d = report.done;
  const summary = periodDoneSummary(d);

  return (
    <section className="card rise p-5 sm:p-6" aria-label="O que foi feito">
      <SectionTitle title="O que foi feito" />
      {!summary && d.otherWork.length === 0 ? (
        <p className="mt-3 text-sm text-ink-2">Nada registrado neste período.</p>
      ) : (
        <>
          {summary && <p className="tabular mt-1 text-sm font-medium text-ink-2">{summary}</p>}
          <div className="mt-5 space-y-5 border-t border-line pt-5">
            {d.cycles.length > 0 && (
              <div>
                <h3 className={GROUP}>Ciclos</h3>
                <ul className="space-y-3">
                  {d.cycles.map((c) => (
                    <li key={c.demandId}>
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                        <span className="shrink-0 text-ink-3">{categoryIcon.ciclo(15)}</span>
                        <Link to={`/demandas#demanda-${c.demandId}`} className="font-semibold text-ink hover:underline">
                          {c.label}
                        </Link>
                        {c.kind && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning-text">
                            <AlertIcon size={12} /> {c.kind}
                          </span>
                        )}
                        <StatusChip text={c.status} changed={c.changed} />
                        {c.workedDays > 0 && (
                          <span className="tabular text-xs text-ink-3">{plural(c.workedDays, 'dia', 'dias')} de trabalho</span>
                        )}
                      </p>
                      {c.events.length > 0 && (
                        <ul className="mt-1 ml-6 list-disc space-y-0.5 pl-4 text-sm text-ink-2 marker:text-ink-3">
                          {c.events.map((e, i) => (
                            <li key={i}>{e}</li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {d.completedTasks.length > 0 && <TaskGroup title="Tarefas concluídas" items={d.completedTasks} />}
            {d.workedTasks.length > 0 && <TaskGroup title="Tarefas em andamento" items={d.workedTasks} />}
            {d.otherWork.length > 0 && <TaskGroup title="Outras atividades" items={d.otherWork} />}
            {d.meetings.length > 0 && (
              <div>
                <h3 className={GROUP}>Reuniões</h3>
                <ul className="space-y-1.5 text-sm">
                  {d.meetings.map((m) => (
                    <li key={m.demandId} className="flex items-center gap-2">
                      <span className="shrink-0 text-ink-3">{categoryIcon.reuniao(15)}</span>
                      <span className="min-w-0 text-ink">
                        {m.label} <span className="text-ink-3">com {m.participants}</span>
                      </span>
                      <span className="tabular ml-auto shrink-0 text-xs text-ink-3">{plural(m.occurrences, 'vez', 'vezes')}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function StatusChip({ text, changed }: { text: string; changed: boolean }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${changed ? 'bg-accent-soft text-accent' : 'bg-neutral-soft text-ink-2'}`}>
      {text}
    </span>
  );
}

function TaskGroup({ title, items }: { title: string; items: PeriodTaskItem[] }) {
  return (
    <div>
      <h3 className={GROUP}>{title}</h3>
      <ul className="space-y-2">
        {items.map((i) => (
          <li key={i.demandId} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className="shrink-0 text-ink-3">{categoryIcon[i.category](15)}</span>
            <Link to={`/demandas#demanda-${i.demandId}`} className="font-semibold text-ink hover:underline">
              {i.label}
            </Link>
            {i.subtitle && <span className="min-w-0 text-ink-3">{i.subtitle}</span>}
            <StatusChip text={i.status} changed={i.changed} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function BlockersSection({ report }: { report: PeriodReport }) {
  const b = report.blockers;
  return (
    <section className="card rise p-5 sm:p-6" aria-label="Impedimentos">
      <SectionTitle title="Impedimentos" />
      {b.items.length === 0 ? (
        <p className="mt-3 text-sm text-ink-2">Sem impedimentos.</p>
      ) : (
        <>
          <p className="tabular mt-1 text-sm font-medium text-ink-2">{periodBlockersSummary(b)}</p>
          <BlockerList items={b.items} />
        </>
      )}
    </section>
  );
}

function UnplannedSection({ report }: { report: PeriodReport }) {
  const u = report.unplanned;
  return (
    <section className="card rise p-5 sm:p-6" aria-label="Trabalho não planejado">
      <SectionTitle title="Trabalho não planejado" hint={UNPLANNED_HINT} />
      <div className="mt-3 flex items-baseline gap-3">
        {u.percent !== null && (
          <span className="tabular text-2xl font-semibold tracking-tight text-ink sm:text-display sm:font-bold">{u.percent}%</span>
        )}
        <p className="text-sm text-ink-2">{unplannedText(u)}</p>
      </div>
    </section>
  );
}
