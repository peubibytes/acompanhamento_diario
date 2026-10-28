import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { formatDuration, WORKDAYS_PER_CYCLE, type CycleSummary } from '@acomp/shared';
import { useCycle, useDemands } from '../api/client';
import { dayStyle, toneStyle, type DayTone } from '../components/Badges';
import { CycleBanner } from '../components/CycleBanner';
import { CycleNav } from '../components/CycleNav';
import { DailyChart } from '../components/DailyChart';
import { DayBreakdownChart } from '../components/DayBreakdownChart';
import { DeadlineAlert } from '../components/DeadlineAlert';
import { DemandsChart } from '../components/DemandsChart';
import { GoalSelector } from '../components/GoalSelector';
import { IrregularAlert } from '../components/IrregularAlert';
import { ChevronDown, PlusIcon } from '../components/icons';
import { ProgressRing } from '../components/ProgressRing';
import { ErrorState, Skeleton } from '../components/States';
import { useRefDate, withDate } from '../hooks';

export function Dashboard() {
  const [date, setDate] = useRefDate();
  const cycle = useCycle(date);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">Painel da semana</h1>
          <p className="mt-1 text-sm text-ink-2">Preencha suas horas até quinta: a meta é 100%.</p>
        </div>
        <Link
          to={withDate('/atividades', date)}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent shadow-sm transition hover:bg-accent-hover"
        >
          <PlusIcon size={18} /> Registrar atividades
        </Link>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CycleNav date={date} onChange={setDate} />
        {cycle.data && <GoalSelector date={date} dailyGoal={cycle.data.dailyGoal} />}
      </div>

      {cycle.isPending ? (
        <DashboardSkeleton />
      ) : cycle.isError ? (
        <ErrorState message={cycle.error.message} onRetry={() => cycle.refetch()} />
      ) : (
        <DashboardContent summary={cycle.data} date={date} />
      )}
    </div>
  );
}

function DashboardContent({ summary, date }: { summary: CycleSummary; date: string }) {
  const { week, days, dailyGoal } = summary;
  const missing = Math.max(0, week.goal - week.total);
  const demands = useDemands('ativa');

  return (
    <>
      <IrregularAlert days={days} dailyGoal={dailyGoal} />
      {demands.data && <DeadlineAlert demands={demands.data} />}
      <CycleBanner summary={summary} />

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Destaque: % preenchido */}
        <section className="card rise flex flex-col items-center gap-6 p-6 sm:flex-row lg:col-span-2">
          <ProgressRing percent={week.fillPercent} exceeded={week.diff > 0} />
          <div className="text-center sm:text-left">
            <p className="text-sm font-medium text-ink-2">Horas apontadas</p>
            <p className="tabular mt-1 text-2xl font-bold text-ink">
              {formatDuration(week.total)}
              <span className="text-base font-medium text-ink-3"> / {formatDuration(week.goal)}</span>
            </p>
            <p className={`mt-3 text-sm ${week.diff > 0 ? 'font-medium text-critical-text' : 'text-ink-2'}`}>
              {week.diff > 0
                ? `Excedeu a meta semanal em ${formatDuration(week.diff)}. Reajuste os apontamentos.`
                : week.diff === 0
                  ? 'Meta semanal atingida. Excelente!'
                  : `Faltam ${formatDuration(missing)} para fechar a semana.`}
            </p>
          </div>
        </section>

        <div className="grid gap-4 sm:grid-cols-3 lg:col-span-3">
          <Kpi label="Meta semanal" value={formatDuration(week.goal)} delay={60}>
            {WORKDAYS_PER_CYCLE} dias × {formatDuration(dailyGoal)}
          </Kpi>
          <Kpi label="Total realizado" value={formatDuration(week.total)} delay={120}>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-grid">
              <div
                className={`h-full rounded-full transition-[width] duration-700 ${week.diff > 0 ? 'bg-critical' : 'bg-accent'}`}
                style={{ width: `${Math.min(week.fillPercent, 100)}%` }}
              />
            </div>
            <p className="mt-2">{week.diffLabel ? `${week.diffLabel} da meta` : 'Nenhuma hora ainda'}</p>
          </Kpi>
          <Kpi
            label="Dias conformes"
            value={
              <>
                {week.conformDays}
                <span className="text-lg font-semibold text-ink-3">/{WORKDAYS_PER_CYCLE}</span>
              </>
            }
            delay={180}
          >
            <div className="mt-1 flex gap-1.5">
              {days.map((d) => (
                <span
                  key={d.date}
                  title={`${d.weekdayShort}: ${dayStyle(d).label}`}
                  className={`grid h-7 flex-1 place-items-center rounded-md ${dayStyle(d).badge}`}
                >
                  {dayStyle(d).icon(13)}
                </span>
              ))}
            </div>
            <div className="mt-1 flex gap-1.5 text-center text-[10px] text-ink-3">
              {days.map((d) => (
                <span key={d.date} className="flex-1">
                  {d.weekdayShort}
                </span>
              ))}
            </div>
          </Kpi>
        </div>
      </div>

      <section className="card rise p-5 sm:p-6" style={{ animationDelay: '200ms' }}>
        <div className="mb-8 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-ink">Acompanhamento por dia útil</h2>
            <p className="text-sm text-ink-2">Toque em um dia para registrar ou revisar atividades.</p>
          </div>
          <Legend />
        </div>
        <DailyChart days={days} goal={dailyGoal} />
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        {/* A chave reinicia o dia escolhido ao trocar de ciclo. */}
        <DayBreakdownChart key={summary.start} summary={summary} />
        {demands.isPending ? (
          <Skeleton className="h-80" />
        ) : demands.isError ? (
          <ErrorState message={demands.error.message} onRetry={() => demands.refetch()} />
        ) : (
          <DemandsChart demands={demands.data} />
        )}
      </div>

      <div className="flex justify-center pt-2 pb-4">
        <Link
          to={withDate('/detalhes', date)}
          className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-5 py-2.5 text-sm font-semibold text-ink shadow-sm transition hover:bg-surface-2"
        >
          Mostrar mais <ChevronDown size={16} />
        </Link>
      </div>
    </>
  );
}

function Kpi({ label, value, delay, children }: { label: string; value: ReactNode; delay: number; children: ReactNode }) {
  return (
    <section className="card rise flex flex-col p-5" style={{ animationDelay: `${delay}ms` }}>
      <p className="text-xs font-semibold tracking-wider text-ink-3 uppercase">{label}</p>
      <p className="tabular mt-2 text-3xl font-bold tracking-tight text-ink">{value}</p>
      <div className="mt-auto pt-3 text-xs text-ink-2">{children}</div>
    </section>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-3 text-xs text-ink-2">
      {(Object.keys(toneStyle) as DayTone[]).map((c) => (
        <span key={c} className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: toneStyle[c].bar }} />
          {toneStyle[c].label}
        </span>
      ))}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-16" />
      <div className="grid gap-4 lg:grid-cols-5">
        <Skeleton className="h-56 lg:col-span-2" />
        <div className="grid gap-4 sm:grid-cols-3 lg:col-span-3">
          <Skeleton className="h-56" />
          <Skeleton className="h-56" />
          <Skeleton className="h-56" />
        </div>
      </div>
      <Skeleton className="h-80" />
    </div>
  );
}
