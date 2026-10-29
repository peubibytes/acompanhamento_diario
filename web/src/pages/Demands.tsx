import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import {
  DEMAND_CATEGORIES,
  DEMAND_CATEGORY_PLURAL,
  DEMAND_ENVIRONMENT_LABEL,
  DEMAND_KIND_LABEL,
  DEMAND_PRIORITY_LABEL,
  demandInputOf,
  formatDayMonth,
  formatDuration,
  isOpenDemand,
  TASK_CATEGORIES,
  TASK_STATUS_LABEL,
  TASK_STATUSES,
  WEEKDAY_SHORT,
  weekdayOf,
  type CycleStatus,
  type DemandCategory,
  type DemandSummary,
  type TaskCategory,
  type TaskStatus,
} from '@acomp/shared';
import { useDeleteDemand, useDemands, useSaveDemand } from '../api/client';
import { ActivityHistory, CycleTracking, IconButton } from '../components/DemandHistory';
import { DemandForm } from '../components/DemandForms';
import { categoryIcon, CycleStatusBadge, DeadlineBadge, taskStatusStyle } from '../components/DemandVisuals';
import { FilterSelect } from '../components/FilterSelect';
import { CheckIcon, ChevronDown, HourglassIcon, PencilIcon, PlusIcon, TrashIcon, UndoIcon } from '../components/icons';
import { PageHeader } from '../components/PageHeader';
import { Segmented } from '../components/Segmented';
import { SlideOver } from '../components/SlideOver';
import { ErrorState, Skeleton } from '../components/States';
import { useToast } from '../components/Toast';

type StatusFilter = 'abertas' | 'encerradas' | 'todas';
type Tab = 'tarefas' | 'ciclo';
/** O formulário aberto no painel: declarar uma demanda do tipo atual ou editar uma existente. */
type Panel = { mode: 'new'; category: DemandCategory } | { mode: 'edit'; id: number };

const isCategory = (v: string | null): v is DemandCategory => DEMAND_CATEGORIES.includes(v as DemandCategory);

const NOUN: Record<DemandCategory, string> = {
  ciclo: 'ciclo',
  chamado: 'chamado',
  reuniao: 'reunião',
  treinamento: 'treinamento',
};

const EMPTY: Record<DemandCategory, string> = {
  ciclo: 'Nenhum ciclo por aqui',
  chamado: 'Nenhum chamado por aqui',
  reuniao: 'Nenhuma reunião declarada',
  treinamento: 'Nenhum treinamento por aqui',
};

const REMOVED: Record<DemandCategory, string> = {
  ciclo: 'Ciclo excluído.',
  chamado: 'Chamado excluído.',
  reuniao: 'Reunião excluída.',
  treinamento: 'Treinamento excluído.',
};

const matches = (d: DemandSummary, f: StatusFilter) => f === 'todas' || (f === 'abertas') === isOpenDemand(d);
const dayLabel = (iso: string) => `${WEEKDAY_SHORT[weekdayOf(iso)]} ${formatDayMonth(iso)}`;

const PAGE_HINT = (
  <>
    <span className="block">Declare o que você faz. O tempo gasto é registrado depois, em Apontamentos.</span>
    <span className="mt-1.5 block">
      <strong className="font-semibold text-ink">Tarefas:</strong> chamados, reuniões e treinamentos do dia a dia.
      Cada um é declarado uma vez e apontado a cada ocorrência.
    </span>
    <span className="mt-1.5 block">
      <strong className="font-semibold text-ink">Ciclo:</strong> trabalhos longos, com prazo, prioridade, linha do tempo
      e impedimentos.
    </span>
  </>
);

