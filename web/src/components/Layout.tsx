import { NavLink, Outlet } from 'react-router';
import { useRefDate, withDate } from '../hooks';
import { CheckIcon } from './icons';

const links = [
  { to: '/', label: 'Painel' },
  { to: '/atividades', label: 'Atividades' },
  { to: '/detalhes', label: 'Detalhes' },
];

export function Layout() {
  const [date] = useRefDate();

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <NavLink to={withDate('/', date)} className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-lg bg-accent text-on-accent">
              <CheckIcon size={18} strokeWidth={2.75} />
            </span>
            <span className="hidden text-[15px] font-semibold tracking-tight text-ink sm:inline">
              Acompanhamento Diário
            </span>
          </NavLink>
          <nav className="flex items-center gap-1 rounded-full bg-surface-2 p-1">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={withDate(l.to, date)}
                end
                className={({ isActive }) =>
                  `rounded-full px-3 py-1.5 text-sm font-medium transition sm:px-4 ${
                    isActive ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:text-ink'
                  }`
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  );
}
