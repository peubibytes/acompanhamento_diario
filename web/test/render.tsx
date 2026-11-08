import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { ToastProvider } from '../src/components/Toast';

/** Mostra a URL atual, para os testes conferirem o que vai para a barra de endereço. */
function LocationProbe() {
  const { pathname, search } = useLocation();
  return <output data-testid="location">{pathname + search}</output>;
}

/** Abre o seletor de demanda do apontamento e escolhe a opção cujo nome contém o texto. */
export async function chooseDemand(name: string | RegExp) {
  await userEvent.click(await screen.findByRole('combobox', { name: 'Demanda' }));
  await userEvent.click(await screen.findByRole('option', { name }));
}

/** Renderiza como no main.tsx (consultas, avisos e rotas), sem novas tentativas em erro. */
export function renderPage(ui: ReactNode, { url = '/', path = '*' }: { url?: string; path?: string } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path={path} element={<>{ui}<LocationProbe /></>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}