export function Demands() {
  const demands = useDemands();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { hash } = useLocation();
  const tipo = params.get('tipo');
  const category: DemandCategory = isCategory(tipo) ? tipo : 'chamado';
  const tab: Tab = category === 'ciclo' ? 'ciclo' : 'tarefas';

  const [lastTask, setLastTask] = useState<TaskCategory>(category === 'ciclo' ? 'chamado' : category);
  const [filter, setFilter] = useState<StatusFilter>('abertas');
  const [panel, setPanel] = useState<Panel | null>(null);
  const [dirty, setDirty] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const handledHash = useRef<string | null>(null);

  const all = demands.data ?? [];
  const ofCategory = all.filter((d) => d.category === category);
  const hasStatus = category !== 'reuniao';
  const list = hasStatus ? ofCategory.filter((d) => matches(d, filter)) : ofCategory;
  const editing = panel?.mode === 'edit' ? all.find((d) => d.id === panel.id) : undefined;
  const panelCategory = panel?.mode === 'new' ? panel.category : editing?.category;
  const openCount = (cats: readonly DemandCategory[]) => all.filter((d) => cats.includes(d.category) && isOpenDemand(d)).length;

  const chooseCategory = (next: DemandCategory) => {
    setPanel(null);
    setExpandedId(null);
    setFilter('abertas');
    if (next !== 'ciclo') setLastTask(next);
    setParams(
      (p) => {
        p.set('tipo', next);
        return p;
      },
      { replace: true },
    );
  };

  // Links para uma demanda (#demanda-ID, vindos do painel, dos lembretes e dos apontamentos) abrem
  // o tipo certo, mostram a demanda mesmo se encerrada, a expandem e rolam até ela — uma vez por link.
  useEffect(() => {
    const id = Number(/^#demanda-(\d+)$/.exec(hash)?.[1]);
    const target = id ? demands.data?.find((d) => d.id === id) : undefined;
    if (!target || handledHash.current === hash) return;
    if (target.category !== category) {
      navigate({ search: `?tipo=${target.category}`, hash }, { replace: true });
      return;
    }
    handledHash.current = hash;
    if (!matches(target, filter)) setFilter('todas');
    setExpandedId(target.id);
    requestAnimationFrame(() =>
      document.getElementById(`demanda-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
    );
  }, [hash, demands.data, category]);

  const open = (next: Panel) => {
    setDirty(false);
    setPanel(next);
  };
  const close = () => setPanel(null);

  return (
    <div className="space-y-section">
      <PageHeader
        title="Demandas"
        hint={PAGE_HINT}
        action={
          <button type="button" onClick={() => open({ mode: 'new', category })} className="btn-primary">
            <PlusIcon size={18} /> Declarar {NOUN[category]}
          </button>
        }
      />

      {/* Uma barra só: a família (Tarefas | Ciclo), o tipo da tarefa (menu) e o status. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-3">
        <Segmented
          label="Família de demandas"
          value={tab}
          onChange={(next) => chooseCategory(next === 'ciclo' ? 'ciclo' : lastTask)}
          stretch
          options={[
            { value: 'tarefas', label: 'Tarefas', count: demands.data ? openCount(TASK_CATEGORIES) : undefined },
            { value: 'ciclo', label: 'Ciclo', count: demands.data ? openCount(['ciclo']) : undefined },
          ]}
        />
        {tab === 'tarefas' && (
          <FilterSelect
            label="Tipo de tarefa"
            value={category as TaskCategory}
            onChange={chooseCategory}
            options={TASK_CATEGORIES.map((c) => ({
              value: c,
              label: `${DEMAND_CATEGORY_PLURAL[c]}${demands.data ? ` (${all.filter((d) => d.category === c).length})` : ''}`,
            }))}
          />
        )}
        {hasStatus && (
          <div className="sm:ml-auto">
            <Segmented
              label="Filtrar por status"
              size="sm"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'abertas', label: 'Em aberto', count: ofCategory.filter((d) => isOpenDemand(d)).length },
                { value: 'encerradas', label: 'Encerrados', count: ofCategory.filter((d) => !isOpenDemand(d)).length },
                { value: 'todas', label: 'Todos', count: ofCategory.length },
              ]}
            />
          </div>
        )}
      </div>

      <section aria-label={DEMAND_CATEGORY_PLURAL[category]}>
        {demands.isPending ? (
          <div className="space-y-2">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        ) : demands.isError ? (
          <ErrorState message={demands.error.message} onRetry={() => demands.refetch()} />
        ) : list.length === 0 ? (
          <EmptyList category={category} filtered={ofCategory.length > 0} />
        ) : (
          <ul className="card divide-y divide-line">
            {list.map((d) => (
              <DemandRow
                key={d.id}
                demand={d}
                expanded={expandedId === d.id}
                highlighted={hash === `#demanda-${d.id}`}
                onToggle={() => setExpandedId((id) => (id === d.id ? null : d.id))}
                onEdit={() => open({ mode: 'edit', id: d.id })}
                onDeleted={() => setExpandedId((id) => (id === d.id ? null : id))}
              />
            ))}
          </ul>
        )}
      </section>

      <SlideOver
        open={panel !== null && panelCategory !== undefined}
        onClose={close}
        dirty={dirty}
        title={panelCategory ? `${panel?.mode === 'edit' ? 'Editar' : 'Declarar'} ${NOUN[panelCategory]}` : ''}
      >
        {panelCategory && (
          <DemandForm
            category={panelCategory}
            editing={editing}
            onDone={close}
            onDirtyChange={setDirty}
          />
        )}
      </SlideOver>
    </div>
  );
}

