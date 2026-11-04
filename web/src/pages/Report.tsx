import { useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  dailyReportMarkdown,
  doneDetail,
  doneHeadline,
  doneTitle,
  formatDayMonth,
  formatDuration,
  hasDoneWork,
  isValidISODate,
  isWorkday,
  nextTitle,
  nextWorkday,
  planSentence,
  previousWorkday,
  REPORT_INLINE_LIMIT,
  selectedNext,
  todayISO,
  WEEKDAY_SHORT,
  weekdayOf,
  type DailyReport,
  type PeriodScale,
  type ISODate,
  type ReportNextItem,
  type ReportWorkItem,
} from '@acomp/shared';
import { useDailyReport } from '../api/client';
import { categoryIcon } from '../components/DemandVisuals';
import { ChevronLeft, ChevronRight } from '../components/icons';
import { PageHeader } from '../components/PageHeader';
import { SectionTitle } from '../components/SectionTitle';
import { ErrorState, Skeleton } from '../components/States';
import { PeriodReportView } from './report/PeriodReportView';
import {
  BlockerList,
  ExportButtons,
  GROUP,
  LightTable,
  plural,
  ScaleSwitch,
  useReportExport,
  type ReportScale,
} from './report/parts';

type SkipKey = number | 'fila';

const dayLabel = (iso: ISODate) => `${WEEKDAY_SHORT[weekdayOf(iso)]} ${formatDayMonth(iso)}`;

/** A escala fica na URL como no Painel (?escala=mes); aqui também há a semana, e sem ela vale o dia. */
const SCALE_PARAM = 'escala';
const PERIOD_OF: Partial<Record<ReportScale, PeriodScale>> = { semana: 'week', mes: 'month' };

const PAGE_HINT = (
  <>
    <span className="block">
      O relatório da daily em dois tópicos, montado com o que você registrou: o que foi feito no dia (por padrão, o
      dia útil anterior) e o que será feito no próximo.
    </span>
    <span className="mt-1.5 block">
      Cada tópico abre com uma frase pronta para ler. Apontamentos, eventos e trocas de status da mesma demanda viram
      um item só; acima de três itens de um tipo, eles vão para uma tabela.
    </span>
    <span className="mt-1.5 block">
      Em <strong className="font-semibold text-ink">O que será feito</strong>, desmarque o que não quiser levar: a frase
      muda junto. Nada disso é gravado.
    </span>
  </>
);

export function Report() {
  const [params, setParams] = useSearchParams();
  const rawScale = params.get(SCALE_PARAM);
  const scale: ReportScale = rawScale === 'semana' || rawScale === 'mes' ? rawScale : 'dia';
  const period = PERIOD_OF[scale];
  const raw = params.get('data');
  const valid = raw && isValidISODate(raw) ? raw : null;

  // Troca só o que mudou: a data continua ao mudar de escala, e a escala ao mudar de data.
  const update = (next: { date?: ISODate | null; scale?: ReportScale }) => {
    const query: Record<string, string> = {};
    const nextDate = next.date === undefined ? valid : next.date;
    const nextScale = next.scale ?? scale;
    if (nextDate) query.data = nextDate;
    if (nextScale !== 'dia') query[SCALE_PARAM] = nextScale;
    setParams(query, { replace: true });
  };
  const setScale = (next: ReportScale) => update({ scale: next });

  if (period) {
    // Semana ou mês: sem data, o período de hoje.
    const date = valid ?? todayISO();
    return (
      <div className="space-y-section">
        <PeriodReportView
          date={date}
          scale={period}
          reportScale={scale}
          onDate={(d) => update({ date: d === todayISO() ? null : d })}
          onScale={setScale}
        />
      </div>
    );
  }

  // O relatório diário é de um dia útil: sábado e domingo caem na sexta. Sem data, o dia útil anterior.
  const requested = valid ?? previousWorkday(todayISO());
  const date = isWorkday(requested) ? requested : previousWorkday(requested);
  return (
    <div className="space-y-section">
      {/* A chave reinicia os itens desmarcados ao trocar de dia. */}
      <ReportBody key={date} date={date} setDate={(d) => update({ date: d })} onScale={setScale} />
    </div>
  );
}

function ReportBody({
  date,
  setDate,
  onScale,
}: {
  date: ISODate;
  setDate: (d: ISODate) => void;
  onScale: (scale: ReportScale) => void;
}) {
  const report = useDailyReport(date);
  const [skip, setSkip] = useState<Set<SkipKey>>(new Set());
  const today = todayISO();
  const markdown = report.data ? dailyReportMarkdown(report.data, { skipNext: skip, today }) : '';
  const { copy, download } = useReportExport(markdown, `daily-${date}.md`);

  const toggle = (key: SkipKey) =>
    setSkip((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });

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
          <ScaleSwitch value="dia" onChange={onScale} />
          <DayNav date={date} onChange={setDate} />
        </div>
        <ExportButtons ready={Boolean(report.data)} onDownload={download} />
      </div>

      <h2 className="hidden text-lg font-semibold text-ink print:block">Daily — {dayLabel(date)}</h2>

      {report.isPending ? (
        <Skeleton className="h-[30rem]" />
      ) : report.isError ? (
        <ErrorState message={report.error.message} onRetry={() => report.refetch()} />
      ) : (
        <div className="space-y-section">
          <DoneSection report={report.data} today={today} />
          <NextSection report={report.data} today={today} skip={skip} onToggle={toggle} />
        </div>
      )}
    </>
  );
}

