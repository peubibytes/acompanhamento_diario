import type { ReactNode } from 'react';
import {
  DEMAND_EVENT_LABEL,
  formatDayMonth,
  todayISO,
  WEEKDAY_SHORT,
  weekdayOf,
  type DemandEventKind,
  type TimelineEntry,
} from '@acomp/shared';
import { useDeleteBlocker, useDeleteEvent, useFlagEntry, useSaveBlocker } from '../api/client';
import { ArrowRight, CheckIcon, FlagIcon, HourglassIcon, SendIcon, TargetIcon, TrashIcon, XIcon } from './icons';
import { useToast } from './Toast';

export const dayLabel = (iso: string) => `${WEEKDAY_SHORT[weekdayOf(iso)]} ${formatDayMonth(iso)}`;

/**
 * Aparência de cada tipo. `dot` é a cor do ponto no mapa do Painel; o rótulo e o ícone sempre
 * acompanham a cor (ela nunca é a única pista).
 */
export const kindStyle: Record<DemandEventKind, { badge: string; dot: string; icon: (size: number) => ReactNode }> = {
  acao: { badge: 'bg-neutral-soft text-ink-2', dot: 'var(--neutral)', icon: (s) => <ArrowRight size={s} /> },
  decisao: { badge: 'bg-accent-soft text-accent', dot: 'var(--accent)', icon: (s) => <TargetIcon size={s} /> },
  impedimento: { badge: 'bg-warning-soft text-warning-text', dot: 'var(--warning)', icon: (s) => <HourglassIcon size={s} /> },
  validacao: { badge: 'bg-good-soft text-good-text', dot: 'var(--good)', icon: (s) => <CheckIcon size={s} /> },
  deploy: { badge: 'bg-accent-soft text-accent', dot: 'var(--accent)', icon: (s) => <SendIcon size={s} /> },
};

export function KindBadge({ kind }: { kind: DemandEventKind }) {
  const style = kindStyle[kind];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-medium whitespace-nowrap ${style.badge}`}
    >
      {style.icon(11)}
      {DEMAND_EVENT_LABEL[kind]}
    </span>
  );
}

/** Bandeira de uma entrada: marcada ganha a faixa vermelha da linha (ver `rowClass`). */
export function FlagButton({ entry }: { entry: TimelineEntry }) {
  const flag = useFlagEntry();
  const toast = useToast();
  return (
    <button
      type="button"
      aria-pressed={entry.flagged}
      aria-label={entry.flagged ? 'Desmarcar' : 'Marcar'}
      title={entry.flagged ? 'Desmarcar' : 'Marcar com bandeira'}
      disabled={flag.isPending}
      onClick={() => flag.mutate({ entry, flagged: !entry.flagged }, { onError: (err) => toast(err.message, 'error') })}
      className={`grid size-7 shrink-0 place-items-center rounded-full outline-none transition focus-visible:ring-2 focus-visible:ring-accent ${
        entry.flagged ? 'text-critical-text hover:bg-critical-soft' : 'text-ink-3 hover:bg-surface-2 hover:text-ink'
      }`}
    >
      <FlagIcon size={15} filled={entry.flagged} />
    </button>
  );
}

/** Faixa à esquerda: vermelha e com fundo suave quando marcada. */
const rowClass = (flagged: boolean) =>
  `group border-l-4 px-3 py-2 text-sm ${flagged ? 'border-critical bg-critical-soft/60' : 'border-transparent'}`;

interface RowProps {
  entry: TimelineEntry;
  /** Mostra o nome do ciclo (quando a lista mistura ciclos). */
  showCycle?: boolean;
  /** `full`: também resolve e exclui (Demandas); `flag`: só a bandeira (Detalhes). */
  actions?: 'full' | 'flag';
}

export function TimelineRow({ entry, showCycle = false, actions = 'flag' }: RowProps) {
  const isBlocker = entry.source === 'impedimento';
  const open = isBlocker && entry.resolvedAt === null;
  const days = entry.waitingWorkdays ?? 0;

  return (
    <li className={rowClass(entry.flagged)}>
      <div className="flex items-start gap-2">
        <span className="tabular w-[4.5rem] shrink-0 pt-0.5 font-medium whitespace-nowrap text-ink">{dayLabel(entry.date)}</span>
        <span className="pt-0.5">
          <KindBadge kind={entry.kind} />
        </span>
        <div className="min-w-0 flex-1">
          {showCycle && <p className="truncate text-xs font-medium text-ink-3">{entry.demandLabel}</p>}
          {isBlocker ? (
            <>
              <p className={`font-medium ${open ? 'text-ink' : 'text-ink-2'}`}>
                {open ? 'Aguardando ' : 'Esperou '}
                {entry.owner}
              </p>
              {entry.text && <p className="text-ink-2">{entry.text}</p>}
              <p className="tabular text-xs text-ink-3">
                {entry.resolvedAt ? `Resolvido em ${dayLabel(entry.resolvedAt)} · ` : ''}
                {days === 1 ? '1 dia útil' : `${days} dias úteis`} de espera
                {open && ' até agora'}
              </p>
            </>
          ) : (
            <p className="text-ink-2">{entry.text}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {actions === 'full' && isBlocker && <ResolveButton entry={entry} />}
          {actions === 'full' && <DeleteButton entry={entry} />}
          <FlagButton entry={entry} />
        </div>
      </div>
    </li>
  );
}

function ResolveButton({ entry }: { entry: TimelineEntry }) {
  const save = useSaveBlocker(entry.demandId);
  const toast = useToast();
  const open = entry.resolvedAt === null;
  const today = todayISO();
  const resolvedAt = open ? (today < entry.date ? entry.date : today) : null;

  return (
    <button
      type="button"
      disabled={save.isPending}
      onClick={() =>
        save.mutate(
          { id: entry.id, input: { owner: entry.owner!, description: entry.text, since: entry.date, resolvedAt } },
          {
            onSuccess: () => toast(open ? 'Impedimento resolvido.' : 'Impedimento reaberto.'),
            onError: (err) => toast(err.message, 'error'),
          },
        )
      }
      className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
        open ? 'bg-good-soft text-good-text hover:brightness-95' : 'text-ink-2 hover:bg-surface-2'
      }`}
    >
      {open ? 'Resolver' : 'Reabrir'}
    </button>
  );
}

function DeleteButton({ entry }: { entry: TimelineEntry }) {
  const removeEvent = useDeleteEvent(entry.demandId);
  const removeBlocker = useDeleteBlocker(entry.demandId);
  const toast = useToast();
  const label = entry.source === 'evento' ? 'Excluir evento' : 'Excluir impedimento';
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() =>
        (entry.source === 'evento' ? removeEvent : removeBlocker).mutate(entry.id, {
          onError: (err) => toast(err.message, 'error'),
        })
      }
      className="grid size-7 place-items-center rounded-full text-ink-3 opacity-0 transition group-hover:opacity-100 hover:bg-surface-2 hover:text-critical-text focus:opacity-100"
    >
      {entry.source === 'evento' ? <XIcon size={14} /> : <TrashIcon size={14} />}
    </button>
  );
}

/** Lista de entradas, do mais recente ao mais antigo. */
export function TimelineList({ entries, showCycle, actions }: { entries: TimelineEntry[]; showCycle?: boolean; actions?: 'full' | 'flag' }) {
  return (
    <ol className="divide-y divide-line overflow-hidden rounded-xl border border-line">
      {entries.map((e) => (
        <TimelineRow key={e.key} entry={e} showCycle={showCycle} actions={actions} />
      ))}
    </ol>
  );
}
