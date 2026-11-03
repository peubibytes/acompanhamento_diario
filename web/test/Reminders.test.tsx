import { screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Reminders } from '../src/pages/Reminders';
import { startApi, type TestApi } from './api';
import { freezeToday, restoreClock } from './clock';
import { renderPage } from './render';

const TODAY = '2026-10-28';
let api: TestApi;

beforeEach(async () => {
  freezeToday(TODAY);
  localStorage.clear();
  api = await startApi(TODAY);
});
afterEach(async () => {
  await api.close();
  restoreClock();
});

const reminders = () => within(screen.getByRole('region', { name: 'Lembretes' }));
const yourData = () => within(screen.getByRole('region', { name: 'Seus dados' }));

describe('Lembretes: Seus dados', () => {
  it('sem dados, não pede exportação', async () => {
    renderPage(<Reminders />, { url: '/lembretes' });
    expect(await yourData().findByText('Nenhuma ainda')).toBeInTheDocument();
    expect(await reminders().findByText(/Apontamento na quinta/)).toBeInTheDocument();
    expect(reminders().queryByText('Exporte seus dados')).not.toBeInTheDocument();
  });

  it('com dados nunca exportados, pede a exportação e leva até Seus dados', async () => {
    await api.call('POST', '/demands', { category: 'treinamento', title: 'Curso fictício', status: 'iniciado' });
    renderPage(<Reminders />, { url: '/lembretes' });
    const reminder = await reminders().findByRole('link', { name: /Exporte seus dados/ });
    expect(reminder).toHaveAttribute('href', '/lembretes#seus-dados');
    expect(within(reminder).getByText(/Você ainda não exportou/)).toBeInTheDocument();
  });

  it('depois de exportar, mostra quando foi e o lembrete sai', async () => {
    await api.call('POST', '/demands', { category: 'treinamento', title: 'Curso fictício', status: 'iniciado' });
    await api.call('GET', '/export');
    renderPage(<Reminders />, { url: '/lembretes' });
    expect(await reminders().findByText(/Apontamento na quinta/)).toBeInTheDocument();
    expect(reminders().queryByText('Exporte seus dados')).not.toBeInTheDocument();
    expect(yourData().queryByText('Nenhuma ainda')).not.toBeInTheDocument();
  });
});
