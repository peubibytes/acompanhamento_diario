import { addDays, formatDayMonth, getCycle, todayISO, type ISODate } from '@acomp/shared';
import { CalendarIcon, ChevronLeft, ChevronRight } from './icons';

/** Navegação entre ciclos (sexta → quinta). */
export function CycleNav({ date, onChange }: { date: ISODate; onChange: (date: ISODate) => void }) {
  const cycle = getCycle(date);
  const current = getCycle(todayISO()).start;
  const isCurrent = cycle.start === current;
  const tag = isCurrent ? 'Ciclo atual' : cycle.start < current ? 'Ciclo anterior' : 'Próximo ciclo';

  const navButton = 'grid size-9 place-items-center rounded-full text-ink-2 transition hover:bg-surface-2 hover:text-ink';

  return (
    <div className="flex items-center gap-1">
      <button className={navButton} onClick={() => onChange(addDays(cycle.start, -7))} aria-label="Ciclo anterior">
        <ChevronLeft />
      </button>
      <div className="min-w-0 px-1 text-center sm:text-left">
        <p className="text-2xs font-semibold tracking-wider text-ink-3 uppercase">{tag}</p>
        <p className="tabular text-base font-semibold whitespace-nowrap text-ink">
          Sex {formatDayMonth(cycle.start)} <span className="text-ink-3">→</span> Qui {formatDayMonth(cycle.end)}
        </p>
      </div>
      <button className={navButton} onClick={() => onChange(addDays(cycle.start, 7))} aria-label="Próximo ciclo">
        <ChevronRight />
      </button>
      {!isCurrent && (
        <button
          onClick={() => onChange(todayISO())}
          className="ml-1 inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent transition hover:brightness-95"
        >
          <CalendarIcon size={14} /> Hoje
        </button>
      )}
    </div>
  );
}
