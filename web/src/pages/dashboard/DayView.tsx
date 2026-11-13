import { useId } from 'react';
import { Link } from 'react-router';
import { formatDuration, type DayMetrics, type PeriodScale, type PeriodSummary, type WeekMetrics } from '@acomp/shared';
import { useDemands } from '../../api/client';
import { toneStyle, type DayTone } from '../../components/Badges';
import { DailyChart } from '../../components/DailyChart';
import { GoalPopover } from '../../components/GoalSelector';
import { InfoHint } from '../../components/InfoHint';
import { ArrowRight, CheckIcon, HourglassIcon, TrendUpIcon } from '../../components/icons';
import { ProgressRing } from '../../components/ProgressRing';
import { ShiftLine } from '../../components/ShiftLine';
import { withDate } from '../../hooks';

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

const LABEL = 'kpi-label';
const NUMBER = 'kpi-value';

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
export function DayView({
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
    <div className="space-y-section lg:flex lg:min-h-0 lg:flex-col">
      {/* Em lg, no mês, o cartão encolhe até a altura que o Painel lhe dá (fit-viewport); quem cede é o gráfico. */}
    <section className={`card rise p-5 sm:p-6 ${month ? 'lg:flex lg:min-h-0 lg:flex-col' : ''}`}>
      <div className="relative flex shrink-0 flex-col gap-5 sm:flex-row sm:items-center sm:gap-8">
        <div className="flex items-center gap-4">
          <ProgressRing percent={week.fillPercent} exceeded={week.diff > 0} size={72} />
          <div className="min-w-0">
            <p className={LABEL}>Preenchido</p>
            <span className={`badge mt-1.5 ${status.style}`}>
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

      <div className="mt-6 border-t border-line pt-5 lg:mt-5 lg:flex lg:min-h-0 lg:flex-col lg:pt-4">
        {/* Título à esquerda, dias conformes no meio e o link à direita (no celular, o do meio desce). */}
        <div className="grid grid-cols-2 items-center gap-x-4 gap-y-3 sm:grid-cols-[1fr_auto_1fr]">
          <div className="flex items-center gap-1.5">
            <h2 className="title-plate text-lg whitespace-nowrap text-ink sm:text-2xl">Horas por dia útil</h2>
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
        <div className="mt-8 lg:mt-5 lg:flex lg:min-h-0 lg:flex-col">
          <DailyChart days={days} goal={commonGoal(days)} scale={scale} />
        </div>
      </div>
    </section>

      {/* Na semana, a linha do turno (v0.19, decisão 0021): quando cada apontamento aconteceu, dia a dia. */}
      {!month && (
        <section className="card rise" aria-label="Linha do turno">
          <div className="flex flex-wrap items-center gap-x-2 border-b border-line px-4 py-2.5">
            <h2 className="title-plate text-2xl text-ink">Linha do turno</h2>
            <span className="hidden text-sm text-ink-3 sm:inline">· quando cada apontamento aconteceu</span>
          </div>
          <div className="p-4">
            <ShiftLine days={days} />
          </div>
        </section>
      )}
    </div>
  );
}

/** Demandas concluídas (chamados, treinamentos e ciclos); o cartão suspenso separa tarefas de ciclos. */
function FulfilledStat() {
  const demands = useDemands();
  // Atividades ficam de fora: não entram nos números (decisão 0009).
  const done = (demands.data ?? []).filter(
    (d) => d.category !== 'reuniao' && d.category !== 'atividade' && d.status === 'concluido',
  );
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
            <span className={`size-2.5 shrink-0 rounded-sm ${c === 'acima' ? 'hatch-critical' : ''}`} style={c === 'acima' ? undefined : { background: toneStyle[c].bar }} />
            <span className={`shrink-0 ${toneStyle[c].text}`}>{toneStyle[c].icon(12)}</span>
            {toneStyle[c].label}
          </span>
        ))}
      </span>
    </>
  );
}
