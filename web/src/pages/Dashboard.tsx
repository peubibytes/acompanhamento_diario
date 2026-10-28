import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { formatDuration, WORKDAYS_PER_CYCLE, type CycleSummary } from '@acomp/shared';
import { useCycle, useDemands } from '../api/client';
import { dayStyle, toneStyle, type DayTone } from '../components/Badges';
import { CycleNav } from '../components/CycleNav';
import { DailyChart } from '../components/DailyChart';
import { DayBreakdownChart } from '../components/DayBreakdownChart';
import { DemandsChart } from '../components/DemandsChart';
import { GoalSelector } from '../components/GoalSelector';
import { BarChartIcon, ChevronDown, PieIcon, PlusIcon, TargetIcon } from '../components/icons';
import { ProgressRing } from '../components/ProgressRing';
import { ErrorState, Skeleton } from '../components/States';
import { useRefDate, withDate } from '../hooks';

type View = 'semana' | 'distribuicao' | 'demandas';

/** As visões do painel: o usuário vê uma de cada vez, a que escolher. */
const VIEWS: { id: View; label: string; short: string; description: string; icon: ReactNode }[] = [
  {
    id: 'semana',
    label: 'Acompanhamento por dia útil',
    short: 'Dia útil',
    description: 'Horas apontadas, meta semanal, total realizado e dias conformes',
    icon: <BarChartIcon size={18} />,
  },
  {
    id: 'distribuicao',
    label: 'Distribuição do dia',
    short: 'Distribuição',
    description: 'Quais demandas ocuparam mais tempo em um dia',
    icon: <PieIcon size={18} />,
  },
  {
    id: 'demandas',
    label: 'Demandas em andamento',
    short: 'Demandas',
    description: 'Horas apontadas × meta de cada demanda ativa',
    icon: <TargetIcon size={18} />,
  },
];

// A visão escolhida é uma preferência local: lembrada entre visitas, sem ir ao servidor.
const VIEW_KEY = 'painel:visao';

function storedView(): View {
  try {
    const saved = localStorage.getItem(VIEW_KEY);
    if (VIEWS.some((v) => v.id === saved)) return saved as View;
  } catch {
    // Armazenamento indisponível: começa pela visão padrão.
  }
  return 'semana';
}

