import { useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import {
  DEMAND_EVENT_KINDS,
  DEMAND_EVENT_LABEL,
  durationOf,
  formatDuration,
  formatHM,
  todayISO,
  type Activity,
  type DemandEventKind,
} from '@acomp/shared';
import { useDemand, useSaveBlocker, useSaveEvent, type DemandDetail } from '../api/client';
import { ArrowRight, SendIcon } from './icons';
import { Skeleton } from './States';
import { dayLabel, TimelineList } from './Timeline';
import { useToast } from './Toast';

/** Apontamentos de uma demanda (todos os tipos), carregados só quando o cartão é expandido. */
export function ActivityHistory({ id }: { id: number }) {
  const detail = useDemand(id);
  if (detail.isPending) return <Skeleton className="mt-3 h-20" />;
  if (detail.isError) return <p className="mt-3 text-sm text-critical-text">{detail.error.message}</p>;
  return (
    <div className="mt-3">
      <ActivityList activities={detail.data.activities} />
    </div>
  );
}

/** Cada ocorrência da demanda: data, horário, duração e o que foi feito. */
function ActivityList({ activities }: { activities: Activity[] }) {
  if (activities.length === 0) {
    return (
      <p className="rounded-xl bg-surface-2 px-3 py-3 text-sm text-ink-2">
        Nenhum apontamento ainda. Em Apontamentos, escolha esta demanda e registre o horário.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-line rounded-xl border border-line">
      {activities.map((a) => (
        <li key={a.id}>
          <Link
            to={`/apontamentos?data=${a.date}`}
            className="flex items-center gap-3 px-3 py-2 text-sm transition hover:bg-surface-2/70"
          >
            <span className="tabular w-[4.5rem] shrink-0 font-medium whitespace-nowrap text-ink">{dayLabel(a.date)}</span>
            <span className="tabular w-24 shrink-0 text-ink-3">
              {formatHM(a.startMinute)}–{formatHM(a.endMinute)}
            </span>
            <span className="min-w-0 flex-1 truncate text-ink-2">{a.description || '—'}</span>
            <span className="tabular shrink-0 font-medium text-ink">{formatDuration(durationOf(a))}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

type Tab = 'linha' | 'apontamentos';

/** Acompanhamento do ciclo: linha do tempo (com os impedimentos) e apontamentos, em abas. */
export function CycleTracking({ id }: { id: number }) {
  const detail = useDemand(id);
  const [tab, setTab] = useState<Tab>('linha');
  if (detail.isPending) return <Skeleton className="mt-3 h-24" />;
  if (detail.isError) return <p className="mt-3 text-sm text-critical-text">{detail.error.message}</p>;
  const data = detail.data;
  const tabs: { value: Tab; label: string; count: number }[] = [
    { value: 'linha', label: 'Linha do tempo', count: data.timeline.length },
    { value: 'apontamentos', label: 'Apontamentos', count: data.activities.length },
  ];

  return (
    <div className="mt-3">
      <div className="flex rounded-full bg-surface-2 p-1" role="tablist" aria-label="Acompanhamento do ciclo">
        {tabs.map((t) => (
          <button
            key={t.value}
            role="tab"
            aria-selected={tab === t.value}
            onClick={() => setTab(t.value)}
            className={`flex-1 rounded-full px-2 py-1.5 text-xs font-medium transition ${
              tab === t.value ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:text-ink'
            }`}
          >
            {t.label}
            <span className="tabular ml-1 text-ink-3">{t.count}</span>
          </button>
        ))}
      </div>
      <div role="tabpanel" className="mt-3">
        {tab === 'linha' && <Timeline detail={data} />}
        {tab === 'apontamentos' && <ActivityList activities={data.activities} />}
      </div>
    </div>
  );
}

/**
 * Linha do tempo com entrada rápida: data (hoje), tipo e texto; Enter grava. O tipo
 * "Impedimento" pede o responsável e registra o bloqueio (com espera e resolução); os demais
 * registram um evento.
 */
function Timeline({ detail }: { detail: DemandDetail }) {
  const saveEvent = useSaveEvent(detail.id);
  const saveBlocker = useSaveBlocker(detail.id);
  const toast = useToast();
  const [date, setDate] = useState(todayISO());
  const [kind, setKind] = useState<DemandEventKind>('acao');
  const [text, setText] = useState('');
  const [owner, setOwner] = useState('');
  const isBlocker = kind === 'impedimento';

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const done = { onError: (err: Error) => toast(err.message, 'error') };
    if (isBlocker) {
      saveBlocker.mutate(
        { input: { owner, since: date, description: text, resolvedAt: null } },
        {
          ...done,
          onSuccess: () => {
            setOwner('');
            setText('');
            toast('Impedimento registrado.');
          },
        },
      );
    } else {
      saveEvent.mutate({ input: { date, kind, text } }, { ...done, onSuccess: () => setText('') });
    }
  };

  const pending = saveEvent.isPending || saveBlocker.isPending;

  return (
    <div className="space-y-3">
      <form onSubmit={submit} className="flex flex-wrap gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label={isBlocker ? 'Desde' : 'Data do evento'}
          className="field tabular w-auto! flex-none py-1.5! text-sm"
        />
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as DemandEventKind)}
          aria-label="Tipo do registro"
          className="field w-auto! flex-none py-1.5! text-sm"
        >
          {DEMAND_EVENT_KINDS.map((k) => (
            <option key={k} value={k}>
              {DEMAND_EVENT_LABEL[k]}
            </option>
          ))}
        </select>
        {isBlocker && (
          <input
            required
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            placeholder="Responsável (pessoa ou equipe)"
            maxLength={200}
            aria-label="Responsável pelo impedimento"
            className="field min-w-48 flex-1 py-1.5! text-sm"
          />
        )}
        <div className="flex min-w-48 flex-1 basis-full gap-2 sm:basis-auto">
          <input
            required={!isBlocker}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={isBlocker ? 'O que está bloqueando? (opcional)' : 'O que aconteceu?'}
            maxLength={2000}
            aria-label={isBlocker ? 'Descrição do impedimento' : 'Descrição do evento'}
            className="field py-1.5! text-sm"
          />
          <button
            type="submit"
            disabled={pending}
            aria-label={isBlocker ? 'Adicionar impedimento' : 'Adicionar evento'}
            title={isBlocker ? 'Adicionar impedimento' : 'Adicionar evento'}
            className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-on-accent transition hover:bg-accent-hover disabled:opacity-60"
          >
            <SendIcon size={15} />
          </button>
        </div>
      </form>

      {detail.timeline.length === 0 ? (
        <p className="rounded-xl bg-surface-2 px-3 py-3 text-sm text-ink-2">
          Nenhum registro ainda. Registre ações, decisões, validações, deploys e impedimentos (quando o ciclo depender
          de outra pessoa ou equipe: o tempo de espera fica separado do esforço).
        </p>
      ) : (
        <>
          <TimelineList entries={detail.timeline} actions="full" />
          <Link
            to={`/detalhes?aba=ciclos&ciclo=${detail.id}`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:underline"
          >
            Analisar linha do tempo <ArrowRight size={13} />
          </Link>
        </>
      )}
    </div>
  );
}

export function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid size-8 place-items-center rounded-full text-ink-3 transition hover:bg-surface-2 hover:text-ink"
    >
      {children}
    </button>
  );
}
