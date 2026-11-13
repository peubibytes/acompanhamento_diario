import { Link } from 'react-router';
import { formatDayMonth, formatDuration, type DayMetrics, type PeriodScale, type PeriodSummary } from '@acomp/shared';
import { AndonCell, dayTone, toneStyle, type DayTone } from '../../components/Badges';
import { DailyChart } from '../../components/DailyChart';
import { GoalPopover } from '../../components/GoalSelector';
import { InfoHint } from '../../components/InfoHint';
import { ArrowRight } from '../../components/icons';
import { ShiftLine } from '../../components/ShiftLine';
import { withDate } from '../../hooks';

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
  const periodTone: DayTone = week.total === 0 ? 'pendente' : week.diff > 0 ? 'acima' : week.diff === 0 ? 'conforme' : 'abaixo';

  return (
    <div className="space-y-section lg:flex lg:min-h-0 lg:flex-col">
      {/* Em lg, no mês, o cartão encolhe até a altura que o Painel lhe dá (fit-viewport); quem cede é o gráfico. */}
      <section className={`card rise ${month ? 'lg:flex lg:min-h-0 lg:flex-col' : ''}`} aria-label="Quadro de produção">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line px-4 py-2.5">
          <div className="flex items-center gap-1.5">
            <h2 className="title-plate text-2xl text-ink">Quadro de produção</h2>
            <span className="hidden text-sm text-ink-3 sm:inline">· planejado × realizado</span>
            <InfoHint label="Sobre o quadro de produção">
              <KpiHint scale={scale} dailyGoal={dailyGoal} dayCount={days.length} />
            </InfoHint>
          </div>
          <Link
            to={withDate('/detalhes', date)}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-2 transition hover:text-ink"
          >
            Detalhes dia a dia <ArrowRight size={14} />
          </Link>
        </div>

        {/* A faixa do período: células encaixadas, separadas por fios, como as de um painel. */}
        <dl className="grid shrink-0 grid-cols-2 border-b border-line sm:grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,1.6fr)] [&>*]:border-line [&>*]:px-4 [&>*]:py-3 max-sm:[&>*:nth-child(even)]:border-l sm:[&>*+*]:border-l max-sm:[&>*:nth-child(n+3)]:border-t">
          <div>
            <dt className={LABEL}>Total realizado</dt>
            <dd className={NUMBER}>{formatDuration(week.total)}</dd>
          </div>
          <GoalPopover date={goalDate} dailyGoal={dailyGoal} weekGoal={week.goal} label={month ? 'Meta do período' : 'Meta semanal'} />
          <div>
            <dt className={LABEL}>Diferença</dt>
            <dd className={`${NUMBER} ${toneStyle[periodTone].text}`}>{signedDiff(week.total, week.diff)}</dd>
          </div>
          <div>
            <dt className={LABEL}>Dias conformes</dt>
            <dd className={NUMBER}>
              {week.conformDays}/{days.length}
            </dd>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <dt className={`${LABEL} flex justify-between`}>
              Preenchido <span className="num text-sm text-ink">{week.fillPercent}%</span>
            </dt>
            <dd className="mt-2.5">
              <FillBar percent={week.fillPercent} segments={month ? 1 : days.length} exceeded={week.diff > 0} />
            </dd>
          </div>
        </dl>

        {month ? (
          <div className="p-4 lg:flex lg:min-h-0 lg:flex-col">
            <DailyChart days={days} goal={commonGoal(days)} scale={scale} />
          </div>
        ) : (
          <>
            <ProductionList days={days} />
            <ProductionTable days={days} />
          </>
        )}
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

/** Barra de preenchimento em segmentos (um por dia útil na semana), como um indicador de máquina. */
function FillBar({ percent, segments, exceeded }: { percent: number; segments: number; exceeded: boolean }) {
  return (
    <div className="relative h-3 bg-grid" role="img" aria-label={`${percent}% da meta preenchida`}>
      <div
        className="grow-x absolute inset-y-0 left-0"
        style={{ width: `${Math.min(100, percent)}%`, background: exceeded ? 'var(--critical)' : 'var(--bar)' }}
      />
      <div className="absolute inset-0 flex" aria-hidden="true">
        {Array.from({ length: segments }, (_, i) => (
          <span key={i} className={`flex-1 ${i < segments - 1 ? 'border-r-2 border-surface' : ''}`} />
        ))}
      </div>
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
        <strong className={term}>Sinal (andon):</strong> verde, o dia bateu a meta; âmbar, faltou; vermelho, passou
        (irregular, reajuste o apontamento); cinza, sem apontamento. Toque no dia para abrir os apontamentos dele.
      </span>
    </>
  );
}
