import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Activity, DemandSummary } from '@acomp/shared';
import { TimeEntryForm } from '../src/components/TimeEntryForm';
import { startApi, type TestApi } from './api';
import { freezeToday, restoreClock } from './clock';
import { chooseDemand as pick, renderPage } from './render';

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

/** Escolhe a demanda pelo seletor com busca, depois que a lista chega da API. */
const chooseDemand = (demand: DemandSummary) => pick(new RegExp(demand.label));

/** Campos de horário: o jsdom não digita em type='time', então o valor entra por change. */
const setTime = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('Seletor de demanda', () => {
  const declare = async () => {
    const t = (n: number, description: string) =>
      api.call<DemandSummary>('POST', '/demands', { category: 'chamado', ticketNumber: `SCTASK000000${n}`, description });
    const [a, b] = [await t(1, 'Erro na emissão da nota'), await t(2, 'Lentidão no portal')];
    const meeting = await api.call<DemandSummary>('POST', '/demands', { category: 'reuniao', meetingType: 'Daily' });
    const cycle = await api.call<DemandSummary>('POST', '/demands', { category: 'ciclo', title: 'Portal — ajuste no deploy', startDate: '2026-10-01' });
    return { a, b, meeting, cycle };
  };
  const open = async () => {
    renderPage(<TimeEntryForm date={TODAY} suggestedStart='09:00' onDone={() => {}} />);
    await userEvent.click(await screen.findByRole('combobox', { name: 'Demanda' }));
    return screen.findByRole('combobox', { name: 'Buscar demanda' });
  };

  it('busca sem diferenciar acentos, com vários termos, e escolhe pelo teclado', async () => {
    const { a } = await declare();
    const search = await open();
    expect(await screen.findAllByRole('option')).toHaveLength(4);

    await userEvent.type(search, 'EMISSAO nota');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    await userEvent.keyboard('{Enter}');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Demanda' })).toHaveTextContent(a.label);
    expect(screen.getByRole('combobox', { name: 'Demanda' })).toHaveFocus();
  });

  it('as setas movem a opção ativa e o Enter escolhe essa', async () => {
    await declare();
    const search = await open();
    await screen.findAllByRole('option');
    await userEvent.keyboard('{ArrowDown}');
    const options = screen.getAllByRole('option');
    expect(search).toHaveAttribute('aria-activedescendant', options[1].id);
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('combobox', { name: 'Demanda' })).toHaveTextContent(/\S/);
    expect(screen.getByRole('combobox', { name: 'Demanda' })).not.toHaveTextContent('Escolha o que foi feito');
  });

  it('o filtro de categoria limita a lista, com a contagem', async () => {
    await declare();
    await open();
    await screen.findAllByRole('option');
    await userEvent.click(screen.getByRole('button', { name: 'Chamados (2)' }));
    expect(screen.getAllByRole('option')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Chamados (2)' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('encerradas ficam fora até "Mostrar N encerradas"', async () => {
    const { b } = await declare();
    await api.call('PUT', `/demands/${b.id}`, { category: 'chamado', ticketNumber: b.label, description: 'Lentidão no portal', status: 'concluido' });
    await open();
    await screen.findAllByRole('option');
    expect(screen.getAllByRole('option')).toHaveLength(3);
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar 1 encerrada' }));
    expect(screen.getAllByRole('option')).toHaveLength(4);
    expect(screen.getByText('Encerrada')).toBeInTheDocument();
  });

  it('nada encontrado: avisa e oferece declarar uma nova', async () => {
    await declare();
    const search = await open();
    await userEvent.type(search, 'inexistente');
    expect(screen.getByText('Nada encontrado para “inexistente”')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Declarar nova demanda' })).toHaveAttribute('href', '/demandas');
  });

  it('Esc fecha só o seletor, devolve o foco ao botão e não marca o formulário como alterado', async () => {
    await declare();
    const onDirtyChange = vi.fn();
    const onDone = vi.fn();
    renderPage(<TimeEntryForm date={TODAY} suggestedStart='09:00' onDone={onDone} onDirtyChange={onDirtyChange} />);
    await userEvent.click(await screen.findByRole('combobox', { name: 'Demanda' }));
    await screen.findByRole('combobox', { name: 'Buscar demanda' });
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Demanda' })).toHaveFocus();
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });
});

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
