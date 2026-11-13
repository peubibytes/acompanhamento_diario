import { useState } from 'react';
import { Link } from 'react-router';
import { anchorDate, getPeriod, todayISO, type PeriodScale } from '@acomp/shared';
import { useCycle, usePeriod } from '../api/client';
import { DayBreakdownChart } from '../components/DayBreakdownChart';
import { PageHeader } from '../components/PageHeader';
import { PeriodNav } from '../components/PeriodNav';
import { PlusIcon } from '../components/icons';
import { Segmented } from '../components/Segmented';
import { ErrorState, Skeleton } from '../components/States';
import { usePeriodScale, useRefDate, withDate } from '../hooks';
import { CyclesView } from './dashboard/CyclesView';
import { DayView } from './dashboard/DayView';
import { YieldView } from './dashboard/YieldView';

type View = 'semana' | 'distribuicao' | 'demandas' | 'rendimento';

/** As visões do painel: o usuário vê uma de cada vez, a que escolher. */
const VIEWS: { value: View; label: string }[] = [
  { value: 'semana', label: 'Dia útil' },
  { value: 'distribuicao', label: 'Distribuição' },
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
      <strong className="font-semibold text-ink">Dia útil:</strong> o quadro de produção (planejado × realizado, com o
      sinal de cada dia) e a linha do turno. A escala (Semana ou Mês) vale para todas as visões.
    </span>
    <span className="mt-1.5 block">
      <strong className="font-semibold text-ink">Distribuição:</strong> quais demandas ocuparam mais tempo em um dia (na
      semana) ou no mês inteiro.
    </span>
    <span className="mt-1.5 block">
      <strong className="font-semibold text-ink">Ciclos:</strong> horas apontadas, prazo e última atualização de cada ciclo aberto.
    </span>
    <span className="mt-1.5 block">
      <strong className="font-semibold text-ink">Rendimento:</strong> para onde o tempo foi (chamados, reuniões, treinamentos,
      atividades e ciclos), quem predominou e quanto foi trabalho não planejado.
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

  // Rendimento e o Dia útil no mês são um cartão só, sem nada abaixo: cabem na janela (o gráfico encolhe) em vez de
  // rolar. O Dia útil na semana (quadro de produção e linha do turno, v0.19), Ciclos e Distribuição crescem com o
  // conteúdo e seguem rolando.
  const fit = (view === 'semana' && scale === 'month') || view === 'rendimento';

  return (
    <div className={`space-y-section ${fit ? 'fit-viewport' : ''}`}>
      <PageHeader
        title="Painel"
        hint={PAGE_HINT}
        action={
          <Link to={withDate('/apontamentos', date)} className="btn-primary">
            <PlusIcon size={18} /> Registrar apontamentos
          </Link>
        }
      />

      {/* Celular: as visões numa linha e, embaixo, a escala e o período lado a lado (duas faixas, não três).
          De sm em diante: escala, visões e, à direita, o período. */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="order-2 sm:order-1">
          <Segmented size="sm" label="Escala do período" value={scale} onChange={setScale} options={SCALES} />
        </div>
        <div className="order-1 w-full sm:order-2 sm:w-auto">
          <Segmented label="Métricas do painel" value={view} onChange={choose} options={VIEWS} stretch dense />
        </div>
        <div className="order-3 ml-auto">
          <PeriodNav date={date} scale={scale} onChange={setDate} />
        </div>
      </div>

      <div
        id="painel-visao"
        role="tabpanel"
        aria-label={VIEWS.find((v) => v.value === view)!.label}
        className={`min-w-0 ${fit ? 'lg:flex lg:min-h-0 lg:flex-1 lg:flex-col' : ''}`}
      >
        {view === 'demandas' ? (
          <CyclesView date={date} scale={scale} />
        ) : view === 'rendimento' ? (
          <YieldView date={date} scale={scale} />
        ) : summary.isPending || goalCycle.isPending ? (
          <Skeleton className="h-[34rem] lg:max-h-full" />
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
