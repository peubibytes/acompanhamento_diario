import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PeriodNav } from '../src/components/PeriodNav';
import { freezeToday, restoreClock } from './clock';

// Hoje é quarta, 28/10/2026: período semanal Sex 23/10 → Qui 29/10; mensal, outubro.
beforeEach(() => freezeToday('2026-10-28'));
afterEach(restoreClock);

describe('PeriodNav', () => {
  it('na semana atual mostra "Período atual", sexta → quinta, e não oferece "Hoje"', () => {
    render(<PeriodNav date="2026-10-28" scale="week" onChange={() => {}} />);
    expect(screen.getByText('Período atual')).toBeInTheDocument();
    expect(screen.getByText(/Sex 23\/10/)).toHaveTextContent('Sex 23/10 → Qui 29/10');
    expect(screen.queryByRole('button', { name: /Hoje/ })).not.toBeInTheDocument();
  });

  it('as setas vão para a sexta que abre a semana anterior ou a próxima', async () => {
    const onChange = vi.fn();
    render(<PeriodNav date="2026-10-28" scale="week" onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Período anterior' }));
    await userEvent.click(screen.getByRole('button', { name: 'Próximo período' }));
    expect(onChange.mock.calls).toEqual([['2026-10-16'], ['2026-10-30']]);
  });

  it('no mês mostra o nome do mês e anda um mês', async () => {
    const onChange = vi.fn();
    render(<PeriodNav date="2026-10-28" scale="month" onChange={onChange} />);
    expect(screen.getByText('Outubro de 2026')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Período anterior' }));
    expect(onChange).toHaveBeenCalledWith(expect.stringMatching(/^2026-09-/));
  });

  it('fora do período atual diz se é anterior ou próximo e "Hoje" volta para hoje', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<PeriodNav date="2026-09-10" scale="month" onChange={onChange} />);
    expect(screen.getByText('Período anterior', { selector: 'p' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Hoje/ }));
    expect(onChange).toHaveBeenCalledWith('2026-10-28');

    rerender(<PeriodNav date="2026-11-10" scale="week" onChange={onChange} />);
    expect(screen.getByText('Próximo período', { selector: 'p' })).toBeInTheDocument();
  });
});
