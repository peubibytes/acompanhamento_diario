import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import {
  DEMAND_CATEGORIES,
  DEMAND_CATEGORY_LABEL,
  DEMAND_CATEGORY_PLURAL,
  DEMAND_ENVIRONMENT_LABEL,
  demandInputOf,
  formatDayMonth,
  formatDuration,
  isOpenDemand,
  ROUTINE_CATEGORIES,
  ROUTINE_STATUS_LABEL,
  ROUTINE_STATUSES,
  WEEKDAY_SHORT,
  weekdayOf,
  type CycleStatus,
  type DemandCategory,
  type DemandSummary,
  type RoutineCategory,
  type RoutineStatus,
} from '@acomp/shared';
import { useDeleteDemand, useDemands, useSaveDemand } from '../api/client';
import { ActivityHistory, CycleTracking, IconButton } from '../components/DemandHistory';
import { DemandForm } from '../components/DemandForms';
import {
  CategoryAvatar,
  categoryIcon,
  CycleStatusBadge,
  DeadlineBadge,
  DemandFlags,
  LoggedSummary,
  routineStatusStyle,
} from '../components/DemandVisuals';
import { BellIcon, CheckIcon, ChevronDown, ListIcon, PencilIcon, PlusIcon, TargetIcon, TrashIcon, UndoIcon } from '../components/icons';
import { Segmented } from '../components/Segmented';
import { ErrorState, Skeleton } from '../components/States';
import { useToast } from '../components/Toast';

type StatusFilter = 'abertas' | 'encerradas' | 'todas';

const isCategory = (v: string | null): v is DemandCategory => DEMAND_CATEGORIES.includes(v as DemandCategory);

/** Textos de cada tipo: rótulo do filtro e estado vazio. */
const COPY: Record<DemandCategory, { open: string; closed: string; empty: string; hint: string }> = {
  ciclo: {
    open: 'Abertos',
    closed: 'Encerrados',
    empty: 'Nenhum ciclo por aqui',
    hint: 'Declare trabalhos longos, com prazo e prioridade, e acompanhe a linha do tempo e os impedimentos.',
  },
  chamado: {
    open: 'Em aberto',
    closed: 'Concluídos',
    empty: 'Nenhum chamado por aqui',
    hint: 'Declare cada chamado uma vez, com número, descrição e status. O tempo gasto nele vai para Apontamentos.',
  },
  reuniao: {
    open: '',
    closed: '',
    empty: 'Nenhuma reunião declarada',
    hint: 'Declare as reuniões, como a Daily, uma única vez. Cada ocorrência é registrada em Apontamentos.',
  },
  treinamento: {
    open: 'Em aberto',
    closed: 'Concluídos',
    empty: 'Nenhum treinamento por aqui',
    hint: 'Declare os treinamentos que você faz ou vai fazer. As horas de estudo vão para Apontamentos.',
  },
};

const REMOVED: Record<DemandCategory, string> = {
  ciclo: 'Ciclo excluído.',
  chamado: 'Chamado excluído.',
  reuniao: 'Reunião excluída.',
  treinamento: 'Treinamento excluído.',
};

const matches = (d: DemandSummary, f: StatusFilter) => f === 'todas' || (f === 'abertas') === isOpenDemand(d);