function DayNav({ date, onChange }: { date: ISODate; onChange: (d: ISODate) => void }) {
  const today = todayISO();
  const yesterday = previousWorkday(today);
  const tag = date === today ? 'Hoje' : date === yesterday ? 'Dia útil anterior' : 'Dia';
  const navButton =
    'grid size-9 place-items-center rounded-full text-ink-2 transition hover:bg-surface-2 hover:text-ink disabled:opacity-40';

  return (
    <div className="flex items-center gap-1">
      <button type="button" className={navButton} onClick={() => onChange(previousWorkday(date))} aria-label="Dia útil anterior">
        <ChevronLeft />
      </button>
      <div className="min-w-0 px-1 text-center sm:text-left">
        <p className="text-2xs font-semibold tracking-wider text-ink-3 uppercase">{tag}</p>
        <p className="tabular text-base font-semibold whitespace-nowrap text-ink">{dayLabel(date)}</p>
      </div>
      <button
        type="button"
        className={navButton}
        onClick={() => onChange(nextWorkday(date))}
        disabled={date >= today}
        aria-label="Próximo dia útil"
      >
        <ChevronRight />
      </button>
      {date !== yesterday && (
        <button
          type="button"
          onClick={() => onChange(yesterday)}
          className="ml-1 rounded-full bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent transition hover:brightness-95"
        >
          Dia útil anterior
        </button>
      )}
    </div>
  );
}

const many = (n: number) => n > REPORT_INLINE_LIMIT;

/** A frase que abre cada tópico: em destaque, com o filete da cor de destaque. */
function Lead({ children }: { children: ReactNode }) {
  return (
    <p className="mt-4 border-l-2 border-accent pl-4 text-base font-medium text-pretty text-ink" data-testid="report-lead">
      {children}
    </p>
  );
}

/** Data do tópico, ao lado do título. */
function DateChip({ date }: { date: ISODate }) {
  return <span className="tabular rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium text-ink-2">{dayLabel(date)}</span>;
}

function Metric({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="rounded-control bg-surface-2 px-3 py-2.5">
      <dt className="flex items-center gap-1.5 text-2xs font-semibold tracking-normal text-ink-3 uppercase sm:tracking-wider">
        <span aria-hidden className="hidden sm:inline">
          {icon}
        </span>
        {label}
      </dt>
      <dd className="tabular mt-1 text-2xl font-semibold text-ink">{value}</dd>
    </div>
  );
}

const demandLink = (i: { demandId: number; label: string }) => (
  <Link to={`/demandas#demanda-${i.demandId}`} className="font-semibold text-ink hover:underline">
    {i.label}
  </Link>
);

