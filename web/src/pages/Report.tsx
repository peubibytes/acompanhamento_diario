import { useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  blockersSummary,
  DEMAND_CATEGORY_LABEL,
  dailyReportMarkdown,
  doneSummary,
  formatDayMonth,
  isValidISODate,
  isWorkday,
  nextTitle,
  nextWorkday,
  previousWorkday,
  todayISO,
  WEEKDAY_SHORT,
  weekdayOf,
  type DailyReport,
  type ISODate,
  type ReportNextItem,
  type ReportWorkItem,
} from '@acomp/shared';
import { useDailyReport } from '../api/client';
import { categoryIcon } from '../components/DemandVisuals';
import { ChevronLeft, ChevronRight, HourglassIcon } from '../components/icons';
import { PageHeader } from '../components/PageHeader';
import { SectionTitle } from '../components/SectionTitle';
import { ErrorState, Skeleton } from '../components/States';
import { useToast } from '../components/Toast';

type SkipKey = number | 'fila';

const dayLabel = (iso: ISODate) => `${WEEKDAY_SHORT[weekdayOf(iso)]} ${formatDayMonth(iso)}`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const PAGE_HINT = (
  <>
    <span className="block">
      Resumo de um dia para a daily ou o 1:1: quais ciclos andaram, quais tarefas você trabalhou ou concluiu e
      quantas reuniões teve. Por padrão, o dia útil anterior.
    </span>
    <span className="mt-1.5 block">
      Horários e horas apontadas não entram: são do controle de apontamento, não da conversa com a equipe.
    </span>
    <span className="mt-1.5 block">
      Em <strong className="font-semibold text-ink">O que será feito</strong>, desmarque o que não quiser levar. Nada
      disso é gravado.
    </span>
  </>
);

const SECONDARY =
  'rounded-full px-4 py-2 text-sm font-semibold text-ink-2 outline-none transition hover:bg-surface-2 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60';

export function Report() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('data');
  // O relatório é de um dia útil: sábado e domingo caem na sexta. Sem data, o dia útil anterior.
  const requested = raw && isValidISODate(raw) ? raw : previousWorkday(todayISO());
  const date = isWorkday(requested) ? requested : previousWorkday(requested);
  const setDate = (next: ISODate) => setParams({ data: next }, { replace: true });

  return (
    <div className="space-y-section">
      {/* A chave reinicia os itens desmarcados ao trocar de dia. */}
      <ReportBody key={date} date={date} setDate={setDate} />
    </div>
  );
}

