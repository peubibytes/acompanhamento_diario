import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DemandSummary } from '@acomp/shared';
import { Report } from '../src/pages/Report';
import { startApi, type TestApi } from './api';
import { freezeToday, restoreClock } from './clock';
import { renderPage } from './render';

const TODAY = '2026-10-28'; // quarta: semana Sex 23/10 → Qui 29/10
let api: TestApi;

beforeEach(async () => {
  freezeToday(TODAY);
  api = await startApi(TODAY);
});
afterEach(async () => {
  await api.close();
  restoreClock();
});

const location = () => screen.getByTestId('location').textContent;
const scaleTabs = () => within(screen.getByRole('tablist', { name: 'Escala do relatório' }));

describe('Relatório', () => {
  it('começa no dia; Semana e Mês vão para a URL e Dia volta', async () => {
    renderPage(<Report />);
    expect(scaleTabs().getByRole('tab', { name: 'Dia' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: 'Dia útil anterior' })).toBeInTheDocument();

    await userEvent.click(scaleTabs().getByRole('tab', { name: 'Semana' }));
    expect(location()).toBe('/?escala=semana');
    // O título de impressão traz o período (na tela ele fica escondido pelo CSS).
    expect(screen.getByRole('heading', { name: 'Relatório semanal — Sex 23/10 → Qui 29/10' })).toBeInTheDocument();
    expect(await screen.findByText('Sem apontamentos no período.')).toBeInTheDocument();

    await userEvent.click(scaleTabs().getByRole('tab', { name: 'Mês' }));
    expect(location()).toBe('/?escala=mes');
    expect(screen.getByRole('heading', { name: 'Relatório mensal — Outubro de 2026' })).toBeInTheDocument();

    await userEvent.click(scaleTabs().getByRole('tab', { name: 'Dia' }));
    expect(location()).toBe('/');
  });

  it('na semana, o ciclo intempestivo aparece marcado e a fatia não planejada é calculada', async () => {
    const urgent = await api.call<DemandSummary>('POST', '/demands', {
      category: 'ciclo',
      title: 'Ciclo urgente de exemplo',
      kind: 'intempestiva',
      startDate: '2026-10-01',
    });
    const planned = await api.call<DemandSummary>('POST', '/demands', { category: 'ciclo', title: 'Ciclo planejado de exemplo', startDate: '2026-10-01' });
    const log = (demandId: number, startMinute: number, endMinute: number) =>
      api.call('POST', '/activities', { date: '2026-10-27', startMinute, endMinute, demandId, description: '', notes: '' });
    await log(urgent.id, 540, 600);
    await log(planned.id, 600, 780);

    renderPage(<Report />, { url: '/?escala=semana' });
    expect(await screen.findByText('Ciclo urgente de exemplo')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'O que foi feito' })).getByText('Intempestiva')).toBeInTheDocument();
    expect(screen.getByText('25%')).toBeInTheDocument();
    expect(screen.getByText('25% do tempo (1h de 4h) em ciclos intempestivos.')).toBeInTheDocument();
  });
});
