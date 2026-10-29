import { useId, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import {
  DEMAND_CATEGORY_LABEL,
  durationOf,
  formatDayMonth,
  formatDuration,
  formatHM,
  getCycle,
  todayISO,
  unionMinutesByDay,
  type Activity,
  type DayMetrics,
  type DemandSummary,
  type ISODate,
} from '@acomp/shared';
import { useCycle, useDayActivities, useDeleteActivity, useDemands } from '../api/client';
import { ConformityBadge, dayStyle } from '../components/Badges';
import { CycleNav } from '../components/CycleNav';
import { IconButton } from '../components/DemandHistory';
import { CategoryAvatar, categoryIcon } from '../components/DemandVisuals';
import { InfoHint } from '../components/InfoHint';
import { AlertIcon, ChevronDown, ClockIcon, ListIcon, PencilIcon, PlusIcon, TrashIcon } from '../components/icons';
import { PageHeader } from '../components/PageHeader';
import { Segmented } from '../components/Segmented';
import { SlideOver } from '../components/SlideOver';
import { ErrorState, Skeleton } from '../components/States';
import { TimeEntryForm } from '../components/TimeEntryForm';
import { useToast } from '../components/Toast';
import { useRefDate } from '../hooks';

const DEFAULT_START = '08:00';

type View = 'horario' | 'demanda';

// A visão escolhida é uma preferência local: lembrada entre visitas, sem ir ao servidor.
const VIEW_KEY = 'apontamentos:visao';

function storedView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'demanda' ? 'demanda' : 'horario';
  } catch {
    return 'horario';
  }
}

/** Fins de semana não têm apontamentos: cai no último dia útil do ciclo até a data. */
function resolveWorkday(date: ISODate): ISODate {
  const { workdays } = getCycle(date);
  return workdays.filter((d) => d <= date).at(-1) ?? workdays[0];
}

/** O formulário aberto no painel: novo apontamento ou edição de um existente. */
type Panel = { mode: 'new' } | { mode: 'edit'; id: number };

export function TimeEntries() {
  const [refDate, setRefDate] = useRefDate();
  const day = resolveWorkday(refDate);
  const cycle = useCycle(day);
  const activities = useDayActivities(day);
  const demands = useDemands();
  const byId = new Map(demands.data?.map((d) => [d.id, d]));
  const [panel, setPanel] = useState<Panel | null>(null);
  const [dirty, setDirty] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [view, setView] = useState<View>(storedView);

  const metrics = cycle.data?.days.find((d) => d.date === day);
  const list = activities.data ?? [];
  const editing = panel?.mode === 'edit' ? list.find((a) => a.id === panel.id) : undefined;
  const lastEnd = list.length ? formatHM(Math.max(...list.map((a) => a.endMinute))) : DEFAULT_START;

  const chooseView = (next: View) => {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Sem armazenamento, a escolha vale só nesta sessão.
    }
  };

  const open = (next: Panel) => {
    setDirty(false);
    setPanel(next);
  };
  const close = () => setPanel(null);

  const selectDay = (d: ISODate) => {
    setPanel(null);
    setExpandedId(null);
    setRefDate(d);
  };

  /** Ao trocar de ciclo, mantém o mesmo dia da semana selecionado ("Hoje" vai para hoje). */
  const changeCycle = (d: ISODate) => {
    if (d === todayISO()) return selectDay(resolveWorkday(d));
    const index = getCycle(day).workdays.indexOf(day);
    selectDay(getCycle(d).workdays[index]);
  };

  const rowProps = (a: Activity) => ({
    activity: a,
    demand: a.demandId ? byId.get(a.demandId) : undefined,
    expanded: expandedId === a.id,
    onToggle: () => setExpandedId((id) => (id === a.id ? null : a.id)),
    onEdit: () => open({ mode: 'edit', id: a.id }),
    onDeleted: () => setExpandedId((id) => (id === a.id ? null : id)),
  });

  return (
    <div className="space-y-section">
      <PageHeader
        title="Apontamentos"
        hint="Escolha o dia e registre o tempo gasto em cada demanda declarada."
        action={
          <button type="button" onClick={() => open({ mode: 'new' })} className="btn-primary">
            <PlusIcon size={18} /> Novo apontamento
          </button>
        }
      />

      <div className="space-y-4">
        <CycleNav date={day} onChange={changeCycle} />
        {cycle.data ? <DayTabs days={cycle.data.days} selected={day} onSelect={selectDay} /> : <Skeleton className="h-20" />}
      </div>

      <section className="space-y-3" aria-label="Apontamentos do dia">
        {metrics && (
          <DaySummary
            metrics={metrics}
            view={view}
            onView={chooseView}
            showView={list.length > 1}
          />
        )}

        {activities.isPending ? (
          <div className="space-y-2">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        ) : activities.isError ? (
          <ErrorState message={activities.error.message} onRetry={() => activities.refetch()} />
        ) : list.length === 0 ? (
          <EmptyDay />
        ) : view === 'demanda' && list.length > 1 ? (
          <ByDemand activities={list} demands={byId} rowProps={rowProps} />
        ) : (
          <ul className="card divide-y divide-line">
            {list.map((a) => (
              <EntryRow key={a.id} {...rowProps(a)} />
            ))}
          </ul>
        )}
      </section>

      <SlideOver
        open={panel !== null}
        onClose={close}
        dirty={dirty}
        title={panel?.mode === 'edit' ? 'Editar apontamento' : 'Novo apontamento'}
        subtitle={metrics ? `${metrics.weekdayLong}, ${formatDayMonth(day)}` : undefined}
      >
        {activities.isPending || demands.isPending ? (
          <Skeleton className="h-96" />
        ) : (
          <TimeEntryForm
            date={day}
            editing={editing}
            suggestedStart={lastEnd}
            onDirtyChange={setDirty}
            onDone={(_saved, keepOpen) => {
              if (!keepOpen) close();
            }}
          />
        )}
      </SlideOver>
    </div>
  );
}

