import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  daysBetween,
  formatDayMonth,
  WEEKDAY_LONG,
  weekdayOf,
  type AgendaItem,
  type AppNotification,
  type ISODate,
} from '@acomp/shared';
import { targetHref, useReminders } from '../api/reminders';
import { deadlineStyle } from '../components/DemandVisuals';
import { ArrowLeft, CalendarIcon, SendIcon, TargetIcon } from '../components/icons';
import { PageHeader } from '../components/PageHeader';
import { EmptyReminders, ReminderRow } from '../components/ReminderVisuals';
import { ErrorState, Skeleton } from '../components/States';

/** Tela de lembretes e agenda — acessível apenas pelo sino do header. */
export function Reminders() {
  const navigate = useNavigate();
  const { today, notifications, agenda, isPending, error, refetch } = useReminders();
  const urgent = notifications.filter((n) => n.severity !== 'info');
  const info = notifications.filter((n) => n.severity === 'info');

  return (
    <div className="space-y-section">
      <button
        onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-2 transition hover:text-ink"
      >
        <ArrowLeft size={16} /> Voltar
      </button>

      <PageHeader title="Lembretes e agenda" hint="O que pede sua atenção agora e as próximas datas importantes." />

      {error ? (
        <ErrorState message={error.message} onRetry={refetch} />
      ) : (
        <div className="grid items-start gap-section lg:grid-cols-5">
          <section className="min-w-0 space-y-4 lg:col-span-2" aria-labelledby="titulo-lembretes">
            <h2 id="titulo-lembretes" className="text-lg font-semibold text-ink">
              Lembretes
            </h2>
            {isPending ? (
              <Skeleton className="h-64" />
            ) : notifications.length === 0 ? (
              <div className="card">
                <EmptyReminders />
              </div>
            ) : (
              <>
                {urgent.length > 0 && <ReminderGroup title="Pedem atenção" items={urgent} />}
                {info.length > 0 && <ReminderGroup title="Para saber" items={info} />}
              </>
            )}
          </section>

          <section className="min-w-0 space-y-4 lg:col-span-3" aria-labelledby="titulo-agenda">
            <h2 id="titulo-agenda" className="text-lg font-semibold text-ink">
              Agenda
            </h2>
            {isPending ? <Skeleton className="h-96" /> : <Agenda items={agenda} today={today} />}
          </section>
        </div>
      )}
    </div>
  );
}

function ReminderGroup({ title, items }: { title: string; items: AppNotification[] }) {
  return (
    <div className="card p-2">
      <p className="px-3 pt-2 pb-1 text-2xs font-semibold tracking-wider text-ink-3 uppercase">
        {title} <span className="tabular">· {items.length}</span>
      </p>
      <ul className="divide-y divide-line">
        {items.map((n) => (
          <li key={n.id}>
            <ReminderRow item={n} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** "Hoje", "Amanhã", "Em 3 dias", "Há 2 dias". */
function relative(today: ISODate, date: ISODate): string {
  const n = daysBetween(today, date);
  if (n === 0) return 'Hoje';
  if (n === 1) return 'Amanhã';
  if (n === -1) return 'Ontem';
  return n > 0 ? `Em ${n} dias` : `Há ${-n} dias`;
}

const kindStyle: Record<AgendaItem['kind'], { icon: ReactNode; tag: string }> = {
  prazo_demanda: { icon: <TargetIcon size={15} />, tag: 'Prazo do ciclo' },
  inicio_demanda: { icon: <CalendarIcon size={15} />, tag: 'Início do ciclo' },
  apontamento: { icon: <SendIcon size={15} />, tag: 'Apontamento' },
};

function Agenda({ items, today }: { items: AgendaItem[]; today: ISODate }) {
  if (items.length === 0) {
    return (
      <div className="card px-6 py-10 text-center text-sm text-ink-2">Nenhuma data na agenda.</div>
    );
  }

  const overdue = items.filter((i) => i.date < today);
  const upcoming = Map.groupBy(
    items.filter((i) => i.date >= today),
    (i) => i.date,
  );

  return (
    <div className="card overflow-hidden">
      {overdue.length > 0 && (
        <AgendaDay
          heading="Atrasados"
          sub={`${overdue.length} ${overdue.length === 1 ? 'prazo vencido' : 'prazos vencidos'}`}
          tone="critical"
          items={overdue}
          today={today}
          showDate
        />
      )}
      {[...upcoming.entries()].map(([date, dayItems]) => (
        <AgendaDay
          key={date}
          heading={relative(today, date)}
          sub={`${WEEKDAY_LONG[weekdayOf(date)]}, ${formatDayMonth(date)}`}
          tone={date === today ? 'today' : 'normal'}
          items={dayItems}
          today={today}
        />
      ))}
    </div>
  );
}

function AgendaDay({
  heading,
  sub,
  tone,
  items,
  today,
  showDate = false,
}: {
  heading: string;
  sub: string;
  tone: 'critical' | 'today' | 'normal';
  items: AgendaItem[];
  today: ISODate;
  showDate?: boolean;
}) {
  const headingColor = tone === 'critical' ? 'text-critical-text' : tone === 'today' ? 'text-accent' : 'text-ink';
  return (
    <div className="grid gap-x-5 border-b border-line px-4 py-4 last:border-b-0 sm:grid-cols-[9rem_1fr] sm:px-5">
      <div className="mb-2 sm:mb-0">
        <p className={`text-sm font-semibold ${headingColor}`}>{heading}</p>
        <p className="text-xs text-ink-3">{sub}</p>
      </div>
      <ul className="min-w-0 space-y-2">
        {items.map((i) => {
          const status = i.deadline ? deadlineStyle[i.deadline] : null;
          return (
            <li key={i.id}>
              <Link
                to={targetHref(i.target)}
                className="group flex items-start gap-3 rounded-xl border border-line px-3 py-2.5 transition hover:bg-surface-2"
              >
                <span
                  className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full ${
                    status ? status.badge : 'bg-accent-soft text-accent'
                  }`}
                >
                  {kindStyle[i.kind].icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 flex-wrap items-center gap-x-2">
                    <span className="min-w-0 truncate text-sm font-semibold text-ink">{i.title}</span>
                    <span className="text-2xs font-medium text-ink-3">{kindStyle[i.kind].tag}</span>
                  </span>
                  <span className="mt-0.5 block text-xs text-ink-2">
                    {showDate && `${relative(today, i.date)} (${formatDayMonth(i.date)}) · `}
                    {i.detail}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
