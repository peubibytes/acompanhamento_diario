import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Activity, DemandSummary } from '@acomp/shared';
import { TimeEntryForm } from '../src/components/TimeEntryForm';
import { startApi, type TestApi } from './api';
import { freezeToday, restoreClock } from './clock';
import { renderPage } from './render';

const TODAY = '2026-10-28';
let api: TestApi;

beforeEach(async () => {
  freezeToday(TODAY);
  api = await startApi(TODAY);
});
afterEach(async () => {
  await api.close();
  restoreClock();
});

const declareTraining = () =>
  api.call<DemandSummary>('POST', '/demands', {
    category: 'treinamento',
    title: 'Curso de exemplo',
    description: '',
    status: 'iniciado',
  });

/** Escolhe a demanda depois que a lista chega da API. */
async function chooseDemand(demand: DemandSummary) {
  await screen.findByRole('option', { name: new RegExp(demand.label) });
  await userEvent.selectOptions(screen.getByLabelText('Demanda'), String(demand.id));
}

/** Campos de horário: o jsdom não digita em type='time', então o valor entra por change. */
const setTime = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('Formulário de apontamento', () => {
  it('sem nenhuma demanda declarada, leva para Demandas', async () => {
    renderPage(<TimeEntryForm date={TODAY} suggestedStart='09:00' onDone={() => {}} />);
    expect(await screen.findByText('Nada declarado ainda')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Declarar em Demandas/ })).toHaveAttribute('href', '/demandas');
  });

  it('fim antes do início: mostra "inválido", marca o campo e não grava', async () => {
    const demand = await declareTraining();
    const onDone = vi.fn();
    renderPage(<TimeEntryForm date={TODAY} suggestedStart='10:00' onDone={onDone} />);

    await chooseDemand(demand);
    setTime('Fim', '09:30');
    expect(screen.getByTitle('Duração')).toHaveTextContent('inválido');
    expect(screen.getByLabelText('Fim')).toHaveAttribute('aria-invalid', 'true');

    await userEvent.click(screen.getByRole('button', { name: 'Adicionar apontamento' }));
    expect(await screen.findByText('O horário de fim deve ser depois do início.')).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
    expect(await api.call<Activity[]>('GET', `/activities?date=${TODAY}`)).toEqual([]);
  });

  it('com uma reunião escolhida pedem-se "Com quem" e "Assunto"; nas outras demandas, não', async () => {
    const meeting = await api.call<DemandSummary>('POST', '/demands', { category: 'reuniao', meetingType: 'Repasses' });
    const training = await declareTraining();
    renderPage(<TimeEntryForm date={TODAY} suggestedStart='09:00' onDone={() => {}} />);

    await chooseDemand(training);
    expect(screen.queryByLabelText(/Com quem/)).not.toBeInTheDocument();
    await chooseDemand(meeting);
    await userEvent.type(screen.getByLabelText(/Com quem/), 'Equipe Exemplo');
    await userEvent.type(screen.getByLabelText(/Assunto/), 'Contexto do projeto');
    setTime('Fim', '09:30');
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar apontamento' }));

    expect(await screen.findByText('Apontamento registrado.')).toBeInTheDocument();
    const saved = await api.call<Activity[]>('GET', `/activities?date=${TODAY}`);
    expect(saved).toMatchObject([{ demandId: meeting.id, participants: 'Equipe Exemplo', subject: 'Contexto do projeto' }]);
  });

  it('troca o status da demanda pelo apontamento e Demandas passa a mostrar o novo', async () => {
    const ticket = await api.call<DemandSummary>('POST', '/demands', { category: 'chamado', ticketNumber: 'TESTE-5', description: 'Fictício' });
    renderPage(<TimeEntryForm date={TODAY} suggestedStart='09:00' onDone={() => {}} />);

    await chooseDemand(ticket);
    const status = screen.getByLabelText('Status da demanda');
    // Chamado: sem "Iniciado", com "Em espera".
    expect(Array.from((status as HTMLSelectElement).options).map((o) => o.textContent)).toEqual([
      'Não iniciado',
      'Em andamento',
      'Em espera',
      'Concluído',
    ]);
    await userEvent.selectOptions(status, 'em_espera');
    setTime('Fim', '09:30');
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar apontamento' }));

    expect(await screen.findByText('Apontamento registrado.')).toBeInTheDocument();
    const demands = await api.call<DemandSummary[]>('GET', '/demands');
    expect(demands).toMatchObject([{ id: ticket.id, status: 'em_espera' }]);
  });

  it('o status mostrado é o de agora, mesmo depois de uma troca feita em outro lugar', async () => {
    const ticket = await api.call<DemandSummary>('POST', '/demands', { category: 'chamado', ticketNumber: 'TESTE-6', description: 'Fictício' });
    renderPage(<TimeEntryForm date={TODAY} suggestedStart='09:00' onDone={() => {}} />);
    await chooseDemand(ticket);
    expect(screen.getByLabelText('Status da demanda')).toHaveValue('nao_iniciado');
  });

  it('grava o apontamento na demanda escolhida, com a duração ao vivo', async () => {
    const demand = await declareTraining();
    const onDone = vi.fn();
    renderPage(<TimeEntryForm date={TODAY} suggestedStart='09:00' onDone={onDone} />);

    await chooseDemand(demand);
    setTime('Fim', '10:30');
    expect(screen.getByTitle('Duração')).toHaveTextContent('1h30');
    await userEvent.type(screen.getByLabelText(/O que foi feito/), 'Módulo 1');
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar apontamento' }));

    expect(await screen.findByText('Apontamento registrado.')).toBeInTheDocument();
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ demandId: demand.id }), false);
    const saved = await api.call<Activity[]>('GET', `/activities?date=${TODAY}`);
    expect(saved).toMatchObject([{ startMinute: 540, endMinute: 630, demandId: demand.id, description: 'Módulo 1' }]);
  });
});
