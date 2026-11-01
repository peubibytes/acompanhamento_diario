import { useId, useState } from 'react';
import { Link } from 'react-router';
import {
  anchorDate,
  formatDuration,
  getPeriod,
  todayISO,
  type DayMetrics,
  type PeriodScale,
  type PeriodSummary,
  type WeekMetrics,
} from '@acomp/shared';
import { useCycle, useDemands, useOverview, usePeriod, useTimeline, useYield } from '../api/client';
import { toneStyle, type DayTone } from '../components/Badges';
import { CyclesChart } from '../components/CyclesChart';
import { CycleYieldChart } from '../components/CycleYieldChart';
import { DailyChart } from '../components/DailyChart';
import { DayBreakdownChart } from '../components/DayBreakdownChart';
import { FamilySplitChart } from '../components/FamilySplitChart';
import { GoalPopover } from '../components/GoalSelector';
import { InfoHint } from '../components/InfoHint';
import { PageHeader } from '../components/PageHeader';
import { PeriodNav } from '../components/PeriodNav';
import { ArrowRight, CheckIcon, HourglassIcon, PlusIcon, TrendUpIcon } from '../components/icons';
import { ProgressRing } from '../components/ProgressRing';
import { Segmented } from '../components/Segmented';
import { ErrorState, Skeleton } from '../components/States';
import { TasksOverview } from '../components/TasksOverview';
import { usePeriodScale, useRefDate, withDate } from '../hooks';

type View = 'semana' | 'distribuicao' | 'tarefas' | 'demandas' | 'rendimento';

/** As visões do painel: o usuário vê uma de cada vez, a que escolher. */
const VIEWS: { value: View; label: string }[] = [
  { value: 'semana', label: 'Dia útil' },
  { value: 'distribuicao', label: 'Distribuição' },
  { value: 'tarefas', label: 'Tarefas' },
  { value: 'demandas', label: 'Ciclos' },
  { value: 'rendimento', label: 'Rendimento' },
];

const SCALES: { value: PeriodScale; label: string }[] = [
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mês' },
];

// A visão escolhida é uma preferência local: lembrada entre visitas, sem ir ao servidor.
const VIEW_KEY = 'painel:visao';

function storedView(): View {
  try {
    const saved = localStorage.getItem(VIEW_KEY);
    if (VIEWS.some((v) => v.value === saved)) return saved as View;
  } catch {
    // Armazenamento indisponível: começa pela visão padrão.
  }
  return 'semana';
}

const PAGE_HINT = (
  <>
    <span className="block">
      <strong className="font-semibold text-ink">Dia útil:</strong> horas apontadas, meta, total realizado e dias
      conformes do período. A escala (Semana ou Mês) vale para todas as visões.
    </span>
    <span className="mt-1.5 block">
      <strong className="font-semibold text-ink">Distribuição:</strong> quais demandas ocuparam mais tempo em um dia (na
      semana) ou no mês inteiro.
    </span>
    <span className="mt-1.5 block">
      <strong className="font-semibold text-ink">Tarefas:</strong> concluídas no período, na fila e em andamento.
    </span>
    <span className="mt-1.5 block">
      <strong className="font-semibold text-ink">Ciclos:</strong> horas apontadas, prazo e última atualização de cada ciclo aberto.
    </span>
    <span className="mt-1.5 block">
      <strong className="font-semibold text-ink">Rendimento:</strong> quanto do tempo foi em Tarefas e em Ciclos e como
      cada ciclo rendeu em relação ao período anterior.
    </span>
  </>
);

