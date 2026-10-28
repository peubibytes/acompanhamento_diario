import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import {
  DEMAND_ENVIRONMENT_LABEL,
  DEMAND_EVENT_KINDS,
  DEMAND_EVENT_LABEL,
  durationOf,
  formatDayMonth,
  formatDuration,
  formatHM,
  isOpenDemand,
  matchesDemandFilter,
  PROGRESS_LABEL,
  todayISO,
  waitingWorkdays,
  WEEKDAY_SHORT,
  weekdayOf,
  type Demand,
  type DemandBlocker,
  type DemandEventKind,
  type DemandInput,
  type DemandStatus,
  type DemandSummary,
} from '@acomp/shared';
import {
  useDeleteBlocker,
  useDeleteDemand,
  useDeleteEvent,
  useDemand,
  useDemands,
  useSaveBlocker,
  useSaveDemand,
  useSaveEvent,
  type DemandDetail,
} from '../api/client';
import { DemandForm } from '../components/DemandForm';
import {
  DeadlineBadge,
  DemandFlags,
  DemandHoursCaption,
  DemandProgressBar,
  DemandStatusBadge,
} from '../components/DemandVisuals';
import {
  AlertIcon,
  BellIcon,
  CheckIcon,
  ChevronDown,
  HourglassIcon,
  PencilIcon,
  PlusIcon,
  SendIcon,
  TargetIcon,
  TrashIcon,
  UndoIcon,
  XIcon,
} from '../components/icons';
import { ErrorState, Skeleton } from '../components/States';
import { useToast } from '../components/Toast';

type Filter = 'abertas' | 'encerradas' | 'todas';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'abertas', label: 'Abertas' },
  { value: 'encerradas', label: 'Encerradas' },
  { value: 'todas', label: 'Todas' },
];

const matches = (d: Demand, f: Filter) => f === 'todas' || matchesDemandFilter(d, f);

/** Campos editáveis da demanda, para gravá-la com uma alteração pontual (ex.: status). */
const toInput = (d: Demand): DemandInput => ({
  title: d.title,
  description: d.description,
  externalIds: d.externalIds,
  system: d.system,
  kind: d.kind,
  priority: d.priority,
  progressPercent: d.progressPercent,
  targetMinutes: d.targetMinutes,
  startDate: d.startDate,
  dueDate: d.dueDate,
  status: d.status,
  branch: d.branch,
  prUrl: d.prUrl,
  environment: d.environment,
});

