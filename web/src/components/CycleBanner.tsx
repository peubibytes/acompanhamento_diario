import {
  formatDayMonth,
  formatDuration,
  getCycle,
  remainingWorkdays,
  todayISO,
  weekdayOf,
  WORKDAYS_PER_CYCLE,
  type CycleSummary,
} from '@acomp/shared';
import { CalendarIcon, CheckIcon, SendIcon } from './icons';

const THURSDAY = 4;

/** Mensagem do ciclo: contagem até quinta, aviso de dia de apontamento ou fechamento. */
export function CycleBanner({ summary }: { summary: CycleSummary }) {
  const today = todayISO();
  const { week } = summary;
  const missing = Math.max(0, week.goal - week.total);
  const isCurrent = getCycle(today).start === summary.start;
  // Pronto para apontar só com os 5 dias exatamente na meta (nenhum abaixo, nenhum acima).
  // Dias acima da meta são detalhados no IrregularAlert, exibido logo acima desta faixa.
  const complete = week.conformDays === WORKDAYS_PER_CYCLE;
  const toFill = missing ? `Faltam ${formatDuration(missing)} para chegar a 100%.` : 'Revise os dias fora da meta.';

  let tone = 'bg-surface-2 text-ink-2';
  let icon = <CalendarIcon size={18} />;
  let title: string;
  let detail: string;

  if (isCurrent && weekdayOf(today) === THURSDAY) {
    tone = complete ? 'bg-good-soft text-good-text' : 'bg-accent-soft text-accent';
    icon = complete ? <CheckIcon size={18} /> : <SendIcon size={18} />;
    title = 'Hoje é dia de apontamento';
    detail = complete
      ? 'Semana 100% preenchida, tudo pronto para apontar.'
      : `Semana ${week.fillPercent}% preenchida. ${toFill}`;
  } else if (isCurrent) {
    const left = remainingWorkdays(getCycle(today), today);
    title = `Apontamento na quinta, ${formatDayMonth(summary.end)}`;
    detail = complete
      ? 'Semana já está 100% preenchida.'
      : `${left === 1 ? 'Falta 1 dia útil' : `Faltam ${left} dias úteis`} depois de hoje · ${toFill}`;
  } else if (summary.start < getCycle(today).start) {
    tone = complete ? 'bg-good-soft text-good-text' : 'bg-warning-soft text-warning-text';
    icon = complete ? <CheckIcon size={18} /> : <CalendarIcon size={18} />;
    title = 'Ciclo encerrado';
    detail = complete
      ? 'Semana fechada com 100% das horas preenchidas.'
      : `Fechou com ${week.fillPercent}% preenchido e dias fora da meta.`;
  } else {
    title = 'Ciclo futuro';
    detail = `Começa na sexta, ${formatDayMonth(summary.start)}.`;
  }

  return (
    <div className="card flex items-center gap-3 px-4 py-3">
      <span className={`grid size-9 shrink-0 place-items-center rounded-full ${tone}`}>{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className="text-sm text-ink-2">{detail}</p>
      </div>
    </div>
  );
}