export function Demands() {
  const demands = useDemands();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { hash } = useLocation();
  const tipo = params.get('tipo');
  const category: DemandCategory = isCategory(tipo) ? tipo : 'chamado';
  const section = category === 'ciclo' ? 'ciclo' : 'atividades';

  const [lastRoutine, setLastRoutine] = useState<RoutineCategory>(category === 'ciclo' ? 'chamado' : category);
  const [filter, setFilter] = useState<StatusFilter>('abertas');
  const [editingId, setEditingId] = useState<number | null>(null);
  const formRef = useRef<HTMLElement>(null);

  const all = demands.data ?? [];
  const ofCategory = all.filter((d) => d.category === category);
  const hasStatus = category !== 'reuniao';
  const list = hasStatus ? ofCategory.filter((d) => matches(d, filter)) : ofCategory;
  const editing = ofCategory.find((d) => d.id === editingId);

  const chooseCategory = (next: DemandCategory) => {
    setEditingId(null);
    setFilter('abertas');
    if (next !== 'ciclo') setLastRoutine(next);
    setParams(
      (p) => {
        p.set('tipo', next);
        return p;
      },
      { replace: true },
    );
  };

  // Links para uma demanda (#demanda-ID, vindos do painel e dos lembretes) abrem o tipo
  // certo, mostram a demanda mesmo se encerrada e rolam até o cartão.
  useEffect(() => {
    const id = Number(/^#demanda-(\d+)$/.exec(hash)?.[1]);
    const target = id ? demands.data?.find((d) => d.id === id) : undefined;
    if (!target) return;
    if (target.category !== category) {
      navigate({ search: `?tipo=${target.category}`, hash }, { replace: true });
      return;
    }
    if (!matches(target, filter)) setFilter('todas');
    requestAnimationFrame(() =>
      document.getElementById(`demanda-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
    );
  }, [hash, demands.data, category]);

  const startEditing = (id: number) => {
    setEditingId(id);
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const openCount = (cats: readonly DemandCategory[]) =>
    all.filter((d) => cats.includes(d.category) && isOpenDemand(d)).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">Demandas</h1>
        <p className="mt-1 text-sm text-ink-2">
          Declare o que você faz. O tempo gasto é registrado depois, em Apontamentos.
        </p>
      </div>

      <div role="tablist" aria-label="Família de demandas" className="grid grid-cols-2 gap-3">
        <SectionCard
          on={section === 'atividades'}
          onClick={() => chooseCategory(lastRoutine)}
          icon={<ListIcon size={20} />}
          title="Atividades"
          description="Chamados, reuniões e treinamentos do dia a dia"
          count={demands.data ? `${openCount(ROUTINE_CATEGORIES)} em aberto` : undefined}
        />
        <SectionCard
          on={section === 'ciclo'}
          onClick={() => chooseCategory('ciclo')}
          icon={<TargetIcon size={20} />}
          title="Ciclo"
          description="Trabalhos longos, com prazo, prioridade e acompanhamento"
          count={demands.data ? `${openCount(['ciclo'])} abertos` : undefined}
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {section === 'atividades' ? (
          <div className="overflow-x-auto">
            <Segmented
              label="Tipo de atividade"
              value={category as RoutineCategory}
              onChange={chooseCategory}
              options={ROUTINE_CATEGORIES.map((c) => ({
                value: c,
                label: DEMAND_CATEGORY_PLURAL[c],
                icon: categoryIcon[c](15),
                count: demands.data ? all.filter((d) => d.category === c).length : undefined,
              }))}
            />
          </div>
        ) : (
          <h2 className="text-lg font-semibold text-ink">Ciclos</h2>
        )}
        {hasStatus && (
          <Segmented
            label="Filtrar por status"
            size="sm"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'abertas', label: COPY[category].open, count: ofCategory.filter((d) => isOpenDemand(d)).length },
              { value: 'encerradas', label: COPY[category].closed, count: ofCategory.filter((d) => !isOpenDemand(d)).length },
              { value: 'todas', label: 'Todos', count: ofCategory.length },
            ]}
          />
        )}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-5">
        <section className="space-y-3 lg:col-span-3" aria-label={DEMAND_CATEGORY_PLURAL[category]}>
          {demands.isPending ? (
            <>
              <Skeleton className="h-36" />
              <Skeleton className="h-36" />
            </>
          ) : demands.isError ? (
            <ErrorState message={demands.error.message} onRetry={() => demands.refetch()} />
          ) : list.length === 0 ? (
            <EmptyList category={category} filtered={ofCategory.length > 0} />
          ) : (
            <ul className="space-y-3">
              {list.map((d) =>
                d.category === 'ciclo' ? (
                  <CycleCard
                    key={d.id}
                    demand={d}
                    highlighted={hash === `#demanda-${d.id}`}
                    isEditing={d.id === editingId}
                    onEdit={() => startEditing(d.id)}
                    onDeleted={() => d.id === editingId && setEditingId(null)}
                  />
                ) : (
                  <RoutineCard
                    key={d.id}
                    demand={d}
                    highlighted={hash === `#demanda-${d.id}`}
                    isEditing={d.id === editingId}
                    onEdit={() => startEditing(d.id)}
                    onDeleted={() => d.id === editingId && setEditingId(null)}
                  />
                ),
              )}
            </ul>
          )}
        </section>

        <aside ref={formRef} className="card scroll-mt-24 p-5 sm:p-6 lg:sticky lg:top-24 lg:col-span-2">
          <h2 className="mb-4 flex items-center gap-2.5 text-base font-semibold text-ink">
            <CategoryAvatar category={category} size={30} />
            {editing ? `Editar ${DEMAND_CATEGORY_LABEL[category].toLowerCase()}` : `Declarar ${DEMAND_CATEGORY_LABEL[category].toLowerCase()}`}
          </h2>
          <DemandForm
            key={`${category}-${editing?.id ?? 'nova'}`}
            category={category}
            editing={editing}
            onDone={() => setEditingId(null)}
          />
        </aside>
      </div>
    </div>
  );
}

