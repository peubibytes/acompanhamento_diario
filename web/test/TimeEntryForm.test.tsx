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