function StatusChip({ item }: { item: ReportWorkItem }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${
        item.changed ? 'bg-accent-soft text-accent' : 'bg-neutral-soft text-ink-2'
      }`}
    >
      {item.status}
    </span>
  );
}

function DoneSection({ report, today }: { report: DailyReport; today: ISODate }) {
  const d = report.done;
  const title = doneTitle(report.date, today);

  return (
    <section className="card rise p-5 sm:p-6" aria-label="O que foi feito">
      <SectionTitle title={title} aside={<DateChip date={report.date} />} />
      {!hasDoneWork(d) ? (
        <p className="mt-3 text-sm text-ink-2">
          Nada registrado neste dia.{' '}
          <Link to={`/apontamentos?data=${report.date}`} className="font-semibold text-accent hover:underline">
            Registrar apontamentos
          </Link>
        </p>
      ) : (
        <>
          <dl className={`mt-4 grid gap-2 ${d.trainings.length ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}`}>
            <Metric label="Chamados" value={String(d.tickets.length)} icon={categoryIcon.chamado(12)} />
            <Metric label="Reuniões" value={String(d.meetings.length)} icon={categoryIcon.reuniao(12)} />
            {d.trainings.length > 0 && (
              <Metric label="Treinamentos" value={String(d.trainings.length)} icon={categoryIcon.treinamento(12)} />
            )}
            <Metric
              label="Ciclos"
              value={d.cycleMinutes ? formatDuration(d.cycleMinutes) : '0h'}
              icon={categoryIcon.ciclo(12)}
            />
          </dl>
          <Lead>{doneHeadline(report, today)}</Lead>
          <p className="mt-3 text-sm leading-relaxed text-pretty text-ink-2">{doneDetail(d)}</p>

          {many(d.tickets.length) && (
            <LightTable
              caption="Chamados atendidos"
              head={['Chamado', 'Descrição', 'Situação']}
              hideOnMobile={[2]}
              rows={d.tickets.map((i) => ({
                key: i.demandId,
                cells: [
                  <>
                    {demandLink(i)}
                    <span className="mt-1 block sm:hidden">
                      <StatusChip item={i} />
                    </span>
                  </>,
                  i.subtitle,
                  <StatusChip item={i} />,
                ],
              }))}
            />
          )}
          {many(d.meetings.length) && (
            <div className="mt-5">
              <h3 className={GROUP}>Reuniões</h3>
              <ul className="space-y-1.5 text-sm">
                {d.meetings.map((m) => (
                  <li key={m.demandId} className="flex items-center gap-2">
                    <span className="shrink-0 text-ink-3">{categoryIcon.reuniao(15)}</span>
                    <span className="min-w-0 text-ink">
                      {m.label} <span className="text-ink-3">com {m.participants}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {many(d.trainings.length) && (
            <LightTable
              caption="Treinamentos"
              head={['Treinamento', 'Situação']}
              rows={d.trainings.map((i) => ({ key: i.demandId, cells: [demandLink(i), <StatusChip item={i} />] }))}
            />
          )}
          {many(d.cycles.length) && (
            <LightTable
              caption="Demandas de ciclo"
              head={['Ciclo', 'Situação', 'Horas', 'Ações']}
              numeric={2}
              hideOnMobile={[1, 2]}
              rows={d.cycles.map((i) => ({
                key: i.demandId,
                cells: [
                  <>
                    {demandLink(i)}
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 sm:hidden">
                      <StatusChip item={i} />
                      <span className="tabular text-xs text-ink-3">{i.minutes ? formatDuration(i.minutes) : '—'}</span>
                    </span>
                  </>,
                  <StatusChip item={i} />,
                  i.minutes ? formatDuration(i.minutes) : '—',
                  i.progress.join('; '),
                ],
              }))}
            />
          )}
        </>
      )}
    </section>
  );
}

function NextSection({
  report,
  today,
  skip,
  onToggle,
}: {
  report: DailyReport;
  today: ISODate;
  skip: Set<SkipKey>;
  onToggle: (key: SkipKey) => void;
}) {
  const next = report.next;
  const chosen = selectedNext(next, skip);
  const openBlockers = report.blockers.items.filter((b) => b.resolvedAt === null);
  const hasItems = next.tickets.length + next.trainings.length + next.cycles.length + next.queued > 0;

  const row = (key: SkipKey, content: ReactNode) => (
    <li key={String(key)}>
      <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ink-2">
        <input
          type="checkbox"
          checked={!skip.has(key)}
          onChange={() => onToggle(key)}
          className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]"
        />
        <span className={`min-w-0 ${skip.has(key) ? 'text-ink-3 line-through' : ''}`}>{content}</span>
      </label>
    </li>
  );

  const item = (i: ReportNextItem) =>
    row(
      i.demandId,
      <>
        <span className="mr-1.5 inline-block align-[-2px] text-ink-3">{categoryIcon[i.category](14)}</span>
        <strong className="font-semibold text-ink">{i.label}</strong>
        {i.isNew && (
          <span className="ml-1.5 rounded-full bg-accent-soft px-1.5 py-0.5 text-2xs font-semibold text-accent">novo</span>
        )}
        {i.detail && <span> — {i.detail}</span>}
      </>,
    );

  return (
    <section className="card rise p-5 sm:p-6" aria-label="O que será feito">
      <SectionTitle title={nextTitle(next.date, today)} aside={<DateChip date={next.date} />} />
      <Lead>{planSentence(next, today, skip)}</Lead>

      {/* Na tela, a lista para tirar itens antes de copiar; na impressão, as tabelas (acima de três). */}
      {hasItems && (
        <div className="mt-5 border-t border-line pt-5 print:hidden">
          <h3 className={GROUP}>Itens do plano</h3>
          <ul className="space-y-2.5">
            {next.tickets.map(item)}
            {next.trainings.map(item)}
            {next.cycles.map(item)}
            {next.queued > 0 && row('fila', <>Na fila: {plural(next.queued, 'tarefa', 'tarefas')}</>)}
          </ul>
        </div>
      )}
      <div className="hidden print:block">
        {many(chosen.tickets.length) && (
          <LightTable
            caption="Chamados"
            head={['Chamado', 'Descrição']}
            rows={chosen.tickets.map((i) => ({ key: i.demandId, cells: [i.label, i.detail] }))}
          />
        )}
        {many(chosen.cycles.length) && (
          <LightTable
            caption="Demandas de ciclo"
            head={['Ciclo', 'Situação']}
            rows={chosen.cycles.map((i) => ({ key: i.demandId, cells: [i.label, i.detail] }))}
          />
        )}
        {chosen.queued > 0 && <p className="mt-3 text-sm text-ink-2">Na fila: {plural(chosen.queued, 'tarefa', 'tarefas')}</p>}
      </div>

      {openBlockers.length > 0 && (
        <div className="mt-5">
          <h3 className={GROUP}>Impedimentos em aberto</h3>
          <BlockerList items={openBlockers} bare />
        </div>
      )}
    </section>
  );
}
