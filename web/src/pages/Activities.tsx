import { useRef, useState, type ReactNode } from 'react';
import {
  durationOf,
  formatDayMonth,
  formatDuration,
  formatHM,
  getCycle,
  todayISO,
  type Activity,
  type DayMetrics,
  type ISODate,
} from '@acomp/shared';
import { Link } from 'react-router';
import { useCycle, useDayActivities, useDeleteActivity, useDemands } from '../api/client';
import { ActivityForm } from '../components/ActivityForm';
import { ConformityBadge, dayStyle, StatusBadge } from '../components/Badges';
import { CycleNav } from '../components/CycleNav';
import { ClockIcon, LayersIcon, PencilIcon, PlusIcon, TargetIcon, TrashIcon, TrendUpIcon } from '../components/icons';
import { ErrorState, Skeleton } from '../components/States';
import { useToast } from '../components/Toast';
import { useRefDate } from '../hooks';

const DEFAULT_START = '08:00';

/** Fins de semana não têm lançamentos: cai no último dia útil do ciclo até a data. */
function resolveWorkday(date: ISODate): ISODate {
  const { workdays } = getCycle(date);
  return workdays.filter((d) => d <= date).at(-1) ?? workdays[0];
}

export function Activities() {
  const [refDate, setRefDate] = useRefDate();
  const day = resolveWorkday(refDate);
  const cycle = useCycle(day);
  const activities = useDayActivities(day);
  const demands = useDemands();
  const demandTitle = new Map(demands.data?.map((d) => [d.id, d.title]));
  const [editingId, setEditingId] = useState<number | null>(null);
  const formRef = useRef<HTMLElement>(null);

  const metrics = cycle.data?.days.find((d) => d.date === day);
  const list = activities.data ?? [];
  const editing = list.find((a) => a.id === editingId);
  const lastEnd = list.length ? formatHM(Math.max(...list.map((a) => a.endMinute))) : DEFAULT_START;

  const selectDay = (d: ISODate) => {
    setEditingId(null);
    setRefDate(d);
  };

  /** Ao trocar de ciclo, mantém o mesmo dia da semana selecionado ("Hoje" vai para hoje). */
  const changeCycle = (d: ISODate) => {
    if (d === todayISO()) return selectDay(resolveWorkday(d));
    const index = getCycle(day).workdays.indexOf(day);
    selectDay(getCycle(d).workdays[index]);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">Atividades</h1>
          <p className="mt-1 text-sm text-ink-2">Escolha o dia e registre o que foi feito.</p>
        </div>
        <CycleNav date={day} onChange={changeCycle} />
      </div>

      {cycle.data ? (
        <DayTabs days={cycle.data.days} selected={day} onSelect={selectDay} />
      ) : (
        <Skeleton className="h-20" />
      )}

      <div className="grid items-start gap-6 lg:grid-cols-5">
        <section className="space-y-4 lg:col-span-3">
          {metrics && <DaySummary metrics={metrics} />}

          {activities.isPending ? (
            <div className="space-y-3">
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </div>
          ) : activities.isError ? (
            <ErrorState message={activities.error.message} onRetry={() => activities.refetch()} />
          ) : list.length === 0 ? (
            <EmptyDay />
          ) : (
            <ul className="space-y-3">
              {list.map((a) => (
                <ActivityItem
                  key={a.id}
                  activity={a}
                  demandTitle={a.demandId ? demandTitle.get(a.demandId) : undefined}
                  isEditing={a.id === editingId}
                  onEdit={() => {
                    setEditingId(a.id);
                    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                  }}
                  onDeleted={() => a.id === editingId && setEditingId(null)}
                />
              ))}
            </ul>
          )}
        </section>

        <aside ref={formRef} className="card scroll-mt-24 p-5 sm:p-6 lg:sticky lg:top-24 lg:col-span-2">
          <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-ink">
            {editing ? <PencilIcon size={17} /> : <PlusIcon size={17} />}
            {editing ? 'Editar atividade' : 'Nova atividade'}
          </h2>
          {activities.isPending ? (
            <Skeleton className="h-96" />
          ) : (
            // A chave remonta o formulário ao trocar de dia ou de atividade em edição,
            // e só depois de a lista carregar, para sugerir o início a partir do último fim.
            <ActivityForm
              key={`${day}-${editing?.id ?? 'new'}`}
              date={day}
              editing={editing}
              suggestedStart={lastEnd}
              onDone={() => setEditingId(null)}
            />
          )}
        </aside>
      </div>
    </div>
  );
}

function DayTabs({ days, selected, onSelect }: { days: DayMetrics[]; selected: ISODate; onSelect: (d: ISODate) => void }) {
  const today = todayISO();
  return (
    <div className="grid grid-cols-5 gap-2" role="tablist" aria-label="Dia da semana">
      {days.map((d) => {
        const active = d.date === selected;
        const pct = Math.min(100, (d.minutes / d.goal) * 100);
        return (
          <button
            key={d.date}
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(d.date)}
            className={`rounded-2xl border p-2.5 text-left transition sm:p-3 ${
              active ? 'border-accent bg-surface shadow-sm ring-2 ring-accent-soft' : 'border-line bg-surface/60 hover:bg-surface'
            }`}
          >
            <div className="flex items-center justify-between gap-1">
              <span className={`text-sm font-semibold ${active ? 'text-accent' : 'text-ink'}`}>{d.weekdayShort}</span>
              <span className={`hidden sm:inline ${dayStyle(d).badge} grid size-5 place-items-center rounded-full`}>
                {dayStyle(d).icon(11)}
              </span>
            </div>
            <p className="tabular text-xs text-ink-3">{d.date === today ? 'Hoje' : formatDayMonth(d.date)}</p>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-grid">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: dayStyle(d).bar }} />
            </div>
            <p className="tabular mt-1.5 hidden text-[11px] text-ink-2 sm:block">
              {formatDuration(d.minutes)} / {formatDuration(d.goal)}
            </p>
          </button>
        );
      })}
    </div>
  );
}

