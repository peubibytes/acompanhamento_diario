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

  it('no dia, os dois tópicos abrem com as frases; desmarcar um item muda o plano', async () => {
    const ticket = await api.call<DemandSummary>('POST', '/demands', {
      category: 'chamado',
      ticketNumber: 'TESTE-1',
      description: 'Erro  fictício na tela ',
      status: 'em_andamento',
    });
    const meeting = await api.call<DemandSummary>('POST', '/demands', {
      category: 'reuniao',
      meetingType: 'Daily',
      participants: 'Equipe Exemplo',
      subject: 'Status',
    });
    const cycle = await api.call<DemandSummary>('POST', '/demands', { category: 'ciclo', title: 'Ciclo de exemplo', startDate: '2026-10-01' });
    const log = (demandId: number, startMinute: number, endMinute: number, description: string) =>
      api.call('POST', '/activities', { date: '2026-10-27', startMinute, endMinute, demandId, description, notes: '' });
    await log(meeting.id, 540, 555, '');
    await log(ticket.id, 555, 600, 'Análise');
    await log(cycle.id, 600, 750, 'ajuste das consultas');

    renderPage(<Report />);
    const done = within(await screen.findByRole('region', { name: 'O que foi feito' }));
    expect(done.getByRole('heading', { name: 'O que foi feito ontem' })).toBeInTheDocument();
    expect(
      done.getByText('Ontem, atendi 1 chamado, participei de 1 reunião e fiz 2h30 de demandas de Ciclo.'),
    ).toBeInTheDocument();
    expect(
      done.getByText(
        'Atendi ao chamado TESTE-1 – Erro fictício na tela, entrei em reunião com Equipe Exemplo e fiz minhas ' +
          'demandas de ciclo: Ciclo de exemplo (ajuste das consultas).',
      ),
    ).toBeInTheDocument();

    const next = within(screen.getByRole('region', { name: 'O que será feito' }));
    expect(next.getByRole('heading', { name: 'O que será feito hoje' })).toBeInTheDocument();
    const plan = 'Para hoje, buscarei encerrar o chamado TESTE-1 – Erro fictício na tela e atuarei na demanda Ciclo de exemplo.';
    expect(next.getByText(plan)).toBeInTheDocument();
    await userEvent.click(next.getByRole('checkbox', { name: /TESTE-1/ }));
    expect(next.getByText('Para hoje, atuarei na demanda Ciclo de exemplo.')).toBeInTheDocument();
  });

  it('só o que houve: sem "0 reuniões" nem "0h", e as atividades numa seção própria', async () => {
    const ticket = await api.call<DemandSummary>('POST', '/demands', {
      category: 'chamado',
      ticketNumber: 'TESTE-7',
      description: 'Erro fictício',
      status: 'em_andamento',
    });
    const general = await api.call<DemandSummary>('POST', '/demands', { category: 'atividade', title: 'Repasse de exemplo' });
    const log = (demandId: number, startMinute: number, endMinute: number, description: string) =>
      api.call('POST', '/activities', { date: '2026-10-27', startMinute, endMinute, demandId, description, notes: '' });
    await log(ticket.id, 540, 600, 'Análise');
    await log(general.id, 600, 660, 'alinhamento com a equipe');

    renderPage(<Report />);
    const done = within(await screen.findByRole('region', { name: 'O que foi feito' }));
    expect(done.getByText('Ontem, atendi 1 chamado.')).toBeInTheDocument();
    expect(done.queryByText('Reuniões')).not.toBeInTheDocument();
    expect(done.queryByText('Ciclos')).not.toBeInTheDocument();
    expect(done.getByRole('heading', { name: 'Outras atividades' })).toBeInTheDocument();
    expect(done.getByText('Repasse de exemplo')).toBeInTheDocument();
    expect(done.getByText('Alinhamento com a equipe')).toBeInTheDocument();
  });
});