function SectionCard({
  on,
  onClick,
  icon,
  title,
  description,
  count,
}: {
  on: boolean;
  onClick: () => void;
  icon: ReactNode;
  title: string;
  description: string;
  count?: string;
}) {
  return (
    <button
      role="tab"
      aria-selected={on}
      onClick={onClick}
      className={`flex items-start gap-3 rounded-2xl border p-3 text-left transition sm:p-4 ${
        on ? 'border-accent bg-surface shadow-sm ring-2 ring-accent-soft' : 'border-line bg-surface/60 hover:bg-surface'
      }`}
    >
      <span
        className={`grid size-10 shrink-0 place-items-center rounded-xl ${on ? 'bg-accent text-on-accent' : 'bg-surface-2 text-ink-2'}`}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className={`block font-semibold ${on ? 'text-accent' : 'text-ink'}`}>{title}</span>
        <span className="mt-0.5 hidden text-xs leading-snug text-ink-3 sm:block">{description}</span>
        {count && <span className="tabular mt-1 block text-xs font-medium text-ink-2">{count}</span>}
      </span>
    </button>
  );
}

interface CardProps {
  demand: DemandSummary;
  highlighted: boolean;
  isEditing: boolean;
  onEdit: () => void;
  onDeleted: () => void;
}

/** Chamado, reunião ou treinamento: o que é, status e quanto já foi apontado nele. */
function RoutineCard({ demand: d, highlighted, isEditing, onEdit, onDeleted }: CardProps) {
  const [open, setOpen] = useState(false);
  const closed = !isOpenDemand(d);

  return (
    <li
      id={`demanda-${d.id}`}
      className={`card rise scroll-mt-24 p-4 transition sm:p-5 ${isEditing || highlighted ? 'ring-2 ring-accent' : ''} ${
        closed ? 'opacity-80' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        <CategoryAvatar category={d.category} size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              {d.category === 'reuniao' && (
                <p className="text-[11px] font-semibold tracking-wider text-accent uppercase">{d.meetingType}</p>
              )}
              <h3
                className={`font-semibold text-ink ${d.category === 'chamado' ? 'tabular tracking-wide' : ''} ${
                  closed ? 'line-through decoration-ink-3' : ''
                }`}
              >
                {d.category === 'reuniao' ? d.subject : d.label}
              </h3>
              {d.category === 'reuniao' && <p className="text-sm text-ink-2">com {d.participants}</p>}
            </div>
            {(d.category === 'chamado' || d.category === 'treinamento') && (
              <RoutineStatusSelect demand={d} status={d.status} />
            )}
          </div>
          {d.category !== 'reuniao' && d.description && (
            <p className="mt-2 line-clamp-3 text-sm whitespace-pre-line text-ink-2">{d.description}</p>
          )}
        </div>
      </div>

      <CardFooter demand={d} onEdit={onEdit} onDeleted={onDeleted}>
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          disabled={d.metrics.activityCount === 0}
          className="inline-flex min-w-0 items-center gap-1.5 text-left disabled:cursor-default"
        >
          {d.metrics.activityCount > 0 && (
            <ChevronDown size={16} className={`shrink-0 text-ink-3 transition ${open ? 'rotate-180' : ''}`} />
          )}
          <LoggedSummary metrics={d.metrics} />
        </button>
      </CardFooter>

      {open && <ActivityHistory id={d.id} />}
    </li>
  );
}

/** Troca rápida do status de chamados e treinamentos, direto no cartão. */
function RoutineStatusSelect({ demand, status }: { demand: DemandSummary; status: RoutineStatus }) {
  const save = useSaveDemand();
  const toast = useToast();
  const style = routineStatusStyle[status];
  const change = (next: RoutineStatus) => {
    const input = demandInputOf(demand);
    if (input.category !== 'chamado' && input.category !== 'treinamento') return;
    save.mutate(
      { id: demand.id, input: { ...input, status: next } },
      {
        onSuccess: () => toast(`Status: ${ROUTINE_STATUS_LABEL[next]}.`),
        onError: (err) => toast(err.message, 'error'),
      },
    );
  };
  return (
    <label className={`relative inline-flex shrink-0 items-center gap-1.5 rounded-full py-1 pr-1 pl-2.5 text-xs font-medium ${style.badge}`}>
      {style.icon(13)}
      <span className="sr-only">Status</span>
      <select
        value={status}
        disabled={save.isPending}
        onChange={(e) => change(e.target.value as RoutineStatus)}
        className="cursor-pointer appearance-none bg-transparent pr-5 font-medium outline-none [&>option]:bg-surface [&>option]:text-ink"
      >
        {ROUTINE_STATUSES.map((s) => (
          <option key={s} value={s}>
            {ROUTINE_STATUS_LABEL[s]}
          </option>
        ))}
      </select>
      <ChevronDown size={12} className="pointer-events-none absolute right-2" />
    </label>
  );
}

const dayLabel = (iso: string) => `${WEEKDAY_SHORT[weekdayOf(iso)]} ${formatDayMonth(iso)}`;

/** Ciclo: prazo, status, prioridade, horas apontadas, espera e o acompanhamento em abas. */
function CycleCard({ demand: d, highlighted, isEditing, onEdit, onDeleted }: CardProps) {
  const save = useSaveDemand();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  if (d.category !== 'ciclo') return null;
  const m = d.metrics;
  const t = d.tracking;
  const done = !isOpenDemand(d);

  const setStatus = (status: CycleStatus, message: string) => {
    const input = demandInputOf(d);
    if (input.category !== 'ciclo') return;
    save.mutate(
      { id: d.id, input: { ...input, status } },
      { onSuccess: () => toast(message), onError: (err) => toast(err.message, 'error') },
    );
  };

  return (
    <li
      id={`demanda-${d.id}`}
      className={`card rise scroll-mt-24 p-4 transition sm:p-5 ${isEditing || highlighted ? 'ring-2 ring-accent' : ''} ${
        done ? 'opacity-80' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        <CategoryAvatar category="ciclo" size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className={`min-w-0 font-semibold text-ink ${done ? 'line-through decoration-ink-3' : ''}`}>{d.title}</h3>
            <DeadlineBadge status={m.deadline} />
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <CycleStatusBadge status={d.status} />
            <DemandFlags kind={d.kind} priority={d.priority} />
            {d.environment && (
              <span className="inline-flex items-center rounded-full bg-neutral-soft px-2.5 py-1 text-xs font-medium text-ink-2">
                {DEMAND_ENVIRONMENT_LABEL[d.environment]}
              </span>
            )}
          </div>
          {d.description && <p className="mt-2 line-clamp-2 text-sm whitespace-pre-line text-ink-2">{d.description}</p>}
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Início">{dayLabel(d.startDate)}</Stat>
        <Stat label="Prazo">
          {d.dueDate ? (
            <>
              {dayLabel(d.dueDate)}
              {m.deadline === 'atrasada' ? (
                <span className="block text-xs font-medium text-critical-text">prazo vencido</span>
              ) : (
                m.workdaysLeft !== null && (
                  <span className="block text-xs font-normal text-ink-3">
                    {m.workdaysLeft === 1 ? '1 dia útil' : `${m.workdaysLeft} dias úteis`}
                  </span>
                )
              )}
            </>
          ) : (
            <span className="text-ink-3">Sem prazo</span>
          )}
        </Stat>
        <Stat label="Apontado">
          {m.activityCount === 0 ? (
            <span className="text-ink-3">—</span>
          ) : (
            <>
              {formatDuration(m.logged)}
              <span className="block text-xs font-normal text-ink-3">
                {m.activityCount === 1 ? '1 apontamento' : `${m.activityCount} apontamentos`}
              </span>
            </>
          )}
        </Stat>
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
      </dl>

      {m.reminder && (
        <p
          role="alert"
          className={`mt-4 flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm ${
            m.deadline === 'atrasada' ? 'bg-critical-soft text-critical-text' : 'bg-warning-soft text-warning-text'
          }`}
        >
          <BellIcon size={16} className="mt-0.5 shrink-0" />
          {m.reminder}
        </p>
      )}

      <CardFooter
        demand={d}
        onEdit={onEdit}
        onDeleted={onDeleted}
        extra={
          <button
            onClick={() =>
              done ? setStatus('em_andamento', 'Ciclo reaberto.') : setStatus('concluido', 'Ciclo concluído.')
            }
            disabled={save.isPending}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              done ? 'text-ink-2 hover:bg-surface-2' : 'bg-good-soft text-good-text hover:brightness-95'
            }`}
          >
            {done ? <UndoIcon size={14} /> : <CheckIcon size={14} />}
            {done ? 'Reabrir' : 'Concluir'}
          </button>
        }
      >
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="inline-flex items-center gap-1 text-sm font-medium text-ink-2 hover:text-ink"
        >
          <ChevronDown size={16} className={`transition ${open ? 'rotate-180' : ''}`} />
          {open ? 'Ocultar acompanhamento' : 'Acompanhamento'}
          {t.eventCount > 0 && <span className="tabular text-xs text-ink-3">({t.eventCount})</span>}
        </button>
      </CardFooter>

      {open && <CycleTracking id={d.id} />}
    </li>
  );
}

/**
 * Rodapé comum: à esquerda o resumo (ou o botão de acompanhamento), à direita editar e excluir.
 * Demanda com apontamentos não pode ser excluída: as horas ficariam sem dono.
 */
function CardFooter({
  demand: d,
  onEdit,
  onDeleted,
  extra,
  children,
}: {
  demand: DemandSummary;
  onEdit: () => void;
  onDeleted: () => void;
  extra?: ReactNode;
  children: ReactNode;
}) {
  const remove = useDeleteDemand();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const count = d.metrics.activityCount;

  const doRemove = () =>
    remove.mutate(d.id, {
      onSuccess: () => {
        onDeleted();
        toast(REMOVED[d.category]);
      },
      onError: (err) => {
        setConfirming(false);
        toast(err.message, 'error');
      },
    });

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
      <div className="min-w-0">{children}</div>
      <div className="flex items-center gap-1">
        {confirming ? (
          count > 0 ? (
            <>
              <span className="mr-1 max-w-56 text-xs text-ink-2">
                Tem {count === 1 ? '1 apontamento' : `${count} apontamentos`}. Exclua-os ou aponte em outra demanda antes.
              </span>
              <button
                onClick={() => setConfirming(false)}
                className="rounded-full px-3 py-1 text-xs font-semibold text-ink-2 hover:bg-surface-2"
              >
                Entendi
              </button>
            </>
          ) : (
            <>
              <span className="mr-1 text-xs text-ink-2">Excluir?</span>
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
          )
        ) : (
          <>
            {extra}
            <IconButton label="Editar" onClick={onEdit}>
              <PencilIcon size={16} />
            </IconButton>
            <IconButton label="Excluir" onClick={() => setConfirming(true)}>
              <TrashIcon size={16} />
            </IconButton>
          </>
        )}
      </div>
    </div>
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

function EmptyList({ category, filtered }: { category: DemandCategory; filtered: boolean }) {
  return (
    <div className="card flex flex-col items-center px-6 py-12 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-accent-soft text-accent">
        {filtered ? <PlusIcon size={22} /> : categoryIcon[category](22)}
      </span>
      <p className="mt-3 font-semibold text-ink">{filtered ? 'Nada com este filtro' : COPY[category].empty}</p>
      <p className="mt-1 max-w-sm text-sm text-ink-2">
        {filtered ? 'Troque o filtro acima para ver as demais declarações.' : COPY[category].hint}
      </p>
    </div>
  );
}