function ReportBody({ date, setDate }: { date: ISODate; setDate: (d: ISODate) => void }) {
  const report = useDailyReport(date);
  const toast = useToast();
  const [skip, setSkip] = useState<Set<SkipKey>>(new Set());
  const markdown = report.data ? dailyReportMarkdown(report.data, { skipNext: skip, today: todayISO() }) : '';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      toast('Relatório copiado.');
    } catch {
      toast('Não foi possível copiar. Use "Baixar .md".', 'error');
    }
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `daily-${date}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

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
        <DayNav date={date} onChange={setDate} />
        <div className="flex items-center gap-1">
          <button type="button" onClick={download} disabled={!report.data} className={SECONDARY}>
            Baixar .md
          </button>
          <button type="button" onClick={() => window.print()} disabled={!report.data} className={SECONDARY}>
            Imprimir / PDF
          </button>
        </div>
      </div>

      <h2 className="hidden text-lg font-semibold text-ink print:block">Daily — {dayLabel(date)}</h2>

      {report.isPending ? (
        <Skeleton className="h-[30rem]" />
      ) : report.isError ? (
        <ErrorState message={report.error.message} onRetry={() => report.refetch()} />
      ) : (
        <div className="space-y-section">
          <DoneSection report={report.data} />
          <BlockersSection report={report.data} />
          <NextSection report={report.data} skip={skip} onToggle={toggle} />
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

const GROUP = 'mb-2 text-2xs font-semibold tracking-wider text-ink-3 uppercase';

function DoneSection({ report }: { report: DailyReport }) {
  const d = report.done;
  const summary = doneSummary(d);

  return (
    <section className="card rise p-5 sm:p-6" aria-label="O que foi feito">
      <SectionTitle title="O que foi feito" />
      {!summary ? (
        <p className="mt-3 text-sm text-ink-2">
          Nada registrado neste dia.{' '}
          <Link to={`/apontamentos?data=${report.date}`} className="font-semibold text-accent hover:underline">
            Registrar apontamentos
          </Link>
        </p>
      ) : (
        <>
          <p className="tabular mt-1 text-sm font-medium text-ink-2">{summary}</p>
          <div className="mt-5 space-y-5 border-t border-line pt-5">
            {d.cycles.length > 0 && <WorkGroup title="Ciclos" items={d.cycles} />}
            {d.tasks.length > 0 && <WorkGroup title="Tarefas" items={d.tasks} />}
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

function WorkGroup({ title, items }: { title: string; items: ReportWorkItem[] }) {
  return (
    <div>
      <h3 className={GROUP}>{title}</h3>
      <ul className="space-y-3">
        {items.map((i) => (
          <li key={i.demandId}>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <span className="shrink-0 text-ink-3">{categoryIcon[i.category](15)}</span>
              <Link to={`/demandas#demanda-${i.demandId}`} className="font-semibold text-ink hover:underline">
                {i.label}
              </Link>
              {i.subtitle && <span className="min-w-0 text-ink-3">{i.subtitle}</span>}
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  i.changed ? 'bg-accent-soft text-accent' : 'bg-neutral-soft text-ink-2'
                }`}
              >
                {i.status}
              </span>
            </p>
            {i.progress.length > 0 && (
              <ul className="mt-1 ml-6 list-disc space-y-0.5 pl-4 text-sm text-ink-2 marker:text-ink-3">
                {i.progress.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function BlockersSection({ report }: { report: DailyReport }) {
  const b = report.blockers;

  return (
    <section className="card rise p-5 sm:p-6" aria-label="Impedimentos">
      <SectionTitle title="Impedimentos" />
      {b.items.length === 0 ? (
        <p className="mt-3 text-sm text-ink-2">Sem impedimentos.</p>
      ) : (
        <>
          <p className="tabular mt-1 text-sm font-medium text-ink-2">{blockersSummary(b)}</p>
          <ul className="mt-5 space-y-3 border-t border-line pt-5 text-sm">
            {b.items.map((i, index) => (
              <li key={index} className="flex gap-2.5">
                <span className={`mt-0.5 shrink-0 ${i.resolvedAt ? 'text-good-text' : 'text-warning-text'}`}>
                  <HourglassIcon size={15} />
                </span>
                <span className="min-w-0 text-ink-2">
                  <strong className="font-semibold text-ink">{i.label}</strong> —{' '}
                  {i.resolvedAt
                    ? `resolvido em ${formatDayMonth(i.resolvedAt)} (${i.owner})`
                    : `aguardando ${i.owner} desde ${formatDayMonth(i.since)} (${plural(i.waitingWorkdays, 'dia útil', 'dias úteis')})`}
                  {i.description && <span className="text-ink-3">: {i.description}</span>}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function NextSection({
  report,
  skip,
  onToggle,
}: {
  report: DailyReport;
  skip: Set<SkipKey>;
  onToggle: (key: SkipKey) => void;
}) {
  const next = report.next;
  // Sem demanda aberta, a seção nem aparece.
  if (!next) return null;

  const row = (key: SkipKey, content: ReactNode) => (
    <li key={String(key)}>
      <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ink-2">
        <input
          type="checkbox"
          checked={!skip.has(key)}
          onChange={() => onToggle(key)}
          className="mt-0.5 size-4 shrink-0 accent-[var(--accent)] print:hidden"
        />
        <span className={`min-w-0 ${skip.has(key) ? 'text-ink-3 line-through print:hidden' : ''}`}>{content}</span>
      </label>
    </li>
  );

  const item = (i: ReportNextItem) =>
    row(
      i.demandId,
      <>
        <strong className="font-semibold text-ink">{i.label}</strong>
        {i.category !== 'ciclo' && <span className="text-xs text-ink-3"> {DEMAND_CATEGORY_LABEL[i.category]}</span>}
        {i.detail && <span> — {i.detail}</span>}
      </>,
    );

  return (
    <section className="card rise p-5 sm:p-6" aria-label="O que será feito">
      <SectionTitle title={nextTitle(next.date, todayISO())} />
      <ul className="mt-4 space-y-2.5">
        {next.cycles.map(item)}
        {next.tasks.map(item)}
        {next.queued > 0 && row('fila', <>Na fila: {plural(next.queued, 'tarefa', 'tarefas')}</>)}
      </ul>
    </section>
  );
}