interface RowProps {
  demand: DemandSummary;
  expanded: boolean;
  highlighted: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDeleted: () => void;
}

/**
 * Uma linha: título, status, prazo e horas apontadas. Descrição, identificadores, ambiente e o
 * acompanhamento (linha do tempo, impedimentos, apontamentos) aparecem ao expandir; um resumo
 * da descrição aparece ao passar o mouse. Editar e excluir aparecem no hover (celular: expandido).
 */
function DemandRow(row: RowProps) {
  const { demand: d, expanded, highlighted, onToggle } = row;
  const detailId = useId();
  const open = isOpenDemand(d);
  const preview = d.category === 'reuniao' ? `com ${d.participants}` : d.category === 'ciclo' || d.category === 'chamado' || d.category === 'treinamento' ? d.description : '';

  return (
    <li id={`demanda-${d.id}`} className={`group scroll-mt-24 ${highlighted ? 'bg-surface-2/70' : ''}`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-0 pr-3 sm:flex-nowrap">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={detailId}
          onClick={onToggle}
          className="group/title relative flex min-w-0 flex-1 basis-56 items-center gap-3 rounded-xl px-3 py-3 text-left outline-none transition hover:bg-surface-2/60 focus-visible:ring-2 focus-visible:ring-accent"
        >
          <ChevronDown size={15} className={`shrink-0 text-ink-3 transition ${expanded ? '' : '-rotate-90'}`} />
          <span className="shrink-0 text-ink-3">{categoryIcon[d.category](16)}</span>
          <span
            className={`min-w-0 truncate text-sm font-semibold text-ink ${d.category === 'chamado' ? 'tabular tracking-wide' : ''} ${
              open ? '' : 'line-through decoration-ink-3'
            }`}
          >
            {d.label}
          </span>
          {preview && !expanded && (
            <span
              role="tooltip"
              className="tip-surface pointer-events-none absolute top-full left-9 z-20 mt-1 hidden max-w-sm p-3 text-xs leading-relaxed whitespace-pre-line text-ink-2 group-hover/title:block group-focus-visible/title:block"
            >
              <span className="line-clamp-4">{preview}</span>
            </span>
          )}
        </button>

        {/* No celular o grupo vai para baixo do título e pode quebrar de linha; a partir de sm, uma linha só. */}
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-x-3 gap-y-2 pb-3 pl-9 sm:shrink-0 sm:flex-nowrap sm:pb-0 sm:pl-0">
          <RowStatus demand={d} />
          <Logged demand={d} />
        </div>

        <DemandActions
          {...row}
          className="hidden sm:flex sm:opacity-0 sm:transition sm:group-focus-within:opacity-100 sm:group-hover:opacity-100"
        />
      </div>

      {expanded && (
        <div id={detailId} className="space-y-4 px-3 pb-5 sm:pl-12">
          <Details demand={d} />
          <DemandActions {...row} className="flex sm:hidden" />
          {d.category === 'ciclo' ? <CycleTracking id={d.id} /> : <ActivityHistory id={d.id} />}
        </div>
      )}
    </li>
  );
}

/** Status e, nos ciclos, o prazo (só enquanto aberto e com data). Reuniões não têm status. */
function RowStatus({ demand: d }: { demand: DemandSummary }) {
  if (d.category === 'chamado' || d.category === 'treinamento') return <TaskStatusSelect demand={d} status={d.status} />;
  if (d.category !== 'ciclo') return null;
  const m = d.metrics;
  return (
    <>
      <CycleStatusBadge status={d.status} />
      {d.tracking.openBlockers > 0 && (
        <span
          className="inline-flex shrink-0 items-center text-warning-text"
          title={d.tracking.openBlockers === 1 ? '1 impedimento aberto' : `${d.tracking.openBlockers} impedimentos abertos`}
        >
          <HourglassIcon size={15} />
          <span className="sr-only">{d.tracking.openBlockers === 1 ? '1 impedimento aberto' : `${d.tracking.openBlockers} impedimentos abertos`}</span>
        </span>
      )}
      {isOpenDemand(d) && d.dueDate && (
        <span className="flex items-center gap-2">
          <DeadlineBadge status={m.deadline} />
          <span className="tabular hidden text-xs text-ink-3 lg:inline">{dayLabel(d.dueDate)}</span>
        </span>
      )}
    </>
  );
}

/** Horas apontadas na demanda (sobreposições contadas uma vez). */
function Logged({ demand: d }: { demand: DemandSummary }) {
  const m = d.metrics;
  const text = m.activityCount === 0 ? 'Nenhum apontamento' : `${m.activityCount} ${m.activityCount === 1 ? 'apontamento' : 'apontamentos'}`;
  return (
    <span className="tabular w-14 shrink-0 text-right text-sm font-semibold text-ink" title={text}>
      {m.activityCount === 0 ? <span className="font-normal text-ink-3">—</span> : formatDuration(m.logged)}
      <span className="sr-only"> ({text})</span>
    </span>
  );
}

/** Troca rápida do status de chamados e treinamentos, direto na linha. */
function TaskStatusSelect({ demand, status }: { demand: DemandSummary; status: TaskStatus }) {
  const save = useSaveDemand();
  const toast = useToast();
  const style = taskStatusStyle[status];
  const change = (next: TaskStatus) => {
    const input = demandInputOf(demand);
    if (input.category !== 'chamado' && input.category !== 'treinamento') return;
    save.mutate(
      { id: demand.id, input: { ...input, status: next } },
      {
        onSuccess: () => toast(`Status: ${TASK_STATUS_LABEL[next]}.`),
        onError: (err) => toast(err.message, 'error'),
      },
    );
  };
  return (
    <label
      className={`relative inline-flex shrink-0 items-center gap-1.5 rounded-full py-1 pr-1 pl-2.5 text-xs font-medium has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent ${style.badge}`}
    >
      {style.icon(13)}
      <span className="sr-only">Status</span>
      <select
        value={status}
        disabled={save.isPending}
        onChange={(e) => change(e.target.value as TaskStatus)}
        className="cursor-pointer appearance-none bg-transparent pr-5 font-medium outline-none [&>option]:bg-surface [&>option]:text-ink"
      >
        {TASK_STATUSES.map((s) => (
          <option key={s} value={s}>
            {TASK_STATUS_LABEL[s]}
          </option>
        ))}
      </select>
      <ChevronDown size={12} className="pointer-events-none absolute right-2" />
    </label>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-2xs font-semibold tracking-wider text-ink-3 uppercase">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink">{children}</dd>
    </div>
  );
}

/** O que a linha não mostra: descrição, tipo, prioridade, datas, ambiente e vínculos técnicos. */
function Details({ demand: d }: { demand: DemandSummary }) {
  return (
    <>
      {d.category === 'ciclo' && (
        <dl className="flex flex-wrap gap-x-8 gap-y-3">
          <Field label="Tipo">{DEMAND_KIND_LABEL[d.kind]}</Field>
          <Field label="Prioridade">{DEMAND_PRIORITY_LABEL[d.priority]}</Field>
          <Field label="Início">{dayLabel(d.startDate)}</Field>
          <Field label="Prazo">{d.dueDate ? dayLabel(d.dueDate) : 'Sem prazo'}</Field>
          {d.environment && <Field label="Ambiente">{DEMAND_ENVIRONMENT_LABEL[d.environment]}</Field>}
          {d.branch && (
            <Field label="Branch">
              <span className="tabular">{d.branch}</span>
            </Field>
          )}
          {d.prUrl && (
            <Field label="PR">
              <a href={d.prUrl} target="_blank" rel="noreferrer noopener" className="text-accent hover:underline">
                Abrir
              </a>
            </Field>
          )}
        </dl>
      )}
      {d.category === 'reuniao' && (
        <dl className="flex flex-wrap gap-x-8 gap-y-3">
          <Field label="Tipo">{d.meetingType}</Field>
          <Field label="Com quem">{d.participants}</Field>
          <Field label="Assunto">{d.subject}</Field>
        </dl>
      )}
      {d.category !== 'reuniao' && d.description && (
        <p className="text-sm whitespace-pre-line text-ink-2">{d.description}</p>
      )}
    </>
  );
}

/** Concluir/reabrir (ciclos), editar e excluir. Demanda com apontamentos não pode ser excluída. */
function DemandActions({ demand: d, onEdit, onDeleted, className }: RowProps & { className: string }) {
  const save = useSaveDemand();
  const remove = useDeleteDemand();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const count = d.metrics.activityCount;

  const setCycleStatus = (status: CycleStatus, message: string) => {
    const input = demandInputOf(d);
    if (input.category !== 'ciclo') return;
    save.mutate(
      { id: d.id, input: { ...input, status } },
      { onSuccess: () => toast(message), onError: (err) => toast(err.message, 'error') },
    );
  };

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
    <div className={`items-center gap-1 ${className}`}>
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
          {d.category === 'ciclo' && (
            <button
              onClick={() =>
                isOpenDemand(d) ? setCycleStatus('concluido', 'Ciclo concluído.') : setCycleStatus('em_andamento', 'Ciclo reaberto.')
              }
              disabled={save.isPending}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                isOpenDemand(d) ? 'bg-good-soft text-good-text hover:brightness-95' : 'text-ink-2 hover:bg-surface-2'
              }`}
            >
              {isOpenDemand(d) ? <CheckIcon size={14} /> : <UndoIcon size={14} />}
              {isOpenDemand(d) ? 'Concluir' : 'Reabrir'}
            </button>
          )}
          <IconButton label="Editar" onClick={onEdit}>
            <PencilIcon size={16} />
          </IconButton>
          <IconButton label="Excluir" onClick={() => setConfirming(true)}>
            <TrashIcon size={16} />
          </IconButton>
        </>
      )}
    </div>
  );
}

function EmptyList({ category, filtered }: { category: DemandCategory; filtered: boolean }) {
  return (
    <div className="card flex flex-col items-center px-6 py-14 text-center">
      <span className="grid size-10 place-items-center rounded-full bg-surface-2 text-ink-2">
        {filtered ? <PlusIcon size={20} /> : categoryIcon[category](20)}
      </span>
      <p className="mt-3 text-sm font-semibold text-ink">{filtered ? 'Nada com este filtro' : EMPTY[category]}</p>
    </div>
  );
}
