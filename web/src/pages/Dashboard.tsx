import { useId, useState } from 'react';
import { Link } from 'react-router';
import { formatDuration, WORKDAYS_PER_CYCLE, type CycleSummary } from '@acomp/shared';
import { useCycle, useDemands, useOverview, useTimeline } from '../api/client';
import { toneStyle, type DayTone } from '../components/Badges';
import { CycleNav } from '../components/CycleNav';
import { CyclesChart } from '../components/CyclesChart';
import { DailyChart } from '../components/DailyChart';
import { DayBreakdownChart } from '../components/DayBreakdownChart';
import { GoalPopover } from '../components/GoalSelector';
import { InfoHint } from '../components/InfoHint';
import { PageHeader } from '../components/PageHeader';
import { ArrowRight, CheckIcon, HourglassIcon, PlusIcon, TrendUpIcon } from '../components/icons';
import { ProgressRing } from '../components/ProgressRing';
import { Segmented } from '../components/Segmented';
import { ErrorState, Skeleton } from '../components/States';
import { TasksOverview } from '../components/TasksOverview';
import { useRefDate, withDate } from '../hooks';

type View = 'semana' | 'distribuicao' | 'tarefas' | 'demandas';

/** As visões do painel: o usuário vê uma de cada vez, a que escolher. */
const VIEWS: { value: View; label: string }[] = [
  { value: 'semana', label: 'Dia útil' },
  { value: 'distribuicao', label: 'Distribuição' },
  { value: 'tarefas', label: 'Tarefas' },
  { value: 'demandas', label: 'Ciclos' },
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
      <strong className="font-semibold text-ink">Dia útil:</strong> horas apontadas, meta semanal, total realizado e dias
      conformes.
    </span>
    <span className="mt-1.5 block">
      <strong className="font-semibold text-ink">Distribuição:</strong> quais demandas ocuparam mais tempo em um dia.
    </span>
    <span className="mt-1.5 block">
      <strong className="font-semibold text-ink">Tarefas:</strong> concluídas no ciclo, na fila e em andamento.
    </span>
    <span className="mt-1.5 block">
      <strong className="font-semibold text-ink">Ciclos:</strong> horas apontadas, prazo e última atualização de cada ciclo aberto.
    </span>
  </>
);

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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Segmented label="Métricas do painel" value={view} onChange={choose} options={VIEWS} stretch />
        <CycleNav date={date} onChange={setDate} />
      </div>

      <div id="painel-visao" role="tabpanel" aria-label={VIEWS.find((v) => v.value === view)!.label} className="min-w-0">
        {view === 'tarefas' ? (
          <TasksView date={date} />
        ) : view === 'demandas' ? (
          <CyclesView date={date} />
        ) : cycle.isPending ? (
          <Skeleton className="h-[34rem]" />
        ) : cycle.isError ? (
          <ErrorState message={cycle.error.message} onRetry={() => cycle.refetch()} />
        ) : view === 'semana' ? (
          <WeekView summary={cycle.data} date={date} />
        ) : (
          // A chave reinicia o dia escolhido ao trocar de ciclo.
          <DayBreakdownChart key={cycle.data.start} summary={cycle.data} />
        )}
      </div>
    </div>
  );
}

function TasksView({ date }: { date: string }) {
  const overview = useOverview(date);
  if (overview.isPending) return <Skeleton className="h-96" />;
  if (overview.isError) return <ErrorState message={overview.error.message} onRetry={() => overview.refetch()} />;
  return <TasksOverview tasks={overview.data.tasks} />;
}

function CyclesView({ date }: { date: string }) {
  const demands = useDemands('abertas');
  const overview = useOverview(date);
  const timeline = useTimeline();
  if (demands.isPending || overview.isPending || timeline.isPending) return <Skeleton className="h-96" />;
  if (demands.isError) return <ErrorState message={demands.error.message} onRetry={() => demands.refetch()} />;
  if (overview.isError) return <ErrorState message={overview.error.message} onRetry={() => overview.refetch()} />;
  if (timeline.isError) return <ErrorState message={timeline.error.message} onRetry={() => timeline.refetch()} />;
  return <CyclesChart demands={demands.data} progress={overview.data.cycles} timeline={timeline.data} />;
}

/** Situação da semana em um selo curto (ícone + texto; a cor acompanha, nunca é a única pista). */
function weekStatus(week: CycleSummary['week']) {
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

/** Dia útil: faixa de indicadores (só número e rótulo) e, embaixo, o gráfico em destaque. */
function WeekView({ summary, date }: { summary: CycleSummary; date: string }) {
  const { week, days, dailyGoal } = summary;
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
          <GoalPopover date={date} dailyGoal={dailyGoal} weekGoal={week.goal} />
          <FulfilledStat />
        </dl>

        <span className="absolute top-0 right-0">
          <InfoHint label="Sobre estes números">
            <KpiHint dailyGoal={dailyGoal} />
          </InfoHint>
        </span>
      </div>

      <div className="mt-6 border-t border-line pt-5">
        {/* Título à esquerda, dias conformes no meio e o link à direita (no celular, o do meio desce). */}
        <div className="grid grid-cols-2 items-center gap-x-4 gap-y-3 sm:grid-cols-[1fr_auto_1fr]">
          <div className="flex items-center gap-1.5">
            <h2 className="text-sm font-semibold text-ink">Horas por dia útil</h2>
            <InfoHint label="Sobre horas por dia útil">
              <ChartHint />
            </InfoHint>
          </div>
          <p className="tabular order-last col-span-2 text-center text-sm text-ink-2 sm:order-none sm:col-span-1">
            Dias conformes{' '}
            <strong className="font-semibold text-ink">
              {week.conformDays}/{WORKDAYS_PER_CYCLE}
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
          <DailyChart days={days} goal={dailyGoal} />
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
function KpiHint({ dailyGoal }: { dailyGoal: number }) {
  const term = 'font-semibold text-ink';
  return (
    <>
      <span className="block">
        <strong className={term}>Preenchido:</strong> total realizado ÷ meta semanal, arredondado para baixo; 100% só
        com a semana completa.
      </span>
      <span className="mt-1.5 block">
        <strong className={term}>Total realizado:</strong> soma dos apontamentos da semana; horários sobrepostos
        contam uma vez.
      </span>
      <span className="mt-1.5 block">
        <strong className={term}>Meta semanal:</strong> {WORKDAYS_PER_CYCLE} dias úteis × {formatDuration(dailyGoal)}.
        Toque no valor para mudar a meta diária.
      </span>
      <span className="mt-1.5 block">
        <strong className={term}>Demandas cumpridas:</strong> chamados, treinamentos e ciclos concluídos, desde o início.
        Reuniões não têm status e não entram.
      </span>
    </>
  );
}

/** Legenda do gráfico por dia útil: fica no ⓘ, não na tela. */
function ChartHint() {
  return (
    <>
      <span className="block">Clique em um dia para registrar ou revisar os apontamentos dele.</span>
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
