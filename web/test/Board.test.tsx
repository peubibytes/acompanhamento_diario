import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DemandSummary } from '@acomp/shared';
import { Board } from '../src/pages/Board';
import { startApi, type TestApi } from './api';
import { freezeToday, restoreClock } from './clock';
import { renderPage } from './render';

const TODAY = '2026-10-28';
// Fictícios, no formato curto que a varredura anti-vazamento aceita.
const [A, B, C] = ['SCTASK0000001', 'SCTASK0000002', 'SCTASK0000003'];
let api: TestApi;

beforeEach(async () => {
  freezeToday(TODAY);
  api = await startApi(TODAY);
});
afterEach(async () => {
  await api.close();
  restoreClock();
});

const ticket = (ticketNumber: string, status = 'nao_iniciado') =>
  api.call<DemandSummary>('POST', '/demands', { category: 'chamado', ticketNumber, description: 'Exemplo', status });

/** O quadro só existe depois que as demandas carregam. */
const ready = () => screen.findByRole('region', { name: 'A fazer' });
const column = (name: string) => within(screen.getByRole('region', { name }));
/** Os cartões da coluna, do topo para o fim (pelo nome da demanda no link). */
const cardsOf = (name: string) => column(name).queryAllByRole('link').map((a) => a.textContent);
const demandsByLabel = async () =>
  Object.fromEntries((await api.call<DemandSummary[]>('GET', '/demands')).map((d) => [d.label, d]));

describe('Kanban', () => {
  it('mostra cada demanda na coluna do seu status; reunião e ciclo cancelado ficam de fora', async () => {
    await ticket(A);
    await ticket(B, 'em_andamento');
    await ticket(C, 'em_espera');
    await api.call('POST', '/demands', { category: 'treinamento', title: 'Curso de exemplo', status: 'iniciado' });
    await api.call('POST', '/demands', { category: 'reuniao', meetingType: 'Daily' });
    await api.call('POST', '/demands', { category: 'ciclo', title: 'Projeto cancelado', status: 'cancelado' });

    renderPage(<Board />, { url: '/kanban' });
    await ready();
    expect(await column('A fazer').findByText(A)).toBeInTheDocument();
    expect(cardsOf('Em andamento')).toEqual([B, 'Curso de exemplo']);
    expect(cardsOf('Aguardando')).toEqual([C]);
    expect(cardsOf('Concluído')).toEqual([]);
    expect(screen.queryByText('Daily')).not.toBeInTheDocument();
    expect(screen.queryByText('Projeto cancelado')).not.toBeInTheDocument();
  });

  it('as setas mudam a prioridade na coluna e a ordem fica gravada', async () => {
    await ticket(A);
    await ticket(B);
    await ticket(C);
    renderPage(<Board />, { url: '/kanban' });
    await ready();
    await column('A fazer').findByText(A);
    expect(cardsOf('A fazer')).toEqual([A, B, C]);
    expect(screen.getByRole('button', { name: `Subir ${A}` })).toBeDisabled();
    expect(screen.getByRole('button', { name: `Descer ${C}` })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: `Subir ${C}` }));
    await waitFor(() => expect(cardsOf('A fazer')).toEqual([A, C, B]));
    await userEvent.click(screen.getByRole('button', { name: `Descer ${A}` }));
    await waitFor(() => expect(cardsOf('A fazer')).toEqual([C, A, B]));

    await waitFor(async () => {
      const saved = await demandsByLabel();
      expect([saved[C].boardRank, saved[A].boardRank, saved[B].boardRank]).toEqual([1, 2, 3]);
    });
  });

  it('o seletor do cartão troca o status: o cartão muda de coluna e entra no fim dela', async () => {
    await ticket(A);
    await ticket(B, 'em_andamento');
    renderPage(<Board />, { url: '/kanban' });
    await ready();
    await column('A fazer').findByText(A);

    await userEvent.selectOptions(screen.getByRole('combobox', { name: `Status de ${A}` }), 'Em andamento');
    await waitFor(() => expect(cardsOf('Em andamento')).toEqual([B, A]));
    expect(cardsOf('A fazer')).toEqual([]);
    expect(await screen.findByText(`${A}: Em andamento.`)).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByRole('combobox', { name: `Status de ${A}` }), 'Concluído');
    await waitFor(() => expect(cardsOf('Concluído')).toEqual([A]));
    const saved = await demandsByLabel();
    expect(saved[A]).toMatchObject({ status: 'concluido', completedAt: TODAY });
  });

  it('o filtro por tipo vai para a URL e mantém a ordem da coluna inteira ao priorizar', async () => {
    await ticket(A);
    await api.call('POST', '/demands', { category: 'atividade', title: 'Documentação de exemplo', status: 'nao_iniciado' });
    await ticket(B);
    renderPage(<Board />, { url: '/kanban' });
    await ready();
    await column('A fazer').findByText(A);
    expect(cardsOf('A fazer')).toEqual([A, 'Documentação de exemplo', B]);

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Tipo de demanda' }), 'Chamados (2)');
    expect(screen.getByTestId('location').textContent).toBe('/kanban?tipo=chamado');
    expect(cardsOf('A fazer')).toEqual([A, B]);

    // B sobe para antes de A; a atividade, escondida pelo filtro, continua na ordem gravada.
    await userEvent.click(screen.getByRole('button', { name: `Subir ${B}` }));
    await waitFor(() => expect(cardsOf('A fazer')).toEqual([B, A]));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Tipo de demanda' }), 'Todos os tipos');
    await waitFor(() => expect(cardsOf('A fazer')).toEqual([B, A, 'Documentação de exemplo']));
  });

  it('declara uma demanda pelo quadro e ela aparece em "A fazer"', async () => {
    renderPage(<Board />, { url: '/kanban' });
    expect(await screen.findByText('Nenhuma demanda por aqui. Declare a primeira.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Declarar demanda' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Declarar demanda' }));
    await userEvent.type(dialog.getByLabelText('Número do chamado'), A);
    await userEvent.type(dialog.getByLabelText('Descrição'), 'Erro de exemplo');
    await userEvent.click(dialog.getByRole('button', { name: 'Declarar chamado' }));

    expect(await column('A fazer').findByText(A)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