/** Dia, horas e uma barrinha de progresso; o status vai no ícone e na cor da barra. */
function DayTabs({ days, selected, onSelect }: { days: DayMetrics[]; selected: ISODate; onSelect: (d: ISODate) => void }) {
  const today = todayISO();
  return (
    <div className="grid grid-cols-5 gap-2" role="tablist" aria-label="Dia da semana">
      {days.map((d) => {
        const active = d.date === selected;
        const style = dayStyle(d);
        const isToday = d.date === today;
        return (
          <button
            key={d.date}
            role="tab"
            aria-selected={active}
            aria-current={isToday ? 'date' : undefined}
            onClick={() => onSelect(d.date)}
            className={`min-w-0 rounded-xl border px-2.5 py-2.5 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-accent sm:px-3.5 sm:py-3 ${
              active ? 'border-line-strong bg-surface shadow-sm' : 'border-transparent bg-surface-2/60 hover:bg-surface-2'
            }`}
          >
            <span className="flex items-center justify-between gap-1">
              <span className="flex min-w-0 items-baseline gap-1.5">
                <span className="text-sm font-semibold text-ink">{d.weekdayShort}</span>
                <span className="tabular hidden truncate text-2xs text-ink-3 sm:inline">
                  {isToday ? 'Hoje' : formatDayMonth(d.date)}
                </span>
                {isToday && <span className="size-1.5 shrink-0 self-center rounded-full bg-ink sm:hidden" aria-hidden="true" />}
              </span>
              <span className={`shrink-0 ${style.text}`} title={style.label}>
                {style.icon(13)}
                <span className="sr-only">{style.label}</span>
              </span>
            </span>
            <span className="tabular mt-1 block truncate text-sm font-semibold text-ink sm:text-base">
              {d.minutes ? formatDuration(d.minutes) : '—'}
            </span>
            <span className="mt-2 block h-1 overflow-hidden rounded-full bg-grid">
              <span
                className="block h-full rounded-full"
                style={{ width: `${Math.min(100, (d.minutes / d.goal) * 100)}%`, background: style.bar }}
              />
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Resumo do dia em uma linha: apontado · meta · situação. O diagnóstico completo está no ⓘ. */
function DaySummary({
  metrics: m,
  view,
  onView,
  showView,
}: {
  metrics: DayMetrics;
  view: View;
  onView: (v: View) => void;
  showView: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
        <h2 className="text-sm font-semibold text-ink">
          {m.weekdayLong}, {formatDayMonth(m.date)}
        </h2>
        <p className="tabular text-sm text-ink-2">
          <strong className="font-semibold text-ink">{formatDuration(m.minutes)}</strong> de {formatDuration(m.goal)}
        </p>
        <ConformityBadge day={m} />
        {m.diffLabel && <span className="tabular text-xs text-ink-3">{m.diffLabel}</span>}
        <InfoHint label="Sobre o dia">
          <span className="block">
            {m.diagnosis} · {m.activityCount} {m.activityCount === 1 ? 'apontamento' : 'apontamentos'}.
          </span>
          {m.exceeded && (
            <span className="mt-1.5 block font-medium text-critical-text">
              O dia soma {formatDuration(m.minutes)}, acima da meta de {formatDuration(m.goal)}. Reajuste os horários para
              remover {formatHM(m.diff)}.
            </span>
          )}
          {m.overlapMinutes > 0 && (
            <span className="mt-1.5 block">
              Horários sobrepostos: o trecho em comum ({formatDuration(m.overlapMinutes)}) entrou uma única vez no total
              do dia.
            </span>
          )}
        </InfoHint>
      </div>

      {showView && (
        <Segmented
          label="Organizar apontamentos"
          size="sm"
          value={view}
          onChange={onView}
          options={[
            { value: 'horario', label: 'Por horário', icon: <ClockIcon size={13} /> },
            { value: 'demanda', label: 'Por demanda', icon: <ListIcon size={13} /> },
          ]}
        />
      )}
    </div>
  );
}

interface RowProps {
  activity: Activity;
  demand?: DemandSummary;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDeleted: () => void;
}

/**
 * Uma linha: horário, demanda e duração. A descrição e as observações
 * aparecem ao expandir; editar e excluir aparecem ao passar o mouse (no celular, dentro da linha expandida).
 */
function EntryRow({ grouped = false, ...row }: RowProps & { grouped?: boolean }) {
  const { activity: a, demand, expanded, onToggle } = row;
  const detailId = useId();

  return (
    <li className="group">
      <div className="flex items-center pr-2 sm:pr-3">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={detailId}
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-3 text-left outline-none transition hover:bg-surface-2/60 focus-visible:ring-2 focus-visible:ring-accent"
        >
          <span className="tabular shrink-0 text-sm text-ink-2 sm:w-28">
            {formatHM(a.startMinute)}–{formatHM(a.endMinute)}
          </span>
          {grouped ? (
            <span className="min-w-0 flex-1 truncate text-sm text-ink-2">{a.description || '—'}</span>
          ) : (
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <span className="shrink-0 text-ink-3">
                {demand ? categoryIcon[demand.category](15) : <AlertIcon size={15} className="text-warning-text" />}
              </span>
              <span className="truncate text-sm font-semibold text-ink">{demand?.label ?? a.project}</span>
            </span>
          )}
          <span className="tabular shrink-0 text-sm font-semibold text-ink">{formatDuration(durationOf(a))}</span>
          <ChevronDown size={15} className={`shrink-0 text-ink-3 transition ${expanded ? 'rotate-180' : ''}`} />
        </button>
        <EntryActions
          {...row}
          className="hidden sm:flex sm:opacity-0 sm:transition sm:group-focus-within:opacity-100 sm:group-hover:opacity-100"
        />
      </div>

      {expanded && (
        <div id={detailId} className="space-y-2.5 px-3 pb-4 sm:pl-[10.5rem]">
          {!grouped && demand?.subtitle && (
            <p className="text-xs text-ink-3">
              {DEMAND_CATEGORY_LABEL[demand.category]} · {demand.subtitle}
            </p>
          )}
          {!demand && (
            <p className="flex items-start gap-1.5 text-xs text-warning-text">
              <AlertIcon size={14} className="mt-px shrink-0" />
              Apontamento antigo, sem demanda. Edite para escolher a demanda declarada.
            </p>
          )}
          {a.description && <p className="text-sm whitespace-pre-line text-ink-2">{a.description}</p>}
          {a.notes && <p className="text-sm text-ink-3">↳ {a.notes}</p>}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex flex-wrap items-center gap-3">
              {demand && (
                <Link to={`/demandas#demanda-${demand.id}`} className="text-xs font-medium text-ink-2 hover:text-ink hover:underline">
                  Ver demanda
                </Link>
              )}
            </span>
            <EntryActions {...row} className="flex sm:hidden" />
          </div>
        </div>
      )}
    </li>
  );
}

function EntryActions({
  activity: a,
  onEdit,
  onDeleted,
  className,
}: RowProps & {
  /** Exibição e visibilidade da barra de ações, definidas por quem a usa (linha ou área expandida). */
  className: string;
}) {
  const remove = useDeleteActivity();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);

  const doRemove = () =>
    remove.mutate(a.id, {
      onSuccess: () => {
        onDeleted();
        toast('Apontamento excluído.');
      },
      onError: (err) => toast(err.message, 'error'),
    });

  return (
    <div className={`items-center gap-1 ${className}`}>
      {confirming ? (
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
      ) : (
        <>
          <IconButton label="Editar apontamento" onClick={onEdit}>
            <PencilIcon size={16} />
          </IconButton>
          <IconButton label="Excluir apontamento" onClick={() => setConfirming(true)}>
            <TrashIcon size={16} />
          </IconButton>
        </>
      )}
    </div>
  );
}

/** Nome da demanda do grupo; nos apontamentos antigos, o projeto digitado na época. */
function GroupHeading({ activity: a, demand }: { activity: Activity; demand?: DemandSummary }) {
  if (!demand) {
    return (
      <span className="flex min-w-0 items-center gap-2">
        <AlertIcon size={16} className="shrink-0 text-warning-text" />
        <h3 className="truncate text-sm font-semibold text-ink">{a.project}</h3>
        <span className="shrink-0 text-xs text-warning-text">Sem demanda</span>
      </span>
    );
  }
  return (
    <Link to={`/demandas#demanda-${demand.id}`} className="group/name flex min-w-0 items-center gap-2.5" title="Ver a demanda">
      <CategoryAvatar category={demand.category} size={26} />
      <h3 className="truncate text-sm font-semibold text-ink group-hover/name:underline">{demand.label}</h3>
      <span className="hidden shrink-0 text-xs text-ink-3 sm:inline">{DEMAND_CATEGORY_LABEL[demand.category]}</span>
    </Link>
  );
}

/**
 * A mesma demanda feita em horários diferentes, reunida: cada grupo mostra o total do dia
 * (sobreposições contadas uma vez) e os horários em que ela aconteceu.
 */
function ByDemand({
  activities,
  demands,
  rowProps,
}: {
  activities: Activity[];
  demands: Map<number, DemandSummary>;
  rowProps: (a: Activity) => RowProps;
}) {
  const groups = [
    ...Map.groupBy(activities, (a) => (a.demandId !== null ? `d${a.demandId}` : `p${a.project}`)).values(),
  ]
    .map((items) => ({ items, total: unionMinutesByDay(items) }))
    .sort((x, y) => y.total - x.total);

  return (
    <div className="card divide-y divide-line">
      {groups.map(({ items, total }) => {
        const first = items[0];
        const demand = first.demandId ? demands.get(first.demandId) : undefined;
        return (
          <section key={first.id} className="py-1">
            <div className="flex items-center justify-between gap-3 px-3 pt-3 pb-1">
              <GroupHeading activity={first} demand={demand} />
              <span className="tabular shrink-0 text-right text-sm font-semibold text-ink">
                {formatDuration(total)}
                <span className="ml-2 text-xs font-normal text-ink-3">
                  {items.length === 1 ? '1 horário' : `${items.length} horários`}
                </span>
              </span>
            </div>
            <ul>
              {items.map((a) => (
                <EntryRow key={a.id} grouped {...rowProps(a)} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function EmptyDay(): ReactNode {
  return (
    <div className="card flex flex-col items-center px-6 py-14 text-center">
      <span className="grid size-10 place-items-center rounded-full bg-surface-2 text-ink-2">
        <ClockIcon size={20} />
      </span>
      <p className="mt-3 text-sm font-semibold text-ink">Nenhum apontamento neste dia</p>
    </div>
  );
}
