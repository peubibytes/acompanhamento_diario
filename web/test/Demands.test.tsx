import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Demands } from '../src/pages/Demands';
import { startApi, type TestApi } from './api';
import { freezeToday, restoreClock } from './clock';
import { renderPage } from './render';

const TODAY = '2026-10-28';
// Fictícios, no formato curto que a varredura anti-vazamento aceita.
const [A, B] = ['SCTASK0000001', 'SCTASK0000002'];
let api: TestApi;

beforeEach(async () => {
  freezeToday(TODAY);
  api = await startApi(TODAY);
});
afterEach(async () => {
  await api.close();
  restoreClock();
});

const types = () => within(screen.getByRole('radiogroup', { name: 'Tipo de demanda' }));

describe('Demandas: seletor de categoria', () => {
  it('mostra todas as categorias numa barra, com as abertas de cada uma, e a escolha vai para a URL', async () => {
    await api.call('POST', '/demands', { category: 'chamado', ticketNumber: A, description: 'Exemplo', status: 'em_andamento' });
    await api.call('POST', '/demands', { category: 'chamado', ticketNumber: B, description: 'Exemplo', status: 'concluido' });
    await api.call('POST', '/demands', { category: 'reuniao', meetingType: 'Daily' });
    await api.call('POST', '/demands', { category: 'ciclo', title: 'Projeto de exemplo', status: 'em_andamento' });

    renderPage(<Demands />, { url: '/demandas' });
    expect(await types().findByRole('radio', { name: 'Chamados, 1 em aberto' })).toBeChecked();
    expect(types().getAllByRole('radio').map((r) => r.textContent?.replace(/\d.*$/, ''))).toEqual([
      'Chamados',
      'Reuniões',
      'Treinamentos',
      'Atividades',
      'Ciclos',
    ]);
    expect(types().getByRole('radio', { name: 'Reuniões, 1 declaradas' })).toBeInTheDocument();
    expect(types().getByRole('radio', { name: 'Treinamentos, 0 em aberto' })).not.toBeChecked();

    await userEvent.click(types().getByRole('radio', { name: /^Ciclos/ }));
    expect(screen.getByTestId('location').textContent).toBe('/demandas?tipo=ciclo');
    expect(types().getByRole('radio', { name: /^Ciclos/ })).toBeChecked();
    expect(await screen.findByText('Projeto de exemplo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Declarar ciclo' })).toBeInTheDocument();
  });

  it('as setas percorrem as categorias, de Tarefas para Ciclo e de volta', async () => {
    renderPage(<Demands />, { url: '/demandas?tipo=atividade' });
    const atividades = await types().findByRole('radio', { name: /^Atividades/ });
    atividades.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByTestId('location').textContent).toBe('/demandas?tipo=ciclo');
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByTestId('location').textContent).toBe('/demandas?tipo=chamado');
    expect(types().getByRole('radio', { name: /^Chamados/ })).toHaveFocus();
  });
});