export function Dashboard() {
  const [date, setDate] = useRefDate();
  const cycle = useCycle(date);
  const [view, setView] = useState<View>(storedView);

  const choose = (next: View) => {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Sem armazenamento, a escolha vale só nesta sessão.
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">Painel</h1>
          <p className="mt-1 text-sm text-ink-2">Escolha o que analisar; o resto fica fora do caminho.</p>
        </div>
        <Link
          to={withDate('/atividades', date)}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent shadow-sm transition hover:bg-accent-hover"
        >
          <PlusIcon size={18} /> Registrar atividades
        </Link>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[14rem_minmax(0,1fr)] xl:grid-cols-[16rem_minmax(0,1fr)]">
        <MetricsNav view={view} onChange={choose} />

        <div id="painel-visao" role="tabpanel" aria-label={VIEWS.find((v) => v.id === view)!.label} className="min-w-0 space-y-5">
          {view === 'demandas' ? (
            <DemandsView />
          ) : (
            <>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CycleNav date={date} onChange={setDate} />
                {view === 'semana' && cycle.data && <GoalSelector date={date} dailyGoal={cycle.data.dailyGoal} />}
              </div>
              {cycle.isPending ? (
                <Skeleton className="h-96" />
              ) : cycle.isError ? (
                <ErrorState message={cycle.error.message} onRetry={() => cycle.refetch()} />
              ) : view === 'semana' ? (
                <WeekView summary={cycle.data} date={date} />
              ) : (
                // A chave reinicia o dia escolhido ao trocar de ciclo.
                <DayBreakdownChart key={cycle.data.start} summary={cycle.data} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Coluna de métricas (desktop) ou controle segmentado (celular): uma visão por vez. */
function MetricsNav({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  return (
    <>
      <nav className="card hidden p-2 lg:sticky lg:top-24 lg:block" aria-label="Métricas do painel">
        <p className="px-3 pt-2 pb-2 text-[11px] font-semibold tracking-wider text-ink-3 uppercase">Métricas</p>
        <div role="tablist" aria-orientation="vertical" className="space-y-1">
          {VIEWS.map((v) => {
            const on = v.id === view;
            return (
              <button
                key={v.id}
                role="tab"
                aria-selected={on}
                aria-controls="painel-visao"
                onClick={() => onChange(v.id)}
                className={`relative flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                  on ? 'bg-accent-soft' : 'hover:bg-surface-2'
                }`}
              >
                {on && <span className="absolute inset-y-2 left-0 w-1 rounded-full bg-accent" aria-hidden="true" />}
                <span className={`mt-0.5 shrink-0 ${on ? 'text-accent' : 'text-ink-3'}`}>{v.icon}</span>
                <span className="min-w-0">
                  <span className={`block text-sm font-semibold ${on ? 'text-accent' : 'text-ink'}`}>{v.label}</span>
                  <span className="mt-0.5 block text-xs leading-snug text-ink-3">{v.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      <div
        role="tablist"
        aria-label="Métricas do painel"
        className="grid grid-cols-3 gap-1 rounded-2xl bg-surface-2 p-1 lg:hidden"
      >
        {VIEWS.map((v) => {
          const on = v.id === view;
          return (
            <button
              key={v.id}
              role="tab"
              aria-selected={on}
              aria-controls="painel-visao"
              onClick={() => onChange(v.id)}
              className={`flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-xs font-medium transition ${
                on ? 'bg-surface text-accent shadow-sm' : 'text-ink-2 hover:text-ink'
              }`}
            >
              {v.icon}
              {v.short}
            </button>
          );
        })}
      </div>
    </>
  );
}

function DemandsView() {
  const demands = useDemands('abertas');
  if (demands.isPending) return <Skeleton className="h-96" />;
  if (demands.isError) return <ErrorState message={demands.error.message} onRetry={() => demands.refetch()} />;
  return <DemandsChart demands={demands.data} />;
}

/** Acompanhamento por dia útil: as métricas da semana, que se leem melhor juntas. */
function WeekView({ summary, date }: { summary: CycleSummary; date: string }) {
  const { week, days, dailyGoal } = summary;
  const missing = Math.max(0, week.goal - week.total);

  return (
    <>
      {/* Um cartão só: % de horas apontadas em destaque e os indicadores da semana ao lado. */}
      <section className="card rise flex flex-col items-center gap-6 p-5 sm:p-6 md:flex-row md:items-stretch">
        <div className="flex shrink-0 flex-col items-center text-center md:w-56 md:justify-center">
          <ProgressRing percent={week.fillPercent} exceeded={week.diff > 0} size={168} />
          <p className="mt-3 text-sm font-semibold text-ink">Horas apontadas</p>
          <p className={`mt-0.5 text-xs ${week.diff > 0 ? 'font-medium text-critical-text' : 'text-ink-2'}`}>
            {week.diff > 0
              ? `Excedeu a meta semanal em ${formatDuration(week.diff)}. Reajuste os apontamentos.`
              : week.diff === 0
                ? 'Meta semanal atingida. Excelente!'
                : `Faltam ${formatDuration(missing)} para fechar a semana.`}
          </p>
        </div>

        <div className="grid w-full flex-1 grid-cols-1 divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0 md:border-l md:border-line">
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
      </section>

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

      <div className="flex justify-center pt-1 pb-4">
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

/** Indicador dentro do cartão da semana (colunas separadas por linhas finas). */
function Kpi({ label, value, delay, children }: { label: string; value: ReactNode; delay: number; children: ReactNode }) {
  return (
    <div className="rise flex flex-col px-1 py-4 sm:px-5 sm:py-1" style={{ animationDelay: `${delay}ms` }}>
      <p className="text-xs font-semibold tracking-wider text-ink-3 uppercase">{label}</p>
      <p className="tabular mt-2 text-3xl font-bold tracking-tight text-ink">{value}</p>
      <div className="mt-auto pt-3 text-xs text-ink-2">{children}</div>
    </div>
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
