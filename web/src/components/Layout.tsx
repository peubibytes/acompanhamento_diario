import type { ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { usePeriodScale, useRefDate, withDate } from '../hooks';
import { ClockIcon, GridIcon, KanbanIcon, ListIcon, TableIcon, TargetIcon } from './icons';
import { NotificationBell } from './NotificationBell';
import { ThemeToggle } from './ThemeToggle';

/** `short`: o nome na barra do celular, onde seis telas dividem a largura. */
const links: { to: string; label: string; short?: string; icon: ReactNode }[] = [
  { to: '/', label: 'Painel', icon: <GridIcon size={20} /> },
  { to: '/apontamentos', label: 'Apontamentos', short: 'Apontar', icon: <ClockIcon size={20} /> },
  { to: '/demandas', label: 'Demandas', icon: <TargetIcon size={20} /> },
  { to: '/kanban', label: 'Kanban', icon: <KanbanIcon size={20} /> },
  { to: '/detalhes', label: 'Detalhes', icon: <TableIcon size={20} /> },
  { to: '/relatorio', label: 'Relatório', icon: <ListIcon size={20} /> },
];

export function Layout() {
  const [date] = useRefDate();
  const [scale] = usePeriodScale();
  const { pathname } = useLocation();

  return (
    <div className="min-h-dvh">
      {/* Barra do topo em grafite, como a placa de um equipamento: o nome, as telas em abas e, à direita, o sino e o
          tema. A tela atual é a aba "encaixada" na página (o fundo dela). */}
      <header className="sticky top-0 z-30 bg-chrome text-chrome-ink print:hidden">
        <div className="mx-auto flex h-12 max-w-page items-stretch justify-between gap-3 px-gutter">
          <NavLink
            to={withDate('/', date, scale)}
            className="flex items-center rounded-control outline-none focus-visible:ring-2 focus-visible:ring-chrome-ink"
          >
            {/* Entre sm e lg as seis abas ocupam a largura: fica a sigla, com o nome para o leitor de tela. */}
            <span className="title-plate text-lg leading-none whitespace-nowrap sm:hidden lg:inline">
              ACOMPANHAMENTO<span className="max-[359px]:hidden"> DIÁRIO</span>
            </span>
            <span className="title-plate hidden text-lg leading-none sm:inline lg:hidden" aria-label="Acompanhamento Diário">
              AD
            </span>
          </NavLink>
          <div className="flex items-stretch gap-1">
            {/* Desktop/tablet: navegação no topo, em abas */}
            <nav className="mr-2 hidden items-stretch sm:flex" aria-label="Principal">
              {links.map((l) => (
                <NavLink
                  key={l.to}
                  to={withDate(l.to, date, scale)}
                  end
                  className={({ isActive }) =>
                    `flex items-center px-2 text-sm font-medium md:px-3.5 outline-none transition focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-chrome-ink ${
                      isActive ? 'bg-bg font-semibold text-ink' : 'text-chrome-ink-2 hover:bg-white/10 hover:text-chrome-ink'
                    }`
                  }
                >
                  {l.label}
                </NavLink>
              ))}
            </nav>
            <div className="flex items-center gap-1">
              <NotificationBell />
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-page px-gutter pt-section pb-28 sm:pb-section">
        {/* A chave é só o caminho: trocar de tela refaz a entrada; mudar a data ou um filtro (a query), não. */}
        <div key={pathname} className="page-in">
          <Outlet />
        </div>
      </main>

      {/* Celular: barra de navegação inferior, ao alcance do polegar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 bg-chrome pb-[env(safe-area-inset-bottom)] sm:hidden print:hidden"
        aria-label="Principal"
      >
        {/* Cada tela ocupa o que o nome pede e a sobra é dividida: seis nomes cabem em 320 px sem cortar. */}
        <div className="flex">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={withDate(l.to, date, scale)}
              end
              className={({ isActive }) =>
                `flex min-w-0 flex-auto flex-col items-center gap-0.5 py-2 text-2xs outline-none transition focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-chrome-ink ${
                  isActive ? 'bg-bg font-semibold text-ink' : 'font-medium text-chrome-ink-2 hover:text-chrome-ink'
                }`
              }
            >
              {l.icon}
              {/* O leitor de tela ouve o nome inteiro; o curto é só para caber. */}
              {l.short && <span className="sr-only">{l.label}</span>}
              <span className="max-w-full truncate" aria-hidden={l.short ? true : undefined}>
                {l.short ?? l.label}
              </span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
