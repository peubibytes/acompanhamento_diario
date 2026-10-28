import { useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import {
  DEMAND_EVENT_KINDS,
  DEMAND_EVENT_LABEL,
  durationOf,
  formatDayMonth,
  formatDuration,
  formatHM,
  todayISO,
  waitingWorkdays,
  WEEKDAY_SHORT,
  weekdayOf,
  type Activity,
  type DemandBlocker,
  type DemandEventKind,
} from '@acomp/shared';
import {
  useDeleteBlocker,
  useDeleteEvent,
  useDemand,
  useSaveBlocker,
  useSaveEvent,
  type DemandDetail,
} from '../api/client';
import { CheckIcon, HourglassIcon, PlusIcon, SendIcon, TrashIcon, XIcon } from './icons';
import { Skeleton } from './States';
import { useToast } from './Toast';

const dayLabel = (iso: string) => `${WEEKDAY_SHORT[weekdayOf(iso)]} ${formatDayMonth(iso)}`;

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

type Tab = 'linha' | 'impedimentos' | 'apontamentos';

/** Acompanhamento do ciclo: linha do tempo, impedimentos e apontamentos, em abas. */
export function CycleTracking({ id }: { id: number }) {
  const detail = useDemand(id);
  const [tab, setTab] = useState<Tab>('linha');
  if (detail.isPending) return <Skeleton className="mt-3 h-24" />;
  if (detail.isError) return <p className="mt-3 text-sm text-critical-text">{detail.error.message}</p>;
  const data = detail.data;
  const tabs: { value: Tab; label: string; count: number }[] = [
    { value: 'linha', label: 'Linha do tempo', count: data.events.length },
    { value: 'impedimentos', label: 'Impedimentos', count: data.blockers.length },
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
        {tab === 'impedimentos' && <Blockers detail={data} />}
        {tab === 'apontamentos' && <ActivityList activities={data.activities} />}
      </div>
    </div>
  );
}

/** Linha do tempo com entrada rápida: data (hoje), tipo e texto; Enter grava. */
function Timeline({ detail }: { detail: DemandDetail }) {
  const save = useSaveEvent(detail.id);
  const remove = useDeleteEvent(detail.id);
  const toast = useToast();
  const [date, setDate] = useState(todayISO());
  const [kind, setKind] = useState<DemandEventKind>('acao');
  const [text, setText] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate(
      { input: { date, kind, text } },
      { onSuccess: () => setText(''), onError: (err) => toast(err.message, 'error') },
    );
  };

  return (
    <div className="space-y-3">
      <form onSubmit={submit} className="flex flex-wrap gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Data do evento"
          className="field tabular w-auto! flex-none py-1.5! text-sm"
        />
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as DemandEventKind)}
          aria-label="Tipo do evento"
          className="field w-auto! flex-none py-1.5! text-sm"
        >
          {DEMAND_EVENT_KINDS.map((k) => (
            <option key={k} value={k}>
              {DEMAND_EVENT_LABEL[k]}
            </option>
          ))}
        </select>
        <div className="flex min-w-48 flex-1 gap-2">
          <input
            required
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="O que aconteceu?"
            maxLength={2000}
            aria-label="Descrição do evento"
            className="field py-1.5! text-sm"
          />
          <button
            type="submit"
            disabled={save.isPending}
            aria-label="Adicionar evento"
            title="Adicionar evento"
            className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-on-accent transition hover:bg-accent-hover disabled:opacity-60"
          >
            <SendIcon size={15} />
          </button>
        </div>
      </form>

      {detail.events.length === 0 ? (
        <p className="rounded-xl bg-surface-2 px-3 py-3 text-sm text-ink-2">
          Nenhum evento ainda. Registre ações, decisões, validações e deploys para montar o histórico.
        </p>
      ) : (
        <ol className="relative space-y-2 border-l border-line pl-4">
          {detail.events.map((ev) => (
            <li key={ev.id} className="group relative text-sm">
              <span className="absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-surface bg-accent" />
              <div className="flex items-start gap-2">
                <span className="tabular w-[4.5rem] shrink-0 font-medium whitespace-nowrap text-ink">{dayLabel(ev.date)}</span>
                <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-ink-2">
                  {DEMAND_EVENT_LABEL[ev.kind]}
                </span>
                <span className="min-w-0 flex-1 text-ink-2">{ev.text}</span>
                <button
                  onClick={() => remove.mutate(ev.id, { onError: (err) => toast(err.message, 'error') })}
                  aria-label="Excluir evento"
                  title="Excluir evento"
                  className="shrink-0 text-ink-3 opacity-0 transition group-hover:opacity-100 hover:text-critical-text focus:opacity-100"
                >
                  <XIcon size={14} />
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** Impedimentos: quem bloqueia, desde quando e há quantos dias úteis; resolver com um clique. */
function Blockers({ detail }: { detail: DemandDetail }) {
  const save = useSaveBlocker(detail.id);
  const remove = useDeleteBlocker(detail.id);
  const toast = useToast();
  const [owner, setOwner] = useState('');
  const [since, setSince] = useState(todayISO());
  const [description, setDescription] = useState('');
  const today = todayISO();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate(
      { input: { owner, since, description, resolvedAt: null } },
      {
        onSuccess: () => {
          setOwner('');
          setDescription('');
          toast('Impedimento registrado.');
        },
        onError: (err) => toast(err.message, 'error'),
      },
    );
  };

  const setResolved = (b: DemandBlocker, resolvedAt: string | null) =>
    save.mutate(
      { id: b.id, input: { owner: b.owner, description: b.description, since: b.since, resolvedAt } },
      {
        onSuccess: () => toast(resolvedAt ? 'Impedimento resolvido.' : 'Impedimento reaberto.'),
        onError: (err) => toast(err.message, 'error'),
      },
    );

  return (
    <div className="space-y-3">
      {detail.blockers.length === 0 ? (
        <p className="rounded-xl bg-surface-2 px-3 py-3 text-sm text-ink-2">
          Nenhum impedimento. Registre aqui quando o ciclo depender de outra pessoa ou equipe: o tempo de espera fica
          separado do esforço.
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {detail.blockers.map((b) => {
            const open = b.resolvedAt === null;
            const days = waitingWorkdays([b], today);
            return (
              <li key={b.id} className="flex items-start gap-3 px-3 py-2.5 text-sm">
                <span className={`mt-0.5 shrink-0 ${open ? 'text-warning-text' : 'text-good-text'}`}>
                  {open ? <HourglassIcon size={16} /> : <CheckIcon size={16} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`font-medium ${open ? 'text-ink' : 'text-ink-2'}`}>{b.owner}</p>
                  {b.description && <p className="text-ink-2">{b.description}</p>}
                  <p className="tabular text-xs text-ink-3">
                    Desde {dayLabel(b.since)}
                    {open ? '' : ` · resolvido em ${dayLabel(b.resolvedAt!)}`} ·{' '}
                    {days === 1 ? '1 dia útil' : `${days} dias úteis`} de espera
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => setResolved(b, open ? (today < b.since ? b.since : today) : null)}
                    disabled={save.isPending}
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                      open ? 'bg-good-soft text-good-text hover:brightness-95' : 'text-ink-2 hover:bg-surface-2'
                    }`}
                  >
                    {open ? 'Resolver' : 'Reabrir'}
                  </button>
                  <IconButton
                    label="Excluir impedimento"
                    onClick={() => remove.mutate(b.id, { onError: (err) => toast(err.message, 'error') })}
                  >
                    <TrashIcon size={15} />
                  </IconButton>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <form onSubmit={submit} className="grid gap-2 rounded-xl border border-dashed border-line p-3 sm:grid-cols-[1fr_auto]">
        <input
          required
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          placeholder="Responsável (pessoa ou equipe)"
          maxLength={200}
          aria-label="Responsável pelo impedimento"
          className="field py-1.5! text-sm"
        />
        <input
          type="date"
          value={since}
          onChange={(e) => setSince(e.target.value)}
          aria-label="Desde"
          className="field tabular py-1.5! text-sm sm:w-auto!"
        />
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="O que está bloqueando? (opcional)"
          maxLength={2000}
          aria-label="Descrição do impedimento"
          className="field py-1.5! text-sm"
        />
        <button
          type="submit"
          disabled={save.isPending}
          className="inline-flex items-center justify-center gap-1.5 rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-on-accent transition hover:bg-accent-hover disabled:opacity-60"
        >
          <PlusIcon size={15} /> Impedimento
        </button>
      </form>
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
