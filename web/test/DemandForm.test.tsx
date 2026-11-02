import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DemandSummary } from '@acomp/shared';
import { DemandForm } from '../src/components/DemandForms';
import { startApi, type TestApi } from './api';
import { freezeToday, restoreClock } from './clock';
import { renderPage } from './render';

const TODAY = '2026-10-28';
// Fictício, no formato curto que a varredura anti-vazamento aceita.
const TICKET = 'SCTASK0000001';
let api: TestApi;

beforeEach(async () => {
  freezeToday(TODAY);
  api = await startApi(TODAY);
});
afterEach(async () => {
  await api.close();
  restoreClock();
});

async function fillTicket() {
  await userEvent.type(screen.getByLabelText('Número do chamado'), TICKET.toLowerCase());
  await userEvent.type(screen.getByLabelText('Descrição'), 'Erro de exemplo');
}

describe('Declarar chamado', () => {
  it('normaliza o número em maiúsculas, grava e fecha o painel', async () => {
    const onDone = vi.fn();
    renderPage(<DemandForm category="chamado" onDone={onDone} />);
    await fillTicket();
    expect(screen.getByLabelText('Número do chamado')).toHaveValue(TICKET);

    await userEvent.click(screen.getByRole('button', { name: 'Declarar chamado' }));
    expect(await screen.findByText('Chamado declarado.')).toBeInTheDocument();
    expect(onDone).toHaveBeenCalledOnce();
    const demands = await api.call<DemandSummary[]>('GET', '/demands');
    expect(demands).toMatchObject([{ category: 'chamado', ticketNumber: TICKET, status: 'nao_iniciado' }]);
  });

  it('chamado repetido: mostra o erro da API e mantém o painel aberto', async () => {
    await api.call('POST', '/demands', { category: 'chamado', ticketNumber: TICKET, description: 'Já existe', status: 'nao_iniciado' });
    const onDone = vi.fn();
    renderPage(<DemandForm category="chamado" onDone={onDone} />);
    await fillTicket();
    await userEvent.click(screen.getByRole('button', { name: 'Declarar chamado' }));

    expect(await screen.findByText(new RegExp(TICKET))).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
    expect(await api.call<DemandSummary[]>('GET', '/demands')).toHaveLength(1);
  });

  it('avisa quem abriu o painel quando há algo digitado', async () => {
    const onDirtyChange = vi.fn();
    renderPage(<DemandForm category="chamado" onDone={() => {}} onDirtyChange={onDirtyChange} />);
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    await userEvent.type(screen.getByLabelText('Descrição'), 'x');
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  });
});
