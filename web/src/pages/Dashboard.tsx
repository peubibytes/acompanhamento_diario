import { useState } from 'react';
import { Link } from 'react-router';
import { formatDuration, WORKDAYS_PER_CYCLE, type CycleSummary } from '@acomp/shared';
import { useCycle, useDemands } from '../api/client';
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
import { SectionTitle } from '../components/SectionTitle';
import { ErrorState, Skeleton } from '../components/States';
import { useRefDate, withDate } from '../hooks';

type View = 'semana' | 'distribuicao' | 'demandas';

/** As visões do painel: o usuário vê uma de cada vez, a que escolher. */
const VIEWS: { value: View; label: string }[] = [
  { value: 'semana', label: 'Dia útil' },
  { value: 'distribuicao', label: 'Distribuição' },
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
      <strong className="font-semibold text-ink">Ciclos:</strong> horas apontadas e prazo de cada ciclo aberto.
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
        {view !== 'demandas' && <CycleNav date={date} onChange={setDate} />}
      </div>

      <div id="painel-visao" role="tabpanel" aria-label={VIEWS.find((v) => v.value === view)!.label} className="min-w-0">
        {view === 'demandas' ? (
          <CyclesView />
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

function CyclesView() {
  const demands = useDemands('abertas');
  if (demands.isPending) return <Skeleton className="h-96" />;
  if (demands.isError) return <ErrorState message={demands.error.message} onRetry={() => demands.refetch()} />;
  return <CyclesChart demands={demands.data} />;
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
          <div>
            <dt className={LABEL}>Dias conformes</dt>
            <dd className={NUMBER}>
              {week.conformDays}
              <span className="text-base font-semibold text-ink-3">/{WORKDAYS_PER_CYCLE}</span>
            </dd>
          </div>
        </dl>

        <span className="absolute top-0 right-0">
          <InfoHint label="Sobre estes números">
            <KpiHint dailyGoal={dailyGoal} />
          </InfoHint>
        </span>
      </div>

      <div className="mt-6 border-t border-line pt-5">
        <SectionTitle
          title="Horas por dia útil"
          hint={<ChartHint />}
          aside={
            <Link
              to={withDate('/detalhes', date)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-2 transition hover:text-ink"
            >
              Detalhes <ArrowRight size={14} />
            </Link>
          }
        />
        <div className="mt-8">
          <DailyChart days={days} goal={dailyGoal} />
        </div>
      </div>
    </section>
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
        <strong className={term}>Dias conformes:</strong> dias com exatamente a meta diária.
      </span>
    </>
  );
}

/** Legenda do gráfico por dia útil: fica no ⓘ, não na tela. */
function ChartHint() {
  return (
    <>
      <span className="block">Clique em um dia para registrar ou revisar os apontamentos dele.</span>
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
