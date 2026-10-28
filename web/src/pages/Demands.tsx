import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import {
  durationOf,
  formatDayMonth,
  formatDuration,
  formatHM,
  PROGRESS_LABEL,
  WEEKDAY_SHORT,
  weekdayOf,
  type DemandSummary,
} from '@acomp/shared';
import { useDeleteDemand, useDemand, useDemands, useSaveDemand } from '../api/client';
import { DemandForm } from '../components/DemandForm';
import { DeadlineBadge, DemandHoursCaption, DemandProgressBar } from '../components/DemandVisuals';
import {
  AlertIcon,
  BellIcon,
  CheckIcon,
  ChevronDown,
  PencilIcon,
  PlusIcon,
  TargetIcon,
  TrashIcon,
  UndoIcon,
} from '../components/icons';
import { ErrorState, Skeleton } from '../components/States';
import { useToast } from '../components/Toast';

type Filter = 'ativa' | 'concluida' | 'todas';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'ativa', label: 'Ativas' },
  { value: 'concluida', label: 'Concluídas' },
  { value: 'todas', label: 'Todas' },
];

export function Demands() {
  const demands = useDemands();
  const [filter, setFilter] = useState<Filter>('ativa');
  const [editingId, setEditingId] = useState<number | null>(null);
  const formRef = useRef<HTMLElement>(null);
  const { hash } = useLocation();

  const all = demands.data ?? [];
  const list = all.filter((d) => filter === 'todas' || d.status === filter);
  const editing = all.find((d) => d.id === editingId);
  const count = (f: Filter) => all.filter((d) => f === 'todas' || d.status === f).length;

  // Links do painel (#demanda-ID) rolam até o cartão e o destacam.
  useEffect(() => {
    const id = Number(/^#demanda-(\d+)$/.exec(hash)?.[1]);
    if (!id || !demands.data) return;
    const target = demands.data.find((d) => d.id === id);
    if (target && target.status !== filter && filter !== 'todas') setFilter(target.status);
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
            Trabalhos mais longos, feitos ao longo de vários dias, com meta de horas e prazo.
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
  const done = d.status === 'concluida';

  const toggleStatus = () =>
    save.mutate(
      {
        id: d.id,
        input: {
          title: d.title,
          description: d.description,
          targetMinutes: d.targetMinutes,
          startDate: d.startDate,
          dueDate: d.dueDate,
          status: done ? 'ativa' : 'concluida',
        },
      },
      {
        onSuccess: () => toast(done ? 'Demanda reaberta.' : 'Demanda concluída.'),
        onError: (err) => toast(err.message, 'error'),
      },
    );

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
          <h3 className={`font-semibold text-ink ${done ? 'line-through decoration-ink-3' : ''}`}>{d.title}</h3>
          {d.description && <p className="mt-0.5 line-clamp-2 text-sm text-ink-2">{d.description}</p>}
        </div>
        <DeadlineBadge status={m.deadline} />
      </div>

      <div className="mt-4">
        <DemandProgressBar metrics={m} height={10} />
        <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-2">
          <DemandHoursCaption metrics={m} />
          <span className="text-xs text-ink-3">{PROGRESS_LABEL[m.progress]}</span>
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
        <Stat label="Ritmo necessário">
          {m.requiredPerDay ? (
            <>
              {formatDuration(m.requiredPerDay)}
              <span className="block text-xs font-normal text-ink-3">por dia útil</span>
            </>
          ) : (
            <span className="text-ink-3">—</span>
          )}
        </Stat>
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
          {open ? 'Ocultar apontamentos' : 'Ver apontamentos'}
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

      {open && <DemandActivities id={d.id} />}
    </li>
  );
}

/** Apontamentos vinculados, carregados só quando o cartão é expandido. */
function DemandActivities({ id }: { id: number }) {
  const detail = useDemand(id);
  if (detail.isPending) return <Skeleton className="mt-3 h-20" />;
  if (detail.isError) return <p className="mt-3 text-sm text-critical-text">{detail.error.message}</p>;
  const acts = detail.data.activities;

  if (acts.length === 0) {
    return (
      <p className="mt-3 rounded-xl bg-surface-2 px-3 py-3 text-sm text-ink-2">
        Nenhum apontamento ainda. Ao registrar uma atividade, escolha esta demanda no campo “Demanda”.
      </p>
    );
  }
  return (
    <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
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
        {filter === 'concluida' ? 'Nenhuma demanda concluída' : 'Nenhuma demanda por aqui'}
      </p>
      <p className="mt-1 max-w-xs text-sm text-ink-2">
        {filter === 'concluida'
          ? 'Demandas marcadas como concluídas aparecem nesta lista.'
          : 'Crie uma demanda com a meta de horas e, se quiser, a data de conclusão. Depois, vincule suas atividades a ela.'}
      </p>
    </div>
  );
}