function DaySummary({ metrics }: { metrics: DayMetrics }) {
  const pct = Math.min(100, (metrics.minutes / metrics.goal) * 100);
  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-ink-2">
            {metrics.weekdayLong}, {formatDayMonth(metrics.date)}
          </p>
          <p className="tabular mt-0.5 text-2xl font-bold text-ink">
            {formatDuration(metrics.minutes)}
            <span className="text-base font-medium text-ink-3"> de {formatDuration(metrics.goal)}</span>
          </p>
        </div>
        <ConformityBadge day={metrics} />
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-grid">
        <div
          className="h-full rounded-full transition-[width] duration-700"
          style={{ width: `${pct}%`, background: dayStyle(metrics).bar }}
        />
      </div>
      {metrics.exceeded ? (
        <div role="alert" className="mt-3 flex items-start gap-2.5 rounded-xl bg-critical-soft px-3 py-2.5 text-sm">
          <TrendUpIcon size={17} className="mt-0.5 shrink-0 text-critical-text" />
          <p className="text-ink-2">
            <strong className="text-critical-text">Apontamento irregular.</strong> O dia soma{' '}
            {formatDuration(metrics.minutes)}, acima da meta de {formatDuration(metrics.goal)}. Reajuste os horários
            para remover <strong className="tabular text-ink">{formatHM(metrics.diff)}</strong>.
          </p>
        </div>
      ) : (
        <p className="mt-2 text-sm text-ink-2">
          {metrics.diagnosis} · {metrics.activityCount} {metrics.activityCount === 1 ? 'atividade' : 'atividades'}
        </p>
      )}
      {metrics.overlapMinutes > 0 && (
        <p className="mt-2 flex items-start gap-2 text-xs text-ink-2">
          <LayersIcon size={14} className="mt-px shrink-0 text-ink-3" />
          <span>
            Horários sobrepostos: o trecho em comum (
            <strong className="tabular font-semibold text-ink">{formatDuration(metrics.overlapMinutes)}</strong>) entrou uma
            única vez no total do dia.
          </span>
        </p>
      )}
    </div>
  );
}

function ActivityItem({
  activity: a,
  demandTitle,
  isEditing,
  onEdit,
  onDeleted,
}: {
  activity: Activity;
  demandTitle?: string;
  isEditing: boolean;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const remove = useDeleteActivity();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);

  const doRemove = () =>
    remove.mutate(a.id, {
      onSuccess: () => {
        onDeleted();
        toast('Atividade excluída.');
      },
      onError: (err) => toast(err.message, 'error'),
    });

  return (
    <li className={`card rise p-4 transition sm:p-5 ${isEditing ? 'ring-2 ring-accent' : ''}`}>
      <div className="flex items-start gap-4">
        <div className="hidden w-20 shrink-0 text-center sm:block">
          <p className="tabular text-sm font-semibold text-ink">{formatHM(a.startMinute)}</p>
          <div className="mx-auto my-1 h-4 w-px bg-baseline" />
          <p className="tabular text-sm text-ink-3">{formatHM(a.endMinute)}</p>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-ink">{a.project}</h3>
            <span className="tabular inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-ink-2">
              <ClockIcon size={12} />
              <span className="sm:hidden">
                {formatHM(a.startMinute)}–{formatHM(a.endMinute)} ·{' '}
              </span>
              {formatDuration(durationOf(a))}
            </span>
          </div>
          {a.description && <p className="mt-1 text-sm whitespace-pre-line text-ink-2">{a.description}</p>}
          {a.notes && <p className="mt-1 text-sm text-ink-3">↳ {a.notes}</p>}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge value={a.status} />
              {a.demandId && demandTitle && (
                <Link
                  to={`/demandas#demanda-${a.demandId}`}
                  className="inline-flex max-w-56 items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent hover:brightness-95"
                  title="Demanda"
                >
                  <TargetIcon size={13} className="shrink-0" />
                  <span className="truncate">{demandTitle}</span>
                </Link>
              )}
            </div>
            <div className="flex items-center gap-1">
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
                  <IconButton label="Editar atividade" onClick={onEdit}>
                    <PencilIcon size={16} />
                  </IconButton>
                  <IconButton label="Excluir atividade" onClick={() => setConfirming(true)}>
                    <TrashIcon size={16} />
                  </IconButton>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </li>
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

function EmptyDay() {
  return (
    <div className="card flex flex-col items-center px-6 py-12 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-accent-soft text-accent">
        <ClockIcon size={22} />
      </span>
      <p className="mt-3 font-semibold text-ink">Nenhuma atividade neste dia</p>
      <p className="mt-1 max-w-xs text-sm text-ink-2">
        Use o formulário para registrar o que foi feito, com horário de início e fim.
      </p>
    </div>
  );
}
