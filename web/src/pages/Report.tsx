import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  CONFORMITY_LABEL,
  DEMAND_CATEGORY_LABEL,
  DEMAND_EVENT_LABEL,
  dailyReportMarkdown,
  formatDayMonth,
  formatDuration,
  formatHM,
  isValidISODate,
  isWorkday,
  nextWorkday,
  previousWorkday,
  todayISO,
  WEEKDAY_SHORT,
  weekdayOf,
  type DailyReport,
  type ISODate,
} from '@acomp/shared';
import { useDailyReport } from '../api/client';
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
    <span className="block">Resumo de um dia para a daily ou o 1:1. Por padrão, o dia útil anterior.</span>
    <span className="mt-1.5 block">
      <strong className="font-semibold text-ink">O que foi feito:</strong> horas, apontamentos, mudanças de status e
      eventos do dia.
    </span>
    <span className="mt-1.5 block">
      <strong className="font-semibold text-ink">Impedimentos:</strong> abertos no dia e os resolvidos nele.
    </span>
    <span className="mt-1.5 block">
      <strong className="font-semibold text-ink">O que será feito:</strong> tarefas em andamento, ciclos abertos e a
      fila. Desmarque o que não quiser levar. Nada disso é gravado.
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

  const report = useDailyReport(date);

  return (
    <div className="space-y-section">
      {/* A chave reinicia os itens desmarcados ao trocar de dia. */}
      <ReportBody key={date} date={date} setDate={setDate} report={report} />
    </div>
  );
}

function ReportBody({
  date,
  setDate,
  report,
}: {
  date: ISODate;
  setDate: (d: ISODate) => void;
  report: ReturnType<typeof useDailyReport>;
}) {
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

const LABEL = 'text-2xs font-semibold tracking-wider text-ink-3 uppercase';
const NUMBER = 'tabular mt-1 block text-2xl font-semibold tracking-tight text-ink';

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <dt className={LABEL}>{label}</dt>
      <dd className={NUMBER}>{value}</dd>
      {note && <dd className="tabular text-xs text-ink-3">{note}</dd>}
    </div>
  );
}

function DoneSection({ report }: { report: DailyReport }) {
  const d = report.done;
  const workedTotal = Object.values(d.worked).reduce((sum, n) => sum + n, 0);

  return (
    <section className="card rise p-5 sm:p-6" aria-label="O que foi feito">
      <SectionTitle title="O que foi feito" />
      <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat
          label="Apontadas"
          value={formatDuration(d.minutes)}
          note={`meta ${formatDuration(d.goal)} · ${CONFORMITY_LABEL[d.conformity]}`}
        />
        <Stat label="Apontamentos" value={String(d.activityCount)} />
        <Stat
          label="Demandas"
          value={String(workedTotal)}
          note={
            Object.entries(d.worked)
              .map(([c, n]) => `${n} ${DEMAND_CATEGORY_LABEL[c as keyof typeof d.worked].toLowerCase()}`)
              .join(' · ') || undefined
          }
        />
        <Stat label="Tarefas concluídas" value={String(d.completedTasks)} />
      </dl>

      {d.items.length === 0 ? (
        <p className="mt-6 text-sm text-ink-2">
          Nenhum apontamento neste dia.{' '}
          <Link to={`/apontamentos?data=${report.date}`} className="font-semibold text-accent hover:underline">
            Registrar apontamentos
          </Link>
        </p>
      ) : (
        <ul className="mt-6 space-y-5 border-t border-line pt-5">
          {d.items.map((item) => (
            <li key={`${item.demandId}:${item.label}`}>
              <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <strong className="text-sm font-semibold text-ink">{item.label}</strong>
                {item.category && <span className="text-xs text-ink-3">{DEMAND_CATEGORY_LABEL[item.category]}</span>}
                {item.minutes > 0 && <span className="tabular text-sm font-semibold text-ink-2">{formatDuration(item.minutes)}</span>}
                {item.statusChanges.map((s) => (
                  <span key={s} className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">
                    {s}
                  </span>
                ))}
              </p>
              <ul className="mt-1.5 space-y-1 text-sm text-ink-2">
                {item.entries.map((e) => (
                  <li key={`${e.startMinute}-${e.endMinute}`} className="flex gap-3">
                    <span className="tabular w-24 shrink-0 text-ink-3">
                      {formatHM(e.startMinute)}–{formatHM(e.endMinute)}
                    </span>
                    <span className="min-w-0">
                      {e.description || '—'}
                      {e.notes && <span className="text-ink-3"> ↳ {e.notes}</span>}
                    </span>
                  </li>
                ))}
                {item.events.map((e) => (
                  <li key={`${e.kind}:${e.text}`} className="flex gap-3">
                    <span className="w-24 shrink-0 text-ink-3">{DEMAND_EVENT_LABEL[e.kind]}</span>
                    <span className="min-w-0">{e.text}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function BlockersSection({ report }: { report: DailyReport }) {
  const b = report.blockers;

  return (
    <section className="card rise p-5 sm:p-6" aria-label="Impedimentos">
      <SectionTitle title="Impedimentos" />
      {b.items.length === 0 ? (
        <p className="mt-4 text-sm text-ink-2">Sem impedimentos.</p>
      ) : (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Abertos" value={String(b.open)} />
            <Stat label="Novos" value={String(b.opened)} />
            <Stat label="Resolvidos" value={String(b.resolved)} />
            <Stat label="Maior espera" value={b.open > 0 ? plural(b.longestWait, 'dia útil', 'dias úteis') : '—'} />
          </dl>
          <ul className="mt-6 space-y-3 border-t border-line pt-5 text-sm">
            {b.items.map((i, index) => (
              <li key={index} className="flex gap-2.5">
                <span className={`mt-0.5 shrink-0 ${i.resolvedAt ? 'text-good-text' : 'text-warning-text'}`}>
                  <HourglassIcon size={15} />
                </span>
                <span className="min-w-0 text-ink-2">
                  <strong className="font-semibold text-ink">{i.label}</strong> — {i.owner}{' '}
                  {i.resolvedAt ? `resolvido em ${formatDayMonth(i.resolvedAt)}` : `desde ${formatDayMonth(i.since)}`} (
                  {plural(i.waitingWorkdays, 'dia útil', 'dias úteis')})
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
  // Sem demanda aberta, a seção nem aparece (o relatório fica só com o que foi feito).
  if (!next) return null;
  const when = next.date === todayISO() ? `hoje (${dayLabel(next.date)})` : `em ${dayLabel(next.date)}`;

  const row = (key: SkipKey, content: React.ReactNode) => (
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

  return (
    <section className="card rise p-5 sm:p-6" aria-label="O que será feito">
      <SectionTitle title={`O que será feito ${when}`} />
      <ul className="mt-4 space-y-2.5">
        {next.items.map((i) =>
          row(
            i.demandId,
            <>
              <Link to={`/demandas#demanda-${i.demandId}`} className="font-semibold text-ink hover:underline">
                {i.label}
              </Link>{' '}
              <span className="text-xs text-ink-3">{DEMAND_CATEGORY_LABEL[i.category]}</span>
              {i.detail && <span> — {i.detail}</span>}
            </>,
          ),
        )}
        {next.queued > 0 && row('fila', <>Na fila: {plural(next.queued, 'tarefa', 'tarefas')}</>)}
      </ul>
    </section>
  );
}