export function Dashboard() {
  const [date, setDate] = useRefDate();
  const [scale, setScale] = usePeriodScale();
  const period = getPeriod(date, scale);
  const summary = usePeriod(date, scale);
  // A meta diária é do ciclo de apontamento (sexta → quinta): na semana, o da data; no mês, o de hoje
  // (ou, num mês passado ou futuro, o do último ou do primeiro dia útil).
  const goalDate = scale === 'week' ? date : anchorDate(period, todayISO());
  const goalCycle = useCycle(goalDate);
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
    <div className="space-y-section">
      <PageHeader
        title="Painel"
        hint={PAGE_HINT}
        action={
          <Link to={withDate('/apontamentos', date)} className="btn-primary">
            <PlusIcon size={18} /> Registrar apontamentos
          </Link>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex w-full flex-col items-start gap-3 sm:w-auto sm:flex-row sm:items-center">
          <Segmented size="sm" label="Escala do período" value={scale} onChange={setScale} options={SCALES} />
          <Segmented label="Métricas do painel" value={view} onChange={choose} options={VIEWS} stretch dense />
        </div>
        <PeriodNav date={date} scale={scale} onChange={setDate} />
      </div>

      <div id="painel-visao" role="tabpanel" aria-label={VIEWS.find((v) => v.value === view)!.label} className="min-w-0">
        {view === 'tarefas' ? (
          <TasksView date={date} scale={scale} />
        ) : view === 'demandas' ? (
          <CyclesView date={date} scale={scale} />
        ) : view === 'rendimento' ? (
          <YieldView date={date} scale={scale} />
        ) : summary.isPending || goalCycle.isPending ? (
          <Skeleton className="h-[34rem]" />
        ) : summary.isError || goalCycle.isError ? (
          <ErrorState
            message={(summary.error ?? goalCycle.error)!.message}
            onRetry={() => {
              void summary.refetch();
              void goalCycle.refetch();
            }}
          />
        ) : view === 'semana' ? (
          <DayView summary={summary.data} date={date} goalDate={goalDate} dailyGoal={goalCycle.data.dailyGoal} />
        ) : (
          // A chave reinicia o dia escolhido ao trocar de período.
          <DayBreakdownChart key={`${scale}:${summary.data.start}`} days={summary.data.days} period={period} />
        )}
      </div>
    </div>
  );
}

function TasksView({ date, scale }: { date: string; scale: PeriodScale }) {
  const overview = useOverview(date, scale);
  if (overview.isPending) return <Skeleton className="h-96" />;
  if (overview.isError) return <ErrorState message={overview.error.message} onRetry={() => overview.refetch()} />;
  return <TasksOverview tasks={overview.data.tasks} />;
}

function YieldView({ date, scale }: { date: string; scale: PeriodScale }) {
  const report = useYield(date, scale);
  if (report.isPending) return <Skeleton className="h-[48rem]" />;
  if (report.isError) return <ErrorState message={report.error.message} onRetry={() => report.refetch()} />;
  return (
    <section className="card rise p-5 sm:p-6">
      <FamilySplitChart split={report.data.split} scale={scale} />
      <div className="mt-6 border-t border-line pt-5">
        <CycleYieldChart cycles={report.data.cycles} />
      </div>
    </section>
  );
}

function CyclesView({ date, scale }: { date: string; scale: PeriodScale }) {
  const demands = useDemands('abertas');
  const overview = useOverview(date, scale);
  const timeline = useTimeline();
  if (demands.isPending || overview.isPending || timeline.isPending) return <Skeleton className="h-96" />;
  if (demands.isError) return <ErrorState message={demands.error.message} onRetry={() => demands.refetch()} />;
  if (overview.isError) return <ErrorState message={overview.error.message} onRetry={() => overview.refetch()} />;
  if (timeline.isError) return <ErrorState message={timeline.error.message} onRetry={() => timeline.refetch()} />;
  return <CyclesChart demands={demands.data} progress={overview.data.cycles} timeline={timeline.data} />;
}

/** Situação do período em um selo curto (ícone + texto; a cor acompanha, nunca é a única pista). */
function weekStatus(week: WeekMetrics) {
  if (week.diff > 0) return { text: `Excedeu ${formatDuration(week.diff)}`, style: toneStyle.acima.badge, icon: <TrendUpIcon size={13} /> };
  if (week.diff === 0) return { text: 'Meta atingida', style: toneStyle.conforme.badge, icon: <CheckIcon size={13} /> };
  return {
    text: `Faltam ${formatDuration(week.goal - week.total)}`,
    style: toneStyle.pendente.badge,
    icon: <HourglassIcon size={13} />,
  };
}

