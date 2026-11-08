import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DemandSummary } from '@acomp/shared';
import { Dashboard } from '../src/pages/Dashboard';
import { startApi, type TestApi } from './api';
import { freezeToday, restoreClock } from './clock';
import { renderPage } from './render';

const TODAY = '2026-10-28';
let api: TestApi;

beforeEach(async () => {
  freezeToday(TODAY);
  localStorage.clear();
  api = await startApi(TODAY);
});
afterEach(async () => {
  await api.close();
  restoreClock();
});

const location = () => screen.getByTestId('location').textContent;
const scaleTabs = () => within(screen.getByRole('tablist', { name: 'Escala do período' }));
const viewTabs = () => within(screen.getByRole('tablist', { name: 'Métricas do painel' }));

describe('Painel', () => {
  it('começa na semana e na visão Dia útil, com os números do período', async () => {
    renderPage(<Dashboard />);
    expect(scaleTabs().getByRole('tab', { name: 'Semana' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'Dia útil' })).toBeInTheDocument();
    expect(await screen.findByText('Total realizado')).toBeInTheDocument();
    expect(screen.getByText(/Sex 23\/10/)).toBeInTheDocument();
  });

  it('a escala Mês vai para a URL e é mantida ao navegar entre períodos', async () => {
    renderPage(<Dashboard />);
    await userEvent.click(scaleTabs().getByRole('tab', { name: 'Mês' }));
    expect(location()).toBe('/?escala=mes');
    expect(screen.getByText('Outubro de 2026')).toBeInTheDocument();
    expect(await screen.findByText('Meta do período')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Período anterior' }));
    expect(location()).toMatch(/^\/\?data=2026-09-\d{2}&escala=mes$/);
    expect(screen.getByText('Setembro de 2026')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Hoje/ }));
    expect(location()).toBe('/?escala=mes');
  });

  it('abre a escala que vem na URL', () => {
    renderPage(<Dashboard />, { url: '/?escala=mes' });
    expect(scaleTabs().getByRole('tab', { name: 'Mês' })).toHaveAttribute('aria-selected', 'true');
  });

  it('troca de visão e lembra a escolhida na próxima visita', async () => {
    const first = renderPage(<Dashboard />);
    await userEvent.click(viewTabs().getByRole('tab', { name: 'Rendimento' }));
    expect(screen.getByRole('tabpanel', { name: 'Rendimento' })).toBeInTheDocument();
    first.unmount();

    renderPage(<Dashboard />);
    expect(viewTabs().getByRole('tab', { name: 'Rendimento' })).toHaveAttribute('aria-selected', 'true');
  });

  it('Rendimento sem apontamentos mostra só o Tempo por categoria, sem o Rendimento por ciclo', async () => {
    renderPage(<Dashboard />, { url: '/?escala=mes' });
    await userEvent.click(viewTabs().getByRole('tab', { name: 'Rendimento' }));
    expect(await screen.findByText('Tempo por categoria')).toBeInTheDocument();
    expect(screen.getAllByText('Sem apontamentos').length).toBeGreaterThan(0);
    expect(screen.queryByText('Rendimento por ciclo')).not.toBeInTheDocument();
    expect(screen.queryByText('Nenhum apontamento em ciclos neste período')).not.toBeInTheDocument();
  });

  it('Rendimento mostra o tempo por categoria, com nome, horas e % de cada uma', async () => {
    const cycle = await api.call<DemandSummary>('POST', '/demands', { category: 'ciclo', title: 'Ciclo de exemplo', startDate: '2026-10-01' });
    const meeting = await api.call<DemandSummary>('POST', '/demands', {
      category: 'reuniao',
      meetingType: 'Alinhamento fictício',
    });
    const log = (demandId: number, startMinute: number, endMinute: number) =>
      api.call('POST', '/activities', { date: '2026-10-27', startMinute, endMinute, demandId, description: '', notes: '' });
    await log(cycle.id, 540, 720);
    await log(meeting.id, 720, 780);

    renderPage(<Dashboard />);
    await userEvent.click(viewTabs().getByRole('tab', { name: 'Rendimento' }));
    const legend = within(await screen.findByRole('list', { name: 'Tempo por categoria no período' }));
    const item = (label: string) => legend.getByText(label).closest('li')!.textContent;
    expect(item('Ciclos')).toMatch(/75%$/);
    expect(item('Reuniões')).toMatch(/25%$/);
    expect(item('Chamados')).toMatch(/0%$/);
    expect(item('Treinamentos')).toMatch(/0%$/);
    expect(legend.queryByText('Sem demanda')).not.toBeInTheDocument();
  });

  it('Distribuição mostra todas as demandas na legenda, sem "Outros", e fatia pequena como <1%', async () => {
    for (let i = 1; i <= 8; i++) {
      const d = await api.call<DemandSummary>('POST', '/demands', {
        category: 'chamado',
        ticketNumber: `TESTE-${i}`,
        description: 'Fictício',
        status: 'em_andamento',
      });
      // O último dura 1 minuto; os demais, 1h.
      const start = 420 + i * 60;
      await api.call('POST', '/activities', {
        date: TODAY,
        startMinute: start,
        endMinute: start + (i === 8 ? 1 : 60),
        demandId: d.id,
        description: '',
        notes: '',
      });
    }
    renderPage(<Dashboard />);
    await userEvent.click(viewTabs().getByRole('tab', { name: 'Distribuição' }));
    const panel = within(await screen.findByRole('tabpanel', { name: 'Distribuição' }));
    for (let i = 1; i <= 8; i++) expect(await panel.findByText(`TESTE-${i}`)).toBeInTheDocument();
    expect(panel.queryByText(/Outros/)).not.toBeInTheDocument();
    expect(panel.getByText('<1%')).toBeInTheDocument();
  });
});
