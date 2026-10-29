import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  daysBetween,
  formatDayMonth,
  WEEKDAY_SHORT,
  weekdayOf,
  type AgendaItem,
  type AppNotification,
  type ISODate,
} from '@acomp/shared';
import { targetHref, useReminders } from '../api/reminders';
import { deadlineStyle } from '../components/DemandVisuals';
import { AlertIcon, CalendarIcon, SendIcon, TargetIcon } from '../components/icons';
import { PageHeader } from '../components/PageHeader';
import { EmptyReminders, ReminderRow } from '../components/ReminderVisuals';
import { SectionTitle } from '../components/SectionTitle';
import { ErrorState, Skeleton } from '../components/States';

/** Tela de lembretes e agenda — acessível apenas pelo sino do header. */
export function Reminders() {
  const navigate = useNavigate();
  const { today, notifications, agenda, isPending, error, refetch } = useReminders();
  const urgent = notifications.filter((n) => n.severity !== 'info');
  const info = notifications.filter((n) => n.severity === 'info');

  return (
    <div className="space-y-section">
      <PageHeader
        title="Lembretes e agenda"
        hint="O que pede sua atenção agora e as próximas datas importantes."
        onBack={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}
      />

      {error ? (
        <ErrorState message={error.message} onRetry={refetch} />
      ) : (
        <div className="grid items-start gap-section lg:grid-cols-5">
          <section className="min-w-0 space-y-3 lg:col-span-2" aria-label="Lembretes">
            <SectionTitle title="Lembretes" />
            {isPending ? (
              <Skeleton className="h-64" />
            ) : notifications.length === 0 ? (
              <div className="card">
                <EmptyReminders />
              </div>
            ) : (
              <div className="card divide-y divide-line p-2">
                {urgent.length > 0 && <ReminderGroup title="Pedem atenção" items={urgent} />}
                {info.length > 0 && <ReminderGroup title="Para saber" items={info} />}
              </div>
            )}
          </section>

          <section className="min-w-0 space-y-3 lg:col-span-3" aria-label="Agenda">
            <SectionTitle title="Agenda" />
            {isPending ? <Skeleton className="h-96" /> : <Agenda items={agenda} today={today} />}
          </section>
        </div>
      )}
    </div>
  );
}

function ReminderGroup({ title, items }: { title: string; items: AppNotification[] }) {
  return (
    <div className="py-1 first:pt-0 last:pb-0">
      <p className="px-3 pt-2 pb-1 text-2xs font-semibold tracking-wider text-ink-3 uppercase">
        {title} <span className="tabular">· {items.length}</span>
      </p>
      <ul>
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

const shortDate = (iso: ISODate) => `${WEEKDAY_SHORT[weekdayOf(iso)]} ${formatDayMonth(iso)}`;

function Agenda({ items, today }: { items: AgendaItem[]; today: ISODate }) {
  if (items.length === 0) {
    return <div className="card px-6 py-10 text-center text-sm font-semibold text-ink">Nenhuma data na agenda</div>;
  }

  const overdue = items.filter((i) => i.date < today);
  const upcoming = Map.groupBy(
    items.filter((i) => i.date >= today),
    (i) => i.date,
  );

  return (
    <div className="card divide-y divide-line p-2">
      {overdue.length > 0 && (
        <AgendaDay
          heading="Atrasados"
          icon={<AlertIcon size={14} />}
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
          date={shortDate(date)}
          tone="normal"
          items={dayItems}
          today={today}
        />
      ))}
    </div>
  );
}

/** Um dia da agenda: "Amanhã  Qui 29/10" numa linha e, abaixo, os itens sem moldura. */
function AgendaDay({
  heading,
  date,
  icon,
  tone,
  items,
  today,
  showDate = false,
}: {
  heading: string;
  date?: string;
  icon?: ReactNode;
  tone: 'critical' | 'normal';
  items: AgendaItem[];
  today: ISODate;
  showDate?: boolean;
}) {
  return (
    <section className="py-1 first:pt-0 last:pb-0">
      <h3
        className={`flex items-center gap-1.5 px-3 pt-2 pb-1 text-sm font-semibold ${tone === 'critical' ? 'text-critical-text' : 'text-ink'}`}
      >
        {icon}
        {heading}
        {date && <span className="tabular text-xs font-normal text-ink-3">{date}</span>}
      </h3>
      <ul>
        {items.map((i) => {
          const status = i.deadline ? deadlineStyle[i.deadline] : null;
          return (
            <li key={i.id}>
              <Link
                to={targetHref(i.target)}
                className="flex items-start gap-3 rounded-xl px-3 py-2.5 outline-none transition hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent"
              >
                <span
                  className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full ${
                    status ? status.badge : 'bg-surface-2 text-ink-2'
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
    </section>
  );
}
