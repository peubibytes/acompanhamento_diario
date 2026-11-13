import { useId } from 'react';
import { Link } from 'react-router';
import { formatDayMonth, formatDuration, type DayMetrics, type PeriodScale, type PeriodSummary, type WeekMetrics } from '@acomp/shared';
import { useDemands } from '../../api/client';
import { AndonCell, dayTone, toneStyle } from '../../components/Badges';
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

/** Diferença com sinal, em horas ("+0h20", "−1h15", "0h"); sem apontamento, um traço. */
function signedDiff(minutes: number, diff: number): string {
  if (minutes === 0) return '—';
  if (diff === 0) return '0h';
  return `${diff > 0 ? '+' : '−'}${formatDuration(Math.abs(diff))}`;
}

/**
 * Painel → Dia útil, em quadro de produção (v0.19, decisão 0021): a faixa "planejado × realizado" do período (total,
 * meta, diferença, dias conformes e preenchido) e, na semana, o quadro dia a dia com o sinal de andon e a linha do
 * turno; no mês, as barras por dia útil (são até 23 colunas). `dailyGoal` é a meta do ciclo de apontamento de
 * `goalDate`, a que o popover edita.
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
      {/* Os indicadores mantêm o layout da v0.18 (anel, selo da situação e três números); o quadro e a linha do turno
          vêm abaixo. Em lg, no mês, o cartão encolhe até a altura que o Painel lhe dá (fit-viewport). */}
      <section className={`card rise p-5 sm:p-6 ${month ? 'lg:flex lg:min-h-0 lg:flex-col' : ''}`} aria-label="Quadro de produção">
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

        <div className={`mt-6 border-t border-line pt-5 lg:mt-5 lg:pt-4 ${month ? 'lg:flex lg:min-h-0 lg:flex-col' : ''}`}>
          {/* Título à esquerda, dias conformes no meio e o link à direita (no celular, o do meio desce). */}
          <div className="grid grid-cols-2 items-center gap-x-4 gap-y-3 sm:grid-cols-[1fr_auto_1fr]">
            <h2 className="title-plate text-2xl text-ink">{month ? 'Horas por dia útil' : 'Quadro de produção'}</h2>
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
          {month ? (
            <div className="mt-8 lg:mt-5 lg:flex lg:min-h-0 lg:flex-col">
              <DailyChart days={days} goal={commonGoal(days)} scale={scale} />
            </div>
          ) : (
            <div className="mt-4 border border-line">
              <ProductionList days={days} />
              <ProductionTable days={days} />
            </div>
          )}
        </div>
      </section>

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

/** No celular, o quadro vira uma lista: um dia por linha, com o realizado, a diferença e o sinal à direita. */
function ProductionList({ days }: { days: DayMetrics[] }) {
  return (
    <ul className="divide-y divide-line sm:hidden" aria-label="Quadro dia a dia">
      {days.map((d) => {
        const tone = dayTone(d);
        return (
          <li key={d.date}>
            <Link
              to={withDate('/apontamentos', d.date)}
              className="grid grid-cols-[4.5rem_1fr_7rem] items-stretch outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
            >
              <span className="flex items-baseline gap-1 self-center px-4 py-2.5">
                <span className="title-plate text-lg text-ink">{d.weekdayShort}</span>
                <span className="tabular text-xs text-ink-3">{formatDayMonth(d.date).slice(0, 2)}</span>
              </span>
              <span className="flex items-baseline gap-2 self-center py-2.5">
                <span className="num text-xl text-ink">{d.minutes === 0 ? '—' : formatDuration(d.minutes)}</span>
                <span className={`tabular text-sm font-semibold ${toneStyle[tone].text}`}>{d.minutes === 0 ? '' : signedDiff(d.minutes, d.diff)}</span>
              </span>
              <AndonCell tone={tone} className="px-3 text-sm" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** O quadro dia a dia da semana: meta, realizado, diferença, apontamentos e o sinal de andon. */
function ProductionTable({ days }: { days: DayMetrics[] }) {
  const row = 'border-b border-line';
  const head = 'px-4 py-2.5 text-left text-sm font-medium text-ink-2 whitespace-nowrap';
  const cell = 'border-l border-line px-4 py-2.5 text-right';
  return (
    <div className="hidden overflow-x-auto sm:block">
      <table className="w-full min-w-[40rem] border-collapse text-base">
        <thead>
          <tr className="border-b border-ink">
            <th scope="col" className="w-36 px-4 py-2.5">
              <span className="sr-only">Indicador</span>
            </th>
            {days.map((d) => (
              <th key={d.date} scope="col" className="border-l border-line p-0 text-right">
                <Link
                  to={withDate('/apontamentos', d.date)}
                  className="block px-4 py-2.5 outline-none hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
                  aria-label={`Apontamentos de ${d.weekdayLong}, ${formatDayMonth(d.date)}`}
                >
                  <span className="title-plate text-lg text-ink">{d.weekdayShort}</span>{' '}
                  <span className="tabular text-sm font-normal text-ink-3">{formatDayMonth(d.date)}</span>
                </Link>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className={row}>
            <th scope="row" className={head}>
              Meta
            </th>
            {days.map((d) => (
              <td key={d.date} className={`${cell} tabular text-ink-2`}>
                {formatDuration(d.goal)}
              </td>
            ))}
          </tr>
          <tr className={row}>
            <th scope="row" className={`${head} font-semibold text-ink`}>
              Realizado
            </th>
            {days.map((d) => (
              <td key={d.date} className={`${cell} num text-2xl text-ink`}>
                {d.minutes === 0 ? '—' : formatDuration(d.minutes)}
              </td>
            ))}
          </tr>
          <tr className={row}>
            <th scope="row" className={head}>
              Diferença
            </th>
            {days.map((d) => (
              <td key={d.date} className={`${cell} tabular font-semibold ${toneStyle[dayTone(d)].text}`}>
                {signedDiff(d.minutes, d.diff)}
              </td>
            ))}
          </tr>
          <tr className={row}>
            <th scope="row" className={head}>
              Apontamentos
            </th>
            {days.map((d) => (
              <td key={d.date} className={`${cell} tabular text-ink`}>
                {d.activityCount}
              </td>
            ))}
          </tr>
          <tr>
            <th scope="row" className={head}>
              Sinal
            </th>
            {days.map((d) => (
              <td key={d.date} className="border-l-2 border-surface p-0">
                <AndonCell tone={dayTone(d)} className="justify-end px-4 py-2.5 text-base" />
              </td>
            ))}
          </tr>
        </tbody>
      </table>
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
      <span className="mt-1.5 block">
        <strong className={term}>Sinal (andon):</strong> verde, o dia bateu a meta; âmbar, faltou; vermelho, passou
        (irregular, reajuste o apontamento); cinza, sem apontamento. Toque no dia para abrir os apontamentos dele.
      </span>
    </>
  );
}
