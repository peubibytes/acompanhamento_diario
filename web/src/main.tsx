import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { Layout } from './components/Layout';
import { ToastProvider } from './components/Toast';
import './index.css';
import { Activities } from './pages/Activities';
import { Dashboard } from './pages/Dashboard';
import { Demands } from './pages/Demands';
import { Details } from './pages/Details';
import { Reminders } from './pages/Reminders';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="atividades" element={<Activities />} />
              <Route path="demandas" element={<Demands />} />
              <Route path="detalhes" element={<Details />} />
              {/* Fora do seletor de telas: acessível apenas pelo sino do header. */}
              <Route path="lembretes" element={<Reminders />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
