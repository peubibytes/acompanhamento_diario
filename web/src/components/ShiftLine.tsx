import { useMemo } from 'react';
import {
  DEMAND_CATEGORY_LABEL,
  formatDayMonth,
  formatDuration,
  formatHM,
  type Activity,
  type DayMetrics,
  type DemandCategory,
} from '@acomp/shared';
import { useDemands, useRangeActivities } from '../api/client';
import { categoryColor } from './DemandVisuals';

/** Sigla do tipo, como numa placa (a cor nunca vem sozinha). */
export const categoryCode: Record<DemandCategory, string> = {
  chamado: 'CHM',
  reuniao: 'REU',
  treinamento: 'TRE',
  atividade: 'ATV',
  ciclo: 'CIC',
};

const ORDER: DemandCategory[] = ['ciclo', 'chamado', 'reuniao', 'treinamento', 'atividade'];

/**
 * Linha do turno (v0.19, decisão 0021): cada dia como a linha do tempo de uma máquina, com os apontamentos em
 * blocos na cor do tipo da demanda. Mostra quando se trabalhou (ociosidade, sobreposição, hora extra), não só
 * quanto. A escala vai das 8h às 20h e se alarga se algum apontamento passar dela. Só leitura.
 */
export function ShiftLine({ days }: { days: DayMetrics[] }) {
  const from = days[0]?.date;
  const to = days[days.length - 1]?.date;
  const activities = useRangeActivities(from, to, Boolean(from));
  const demands = useDemands();

  const categoryOf = useMemo(() => {
    const map = new Map<number, DemandCategory>();
    for (const d of demands.data ?? []) map.set(d.id, d.category);
    return (a: Activity): DemandCategory | null => (a.demandId === null ? null : (map.get(a.demandId) ?? null));
  }, [demands.data]);

  const list = activities.data ?? [];
  const startHour = Math.min(8, ...list.map((a) => Math.floor(a.startMinute / 60)));
  const endHour = Math.max(20, ...list.map((a) => Math.ceil(a.endMinute / 60)));
  const span = (endHour - startHour) * 60;
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const pct = (minutes: number) => `${((minutes - startHour * 60) / span) * 100}%`;

  // Total por tipo no período, para a legenda (soma das durações; a sobreposição aparece na própria linha).
  const totals = new Map<DemandCategory, number>();
  for (const a of list) {
    const c = categoryOf(a);
    if (c) totals.set(c, (totals.get(c) ?? 0) + a.endMinute - a.startMinute);
  }

  return (
    <div className="min-w-0">
      <div className="grid grid-cols-[4.5rem_1fr] gap-3 pb-1 text-2xs text-ink-3 sm:grid-cols-[6rem_1fr]" aria-hidden="true">
        <span />
        <div className="grid" style={{ gridTemplateColumns: `repeat(${hours.length}, minmax(0, 1fr))` }}>
          {hours.map((h) => (
            <span key={h} className="tabular max-sm:[&:nth-child(even)]:invisible">
              {String(h).padStart(2, '0')}
            </span>
          ))}
        </div>
      </div>
      <ul className="stagger space-y-1.5">
        {days.map((d) => {
          const own = list.filter((a) => a.date === d.date);
          const label = `${d.weekdayShort} ${formatDayMonth(d.date)}: ${formatDuration(d.minutes)} em ${own.length} apontamentos`;
          return (
            <li key={d.date} className="grid grid-cols-[4.5rem_1fr] items-center gap-3 sm:grid-cols-[6rem_1fr]">
              <span className="tabular text-sm font-semibold text-ink">
                {d.weekdayShort} <span className="font-normal text-ink-3">{formatDayMonth(d.date)}</span>
              </span>
              <div
                role="img"
                aria-label={label}
                className="relative h-6 border-b border-line-strong"
                style={{
                  background: `repeating-linear-gradient(90deg, var(--grid) 0 1px, transparent 1px ${100 / hours.length}%)`,
                }}
              >
                {own.map((a) => {
                  const c = categoryOf(a);
                  return (
                    <span
                      key={a.id}
                      title={`${formatHM(a.startMinute)}–${formatHM(a.endMinute)} · ${a.project}`}
                      className="grow-x absolute inset-y-0"
                      style={{
                        left: pct(a.startMinute),
                        width: `${((a.endMinute - a.startMinute) / span) * 100}%`,
                        background: c ? categoryColor[c] : 'var(--series-other)',
                        boxShadow: 'inset -1px 0 0 var(--surface)',
                      }}
                    />
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 border-t border-line pt-3 text-sm text-ink-2" aria-label="Tempo por tipo no período">
        {ORDER.filter((c) => totals.has(c)).map((c) => (
          <li key={c} className="flex items-center gap-1.5">
            <span className="size-2.5" style={{ background: categoryColor[c] }} aria-hidden="true" />
            <span className="num text-ink-3">{categoryCode[c]}</span>
            {DEMAND_CATEGORY_LABEL[c]}
            <strong className="num text-ink">{formatDuration(totals.get(c)!)}</strong>
          </li>
        ))}
        {list.length === 0 && !activities.isPending && <li>Sem apontamentos no período.</li>}
      </ul>
    </div>
  );
}