export function Demands() {
  const demands = useDemands();
  const [filter, setFilter] = useState<Filter>('abertas');
  const [editingId, setEditingId] = useState<number | null>(null);
  const formRef = useRef<HTMLElement>(null);
  const { hash } = useLocation();

  const all = demands.data ?? [];
  const list = all.filter((d) => matches(d, filter));
  const editing = all.find((d) => d.id === editingId);
  const count = (f: Filter) => all.filter((d) => matches(d, f)).length;

  // Links do painel (#demanda-ID) rolam até o cartão e o destacam.
  useEffect(() => {
    const id = Number(/^#demanda-(\d+)$/.exec(hash)?.[1]);
    if (!id || !demands.data) return;
    const target = demands.data.find((d) => d.id === id);
    if (target && !matches(target, filter)) setFilter(isOpenDemand(target) ? 'abertas' : 'encerradas');
    requestAnimationFrame(() =>
      document.getElementById(`demanda-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
    );
  }, [hash, demands.data]);

  const startEditing = (id: number | null) => {
    setEditingId(id);
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">Demandas</h1>
          <p className="mt-1 text-sm text-ink-2">
            Chamados e trabalhos longos: status, linha do tempo, impedimentos, prazo e horas apontadas.
          </p>
        </div>
        <div className="flex items-center rounded-full bg-surface-2 p-1" role="group" aria-label="Filtrar demandas">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              aria-pressed={filter === f.value}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                filter === f.value ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:text-ink'
              }`}
            >
              {f.label}
              {demands.data && <span className="tabular ml-1.5 text-xs text-ink-3">{count(f.value)}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-5">
        <section className="space-y-3 lg:col-span-3">
          {demands.isPending ? (
            <>
              <Skeleton className="h-48" />
              <Skeleton className="h-48" />
            </>
          ) : demands.isError ? (
            <ErrorState message={demands.error.message} onRetry={() => demands.refetch()} />
          ) : list.length === 0 ? (
            <EmptyList filter={filter} />
          ) : (
            <ul className="space-y-3">
              {list.map((d) => (
                <DemandCard
                  key={d.id}
                  demand={d}
                  highlighted={hash === `#demanda-${d.id}`}
                  isEditing={d.id === editingId}
                  onEdit={() => startEditing(d.id)}
                  onDeleted={() => d.id === editingId && setEditingId(null)}
                />
              ))}
            </ul>
          )}
        </section>

        <aside ref={formRef} className="card scroll-mt-24 p-5 sm:p-6 lg:sticky lg:top-24 lg:col-span-2">
          <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-ink">
            {editing ? <PencilIcon size={17} /> : <PlusIcon size={17} />}
            {editing ? 'Editar demanda' : 'Nova demanda'}
          </h2>
          <DemandForm key={editing?.id ?? 'nova'} editing={editing} onDone={() => setEditingId(null)} />
        </aside>
      </div>
    </div>
  );
}

function DemandCard({
  demand: d,
  highlighted,
  isEditing,
  onEdit,
  onDeleted,
}: {
  demand: DemandSummary;
  highlighted: boolean;
  isEditing: boolean;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const save = useSaveDemand();
  const remove = useDeleteDemand();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [open, setOpen] = useState(false);
  const m = d.metrics;
  const t = d.tracking;
  const done = !isOpenDemand(d);

  const setStatus = (status: DemandStatus, message: string) =>
    save.mutate(
      {
        id: d.id,
        input: { ...toInput(d), status, progressPercent: status === 'concluido' ? 100 : d.progressPercent },
      },
      { onSuccess: () => toast(message), onError: (err) => toast(err.message, 'error') },
    );
  const toggleStatus = () =>
    done ? setStatus('em_andamento', 'Demanda reaberta.') : setStatus('concluido', 'Demanda concluída.');

  const doRemove = () =>
    remove.mutate(d.id, {
      onSuccess: () => {
        onDeleted();
        toast('Demanda excluída. As atividades vinculadas foram mantidas, sem vínculo.');
      },
      onError: (err) => toast(err.message, 'error'),
    });

  const reminderTone =
    m.deadline === 'atrasada' || m.atRisk ? 'bg-critical-soft text-critical-text' : 'bg-warning-soft text-warning-text';

  return (
    <li
      id={`demanda-${d.id}`}
      className={`card rise scroll-mt-24 p-4 transition sm:p-5 ${isEditing || highlighted ? 'ring-2 ring-accent' : ''} ${
        done ? 'opacity-80' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {(d.externalIds.length > 0 || d.system) && (
            <p className="tabular mb-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-3">
              {d.externalIds.map((id) => (
                <span key={id} className="rounded bg-surface-2 px-1.5 py-0.5 font-medium text-ink-2">
                  {id}
                </span>
              ))}
              {d.system && <span>{d.system}</span>}
            </p>
          )}
          <h3 className={`font-semibold text-ink ${done ? 'line-through decoration-ink-3' : ''}`}>{d.title}</h3>
          {d.description && <p className="mt-0.5 line-clamp-2 text-sm text-ink-2">{d.description}</p>}
        </div>
        <DeadlineBadge status={m.deadline} />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <DemandStatusBadge status={d.status} />
        <DemandFlags kind={d.kind} priority={d.priority} />
        {d.environment && (
          <span className="inline-flex items-center rounded-full bg-neutral-soft px-2.5 py-1 text-xs font-medium text-ink-2">
            {DEMAND_ENVIRONMENT_LABEL[d.environment]}
          </span>
        )}
      </div>

      <div className="mt-4">
        <DemandProgressBar demand={d} height={10} />
        <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-2">
          <DemandHoursCaption demand={d} />
          {m.target !== null && <span className="text-xs text-ink-3">{PROGRESS_LABEL[m.progress]}</span>}
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Prazo">
          {d.dueDate ? (
            <>
              {WEEKDAY_SHORT[weekdayOf(d.dueDate)]} {formatDayMonth(d.dueDate)}
              {m.deadline === 'atrasada' ? (
                <span className="block text-xs font-medium text-critical-text">prazo vencido</span>
              ) : (
                m.workdaysLeft !== null && (
                  <span className="block text-xs font-normal text-ink-3">
                    {m.workdaysLeft === 1 ? '1 dia útil disponível' : `${m.workdaysLeft} dias úteis disponíveis`}
                  </span>
                )
              )}
            </>
          ) : (
            <span className="text-ink-3">Sem prazo</span>
          )}
        </Stat>
        {m.requiredPerDay ? (
          <Stat label="Ritmo necessário">
            {formatDuration(m.requiredPerDay)}
            <span className="block text-xs font-normal text-ink-3">por dia útil</span>
          </Stat>
        ) : (
          <Stat label="Espera">
            {t.waitingWorkdays === 0 ? (
              <span className="text-ink-3">—</span>
            ) : (
              <>
                {t.waitingWorkdays === 1 ? '1 dia útil' : `${t.waitingWorkdays} dias úteis`}
                <span className={`block text-xs font-normal ${t.openBlockers ? 'text-warning-text' : 'text-ink-3'}`}>
                  {t.openBlockers === 0
                    ? 'impedimentos resolvidos'
                    : t.openBlockers === 1
                      ? '1 impedimento aberto'
                      : `${t.openBlockers} impedimentos abertos`}
                </span>
              </>
            )}
          </Stat>
        )}
        <Stat label="Apontamentos">
          {m.activityCount}
          {m.lastActivityDate && (
            <span className="block text-xs font-normal text-ink-3">último em {formatDayMonth(m.lastActivityDate)}</span>
          )}
        </Stat>
      </dl>

      {m.reminder && (
        <p role="alert" className={`mt-4 flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm ${reminderTone}`}>
          <BellIcon size={16} className="mt-0.5 shrink-0" />
          {m.reminder}
        </p>
      )}
      {m.progress === 'excedida' && !m.reminder && (
        <p className="mt-2 flex items-start gap-2 rounded-xl bg-critical-soft px-3 py-2.5 text-sm text-critical-text">
          <AlertIcon size={16} className="mt-0.5 shrink-0" />
          {m.diagnosis}.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="inline-flex items-center gap-1 text-sm font-medium text-ink-2 hover:text-ink"
        >
          <ChevronDown size={16} className={`transition ${open ? 'rotate-180' : ''}`} />
          {open ? 'Ocultar acompanhamento' : 'Acompanhamento'}
          {t.eventCount > 0 && <span className="tabular text-xs text-ink-3">({t.eventCount})</span>}
        </button>
        <div className="flex items-center gap-1">
          {confirming ? (
            <>
              <span className="mr-1 text-xs text-ink-2">Excluir a demanda?</span>
              <button
                onClick={doRemove}
                disabled={remove.isPending}
                className="rounded-full bg-critical px-3 py-1 text-xs font-semibold text-white hover:brightness-110"
              >
                Sim
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="rounded-full px-3 py-1 text-xs font-semibold text-ink-2 hover:bg-surface-2"
              >
                Não
              </button>
            </>
          ) : (
            <>
              <button
                onClick={toggleStatus}
                disabled={save.isPending}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  done ? 'text-ink-2 hover:bg-surface-2' : 'bg-good-soft text-good-text hover:brightness-95'
                }`}
              >
                {done ? <UndoIcon size={14} /> : <CheckIcon size={14} />}
                {done ? 'Reabrir' : 'Concluir'}
              </button>
              <IconButton label="Editar demanda" onClick={onEdit}>
                <PencilIcon size={16} />
              </IconButton>
              <IconButton label="Excluir demanda" onClick={() => setConfirming(true)}>
                <TrashIcon size={16} />
              </IconButton>
            </>
          )}
        </div>
      </div>

      {open && <DemandTracking id={d.id} />}
    </li>
  );
}

type Tab = 'linha' | 'impedimentos' | 'apontamentos';

/** Linha do tempo, impedimentos e apontamentos, carregados só quando o cartão é expandido. */
function DemandTracking({ id }: { id: number }) {
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
      <div className="flex rounded-full bg-surface-2 p-1" role="tablist" aria-label="Acompanhamento da demanda">
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
        {tab === 'apontamentos' && <DemandActivities activities={data.activities} />}
      </div>
    </div>
  );
}

const dayLabel = (iso: string) => `${WEEKDAY_SHORT[weekdayOf(iso)]} ${formatDayMonth(iso)}`;

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
          Nenhum impedimento. Registre aqui quando a demanda depender de outra pessoa ou equipe: o tempo de
          espera fica separado do esforço.
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

function DemandActivities({ activities: acts }: { activities: DemandDetail['activities'] }) {
  if (acts.length === 0) {
    return (
      <p className="rounded-xl bg-surface-2 px-3 py-3 text-sm text-ink-2">
        Nenhum apontamento ainda. Ao registrar uma atividade, escolha esta demanda no campo “Demanda”.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-line rounded-xl border border-line">
      {acts.map((a) => (
        <li key={a.id}>
          <Link
            to={`/atividades?data=${a.date}`}
            className="flex items-center gap-3 px-3 py-2 text-sm transition hover:bg-surface-2/70"
          >
            <span className="tabular w-16 shrink-0 font-medium text-ink">
              {WEEKDAY_SHORT[weekdayOf(a.date)]} {formatDayMonth(a.date)}
            </span>
            <span className="tabular w-24 shrink-0 text-ink-3">
              {formatHM(a.startMinute)}–{formatHM(a.endMinute)}
            </span>
            <span className="min-w-0 flex-1 truncate text-ink-2">{a.description || a.project}</span>
            <span className="tabular shrink-0 font-medium text-ink">{formatDuration(durationOf(a))}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold tracking-wider text-ink-3 uppercase">{label}</dt>
      <dd className="tabular mt-0.5 text-sm font-semibold text-ink">{children}</dd>
    </div>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
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

function EmptyList({ filter }: { filter: Filter }) {
  return (
    <div className="card flex flex-col items-center px-6 py-12 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-accent-soft text-accent">
        <TargetIcon size={22} />
      </span>
      <p className="mt-3 font-semibold text-ink">
        {filter === 'encerradas' ? 'Nenhuma demanda encerrada' : 'Nenhuma demanda por aqui'}
      </p>
      <p className="mt-1 max-w-xs text-sm text-ink-2">
        {filter === 'encerradas'
          ? 'Demandas concluídas ou canceladas aparecem nesta lista.'
          : 'Crie uma demanda ou chamado com os identificadores, o prazo e, se quiser, a meta de horas. Depois, vincule suas atividades a ela.'}
      </p>
    </div>
  );
}
