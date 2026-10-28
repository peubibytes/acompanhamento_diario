import type { ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router';
import { useRefDate, withDate } from '../hooks';
import { ClockIcon, GridIcon, StopwatchIcon, TableIcon, TargetIcon } from './icons';
import { NotificationBell } from './NotificationBell';
import { ThemeToggle } from './ThemeToggle';

const links: { to: string; label: string; icon: ReactNode }[] = [
  { to: '/', label: 'Painel', icon: <GridIcon size={20} /> },
  { to: '/apontamentos', label: 'Apontamentos', icon: <ClockIcon size={20} /> },
  { to: '/demandas', label: 'Demandas', icon: <TargetIcon size={20} /> },
  { to: '/detalhes', label: 'Detalhes', icon: <TableIcon size={20} /> },
];

export function Layout() {
  const [date] = useRefDate();

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <NavLink to={withDate('/', date)} className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-lg bg-accent text-on-accent">
              <StopwatchIcon size={19} strokeWidth={2.25} />
            </span>
            <span className="text-[15px] font-semibold tracking-tight text-ink sm:hidden lg:inline">
              Acompanhamento Diário
            </span>
          </NavLink>
          <div className="flex items-center gap-2">
            {/* Desktop/tablet: navegação no topo */}
            <nav className="hidden items-center gap-1 rounded-full bg-surface-2 p-1 sm:flex" aria-label="Principal">
              {links.map((l) => (
                <NavLink
                  key={l.to}
                  to={withDate(l.to, date)}
                  end
                  className={({ isActive }) =>
                    `rounded-full px-4 py-1.5 text-sm font-medium transition ${
                      isActive ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:text-ink'
                    }`
                  }
                >
                  {l.label}
                </NavLink>
              ))}
            </nav>
            <NotificationBell />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pt-6 pb-28 sm:px-6 sm:py-8">
        <Outlet />
      </main>

      {/* Celular: barra de navegação inferior, ao alcance do polegar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md sm:hidden"
        aria-label="Principal"
      >
        <div className="grid grid-cols-4">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={withDate(l.to, date)}
              end
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition ${
                  isActive ? 'text-accent' : 'text-ink-3 hover:text-ink'
                }`
              }
            >
              {l.icon}
              {l.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
