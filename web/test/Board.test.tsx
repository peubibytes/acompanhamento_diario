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
  // Os cartões recolhidos ficam no navegador; cada teste começa com um banco novo (e os mesmos ids).
  localStorage.clear();
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

  it('recolhe e expande o cartão: só o nome fica, a escolha é lembrada e o foco acompanha o botão', async () => {
    await ticket(A);
    await api.call('POST', '/demands', {
      category: 'ciclo',
      title: 'Projeto de exemplo',
      kind: 'planejada',
      status: 'em_andamento',
      priority: 'media',
      startDate: '2026-10-01',
      dueDate: '2026-10-20',
      description: 'Descrição de exemplo',
    });
    const view = renderPage(<Board />, { url: '/kanban' });
    await ready();
    await column('A fazer').findByText(A);

    // Há dois "Recolher" por cartão (toque e mouse; o CSS mostra um só, e o jsdom não aplica CSS): vale o primeiro.
    const collapse = (label: string) => screen.getAllByRole('button', { name: `Recolher ${label}` });
    expect(collapse(A)).toHaveLength(2);
    await userEvent.click(collapse(A)[0]);
    expect(screen.queryByRole('combobox', { name: `Status de ${A}` })).not.toBeInTheDocument();
    expect(column('A fazer').queryByText('Exemplo')).not.toBeInTheDocument();
    const expand = screen.getByRole('button', { name: `Expandir ${A}` });
    expect(expand).toHaveAttribute('aria-expanded', 'false');
    expect(expand).toHaveFocus();
    expect(cardsOf('A fazer')).toEqual([A]);

    // Recolhido, o prazo vencido continua à vista, num alerta só.
    await userEvent.click(collapse('Projeto de exemplo')[0]);
    expect(column('Em andamento').getByText('Prazo vencido')).toBeInTheDocument();

    // Lembrado ao voltar à tela.
    view.unmount();
    renderPage(<Board />, { url: '/kanban' });
    await ready();
    await userEvent.click(await screen.findByRole('button', { name: `Expandir ${A}` }));
    expect(screen.getByRole('combobox', { name: `Status de ${A}` })).toBeInTheDocument();
    expect(collapse(A)[0]).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Expandir Projeto de exemplo' })).toBeInTheDocument();
  });

  it('recolhe a coluna inteira: os cartões somem, a contagem fica e a escolha é lembrada', async () => {
    await ticket(A);
    await ticket(B);
    await ticket(C, 'em_andamento');
    const view = renderPage(<Board />, { url: '/kanban' });
    await ready();
    await column('A fazer').findByText(A);

    const fold = screen.getByRole('button', { name: 'Recolher a coluna A fazer' });
    expect(fold).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(fold);
    expect(cardsOf('A fazer')).toEqual([]);
    expect(column('A fazer').getByRole('heading', { name: /A fazer\s*2/ })).toBeInTheDocument();
    expect(column('A fazer').queryByText('Nada aqui')).not.toBeInTheDocument();
    // As outras colunas não mudam.
    expect(cardsOf('Em andamento')).toEqual([C]);

    view.unmount();
    renderPage(<Board />, { url: '/kanban' });
    await ready();
    await column('Em andamento').findByText(C);
    expect(cardsOf('A fazer')).toEqual([]);
    const unfold = screen.getByRole('button', { name: 'Expandir a coluna A fazer' });
    expect(unfold).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(unfold);
    expect(cardsOf('A fazer')).toEqual([A, B]);
  });
});
