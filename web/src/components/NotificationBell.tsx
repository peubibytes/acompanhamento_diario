import { useEffect, useRef, useState, type FocusEvent } from 'react';
import { Link, useLocation } from 'react-router';
import { useReminders } from '../api/reminders';
import { ArrowRight, BellIcon } from './icons';
import { EmptyReminders, ReminderRow } from './ReminderVisuals';

const PREVIEW_ITEMS = 4;
/** Tolerância para o ponteiro sair do sino e entrar no resumo sem fechá-lo. */
const CLOSE_DELAY_MS = 160;

/**
 * Sino do header: passar o mouse (ou focar pelo teclado) mostra um resumo das
 * notificações; clicar abre a tela de lembretes e agenda, que só é acessível por aqui.
 */
export function NotificationBell() {
  const { notifications, attention, isPending } = useReminders();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<number | undefined>(undefined);
  const onPage = pathname === '/lembretes';

  const show = () => {
    window.clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const hide = (delay = CLOSE_DELAY_MS) => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), delay);
  };
  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget)) hide(0);
  };

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);
  useEffect(() => setOpen(false), [pathname]);

  const critical = notifications.some((n) => n.severity === 'critical');
  const label =
    attention > 0
      ? `Lembretes: ${attention} ${attention === 1 ? 'pede' : 'pedem'} atenção. Abrir lembretes e agenda`
      : 'Lembretes e agenda';

  return (
    <div
      className="relative"
      onMouseEnter={show}
      onMouseLeave={() => hide()}
      onFocus={show}
      onBlur={onBlur}
      onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
    >
      <Link
        to="/lembretes"
        aria-label={label}
        aria-haspopup="true"
        aria-expanded={open}
        className={`relative grid size-9 place-items-center rounded-full transition ${
          onPage ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-ink-2 hover:text-ink'
        }`}
      >
        <BellIcon size={18} />
        {attention > 0 && (
          <span
            className={`tabular absolute -top-1 -right-1 grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10px] font-bold ring-2 ring-bg ${
              critical ? 'bg-critical text-white' : 'bg-warning text-[#0b0b0b]'
            }`}
            aria-hidden="true"
          >
            {attention > 9 ? '9+' : attention}
          </span>
        )}
      </Link>

      {open && !onPage && (
        <div
          role="dialog"
          aria-label="Resumo das notificações"
          className="card rise absolute top-full right-0 z-40 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] p-2"
        >
          <div className="flex items-baseline justify-between px-2.5 pt-1.5 pb-2">
            <p className="text-sm font-semibold text-ink">Notificações</p>
            <p className="text-xs text-ink-3">
              {isPending
                ? 'Carregando…'
                : attention > 0
                  ? `${attention} ${attention === 1 ? 'pede' : 'pedem'} atenção`
                  : 'Tudo em dia'}
            </p>
          </div>

          {!isPending && notifications.length === 0 ? (
            <EmptyReminders compact />
          ) : (
            <ul className="space-y-0.5">
              {notifications.slice(0, PREVIEW_ITEMS).map((n) => (
                <li key={n.id}>
                  <ReminderRow item={n} compact onNavigate={() => setOpen(false)} />
                </li>
              ))}
            </ul>
          )}

          <Link
            to="/lembretes"
            onClick={() => setOpen(false)}
            className="mt-1 flex items-center justify-between rounded-xl border-t border-line px-2.5 pt-2.5 pb-1.5 text-sm font-semibold text-accent hover:underline"
          >
            {notifications.length > PREVIEW_ITEMS
              ? `Ver todos (${notifications.length}) e a agenda`
              : 'Abrir lembretes e agenda'}
            <ArrowRight size={15} />
          </Link>
        </div>
      )}
    </div>
  );
}