const LABEL = 'text-2xs font-semibold tracking-wider text-ink-3 uppercase';
const NUMBER = 'tabular mt-1 block text-2xl font-semibold tracking-tight text-ink sm:text-display sm:font-bold';

/** Meta diária mais comum entre os dias: a linha de meta do gráfico (no mês, os ciclos podem diferir). */
function commonGoal(days: DayMetrics[]): number {
  const counts = new Map<number, number>();
  for (const d of days) counts.set(d.goal, (counts.get(d.goal) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? 0;
}

/**
 * Dia útil: faixa de indicadores (só número e rótulo) e, embaixo, o gráfico em destaque. `dailyGoal`
 * é a meta do ciclo de apontamento de `goalDate`, a que o popover edita.
 */
function DayView({
  summary,
  date,
  goalDate,
  dailyGoal,
}: {
  summary: PeriodSummary;
  date: string;
  goalDate: string;
  dailyGoal: number;
}) {
  const { totals: week, days, scale } = summary;
  const month = scale === 'month';
  const status = weekStatus(week);

  return (
    <section className="card rise p-5 sm:p-6">
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-8">
        <div className="flex items-center gap-4">
          <ProgressRing percent={week.fillPercent} exceeded={week.diff > 0} size={72} />
          <div className="min-w-0">
            <p className={LABEL}>Preenchido</p>
            <span className={`mt-1.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${status.style}`}>
              {status.icon}
              {status.text}
            </span>
          </div>
        </div>

        <dl className="grid flex-1 grid-cols-3 gap-4 sm:border-l sm:border-line sm:pr-8 sm:pl-8">
          <div>
            <dt className={LABEL}>Total realizado</dt>
            <dd className={NUMBER}>{formatDuration(week.total)}</dd>
          </div>
          <GoalPopover
            date={goalDate}
            dailyGoal={dailyGoal}
            weekGoal={week.goal}
            label={month ? 'Meta do período' : 'Meta semanal'}
          />
          <FulfilledStat />
        </dl>

        <span className="absolute top-0 right-0">
          <InfoHint label="Sobre estes números">
            <KpiHint scale={scale} dailyGoal={dailyGoal} dayCount={days.length} />
          </InfoHint>
        </span>
      </div>

      <div className="mt-6 border-t border-line pt-5">
        {/* Título à esquerda, dias conformes no meio e o link à direita (no celular, o do meio desce). */}
        <div className="grid grid-cols-2 items-center gap-x-4 gap-y-3 sm:grid-cols-[1fr_auto_1fr]">
          <div className="flex items-center gap-1.5">
            <h2 className="text-sm font-semibold text-ink">Horas por dia útil</h2>
            <InfoHint label="Sobre horas por dia útil">
              <ChartHint scale={scale} />
            </InfoHint>
          </div>
          <p className="tabular order-last col-span-2 text-center text-sm text-ink-2 sm:order-none sm:col-span-1">
            Dias conformes{' '}
            <strong className="font-semibold text-ink">
              {week.conformDays}/{days.length}
            </strong>
          </p>
          <Link
            to={withDate('/detalhes', date)}
            className="inline-flex items-center gap-1.5 justify-self-end text-sm font-medium text-ink-2 transition hover:text-ink"
          >
            Detalhes <ArrowRight size={14} />
          </Link>
        </div>
        <div className="mt-8">
          <DailyChart days={days} goal={commonGoal(days)} scale={scale} />
        </div>
      </div>
    </section>
  );
}

/** Demandas concluídas (chamados, treinamentos e ciclos); o cartão suspenso separa tarefas de ciclos. */
function FulfilledStat() {
  const demands = useDemands();
  const done = (demands.data ?? []).filter((d) => d.category !== 'reuniao' && d.status === 'concluido');
  const cycles = done.filter((d) => d.category === 'ciclo').length;
  const tasks = done.length - cycles;
  const id = useId();

  return (
    <div className="group relative" tabIndex={0} aria-describedby={id}>
      <dt className={LABEL}>Demandas cumpridas</dt>
      <dd className={NUMBER}>{demands.data ? done.length : '—'}</dd>
      <div
        id={id}
        role="tooltip"
        className="tip-surface hint-in absolute top-full right-0 z-30 mt-2 hidden w-52 p-3 text-sm group-focus-within:block group-hover:block sm:right-auto sm:left-0"
      >
        <p className="flex items-baseline justify-between gap-4 text-ink-2">
          Tarefas concluídas <strong className="tabular font-semibold text-ink">{tasks}</strong>
        </p>
        <p className="mt-1.5 flex items-baseline justify-between gap-4 text-ink-2">
          Ciclos concluídos <strong className="tabular font-semibold text-ink">{cycles}</strong>
        </p>
      </div>
    </div>
  );
}

/** O que cada número da faixa significa: fica no ⓘ, não na tela. */
function KpiHint({ scale, dailyGoal, dayCount }: { scale: PeriodScale; dailyGoal: number; dayCount: number }) {
  const term = 'font-semibold text-ink';
  const month = scale === 'month';
  return (
    <>
      <span className="block">
        <strong className={term}>Preenchido:</strong> total realizado ÷ {month ? 'meta do período' : 'meta semanal'},
        arredondado para baixo; 100% só com {month ? 'o mês completo' : 'a semana completa'}.
      </span>
      <span className="mt-1.5 block">
        <strong className={term}>Total realizado:</strong> soma dos apontamentos {month ? 'do mês' : 'da semana'}; horários
        sobrepostos contam uma vez.
      </span>
      <span className="mt-1.5 block">
        {month ? (
          <>
            <strong className={term}>Meta do período:</strong> soma da meta diária de cada um dos {dayCount} dias úteis do
            mês (cada dia tem a meta do seu ciclo de apontamento, de sexta a quinta). Toque no valor para mudar a meta
            diária de hoje ({formatDuration(dailyGoal)}); ela vale para o ciclo de apontamento atual e os próximos.
          </>
        ) : (
          <>
            <strong className={term}>Meta semanal:</strong> {dayCount} dias úteis × {formatDuration(dailyGoal)}. Toque no
            valor para mudar a meta diária.
          </>
        )}
      </span>
      <span className="mt-1.5 block">
        <strong className={term}>Demandas cumpridas:</strong> chamados, treinamentos e ciclos concluídos, desde o início.
        Reuniões não têm status e não entram.
      </span>
    </>
  );
}

/** Legenda do gráfico por dia útil: fica no ⓘ, não na tela. */
function ChartHint({ scale }: { scale: PeriodScale }) {
  return (
    <>
      <span className="block">Clique em um dia para registrar ou revisar os apontamentos dele.</span>
      {scale === 'month' && (
        <span className="mt-1.5 block">
          Cada coluna é um dia útil (Seg–Sex). A linha é a meta diária mais comum do mês. Em telas estreitas o valor e o
          ícone saem das colunas: passe o mouse ou foque uma coluna para ver o dia.
        </span>
      )}
      <span className="mt-1.5 block">
        <strong className="font-semibold text-ink">Dias conformes:</strong> dias com exatamente a meta diária.
      </span>
      <span className="mt-2 grid gap-1.5">
        {(Object.keys(toneStyle) as DayTone[]).map((c) => (
          <span key={c} className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-sm" style={{ background: toneStyle[c].bar }} />
            <span className={`shrink-0 ${toneStyle[c].text}`}>{toneStyle[c].icon(12)}</span>
            {toneStyle[c].label}
          </span>
        ))}
      </span>
    </>
  );
}
