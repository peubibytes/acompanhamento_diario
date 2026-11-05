import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DemandSummary } from '@acomp/shared';
import { TimeEntries } from '../src/pages/TimeEntries';
import { startApi, type TestApi } from './api';
import { freezeToday, restoreClock } from './clock';
import { renderPage } from './render';

const TODAY = '2026-10-28'; // quarta
let api: TestApi;

beforeEach(async () => {
  freezeToday(TODAY);
  api = await startApi(TODAY);
});
afterEach(async () => {
  await api.close();
  restoreClock();
});

describe('Apontamentos: quanto apontar', () => {
  it('divide o trecho sobreposto entre os apontamentos e a soma é o total do dia', async () => {
    const ticket = await api.call<DemandSummary>('POST', '/demands', {
      category: 'chamado',
      ticketNumber: 'TESTE-1',
      description: 'Erro fictício na tela',
      status: 'em_andamento',
    });
    const meeting = await api.call<DemandSummary>('POST', '/demands', {
      category: 'reuniao',
      meetingType: 'Daily',
      participants: 'Equipe Exemplo',
      subject: 'Status',
    });
    const log = (demandId: number, startMinute: number, endMinute: number) =>
      api.call('POST', '/activities', { date: TODAY, startMinute, endMinute, demandId, description: '', notes: '' });
    await log(ticket.id, 480, 600); // 08:00–10:00
    await log(meeting.id, 540, 600); // 09:00–10:00

    renderPage(<TimeEntries />);
    const rows = await screen.findAllByRole('button', { expanded: false });
    const ticketRow = within(rows.find((r) => r.textContent?.includes('TESTE-1'))!);
    const meetingRow = within(rows.find((r) => r.textContent?.includes('Daily'))!);
    expect(ticketRow.getByText('2h')).toBeInTheDocument();
    expect(ticketRow.getByText('Apontar 1h30')).toBeInTheDocument();
    expect(meetingRow.getByText('1h')).toBeInTheDocument();
    expect(meetingRow.getByText('Apontar 30min')).toBeInTheDocument();
  });

  it('sem sobreposição, o valor a apontar é a duração', async () => {
    const ticket = await api.call<DemandSummary>('POST', '/demands', {
      category: 'chamado',
      ticketNumber: 'TESTE-2',
      description: 'Outro fictício',
      status: 'em_andamento',
    });
    await api.call('POST', '/activities', {
      date: TODAY,
      startMinute: 480,
      endMinute: 540,
      demandId: ticket.id,
      description: '',
      notes: '',
    });
    renderPage(<TimeEntries />);
    expect(await screen.findByText('Apontar 1h')).toBeInTheDocument();
  });
});
