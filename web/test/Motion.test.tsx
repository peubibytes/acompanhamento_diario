import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProgressRing } from '../src/components/ProgressRing';
import { Segmented } from '../src/components/Segmented';
import { SlideOver } from '../src/components/SlideOver';

/** O jsdom não tem matchMedia: aqui ele responde como um navegador, com ou sem "reduzir movimento". */
function stubMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

afterEach(() => vi.unstubAllGlobals());

function Panel() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Abrir</button>
      {/* Como nas telas: ao fechar, o título e o conteúdo deixam de ser passados. */}
      <SlideOver open={open} onClose={() => setOpen(false)} title={open ? 'Declarar chamado' : ''}>
        {open && <p>Conteúdo do painel</p>}
      </SlideOver>
    </>
  );
}

describe('Movimento', () => {
  it('o painel deslizante sai animado, ainda com o conteúdo, e devolve o foco na hora', async () => {
    stubMotion(false);
    render(<Panel />);
    const opener = screen.getByRole('button', { name: 'Abrir' });
    await userEvent.click(opener);
    expect(screen.getByRole('dialog', { name: 'Declarar chamado' })).toHaveClass('slide-in');

    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    const leaving = screen.getByRole('dialog', { hidden: true });
    expect(leaving).toHaveClass('slide-out');
    expect(screen.getByText('Conteúdo do painel')).toBeInTheDocument();
    expect(opener).toHaveFocus();
    expect(document.documentElement.style.overflow).toBe('');

    await waitFor(() => expect(screen.queryByRole('dialog', { hidden: true })).not.toBeInTheDocument());
  });

  it('com "reduzir movimento", o painel some na hora', async () => {
    stubMotion(true);
    render(<Panel />);
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(screen.queryByRole('dialog', { hidden: true })).not.toBeInTheDocument();
  });

  it('reabrir durante a saída mostra o painel de novo, sem ficar preso fechando', async () => {
    stubMotion(false);
    render(<Panel />);
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    expect(screen.getByRole('dialog', { name: 'Declarar chamado' })).toHaveClass('slide-in');
    // O tempo da saída anterior passa e o painel continua aberto.
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(screen.getByRole('dialog', { name: 'Declarar chamado' })).toBeInTheDocument();
  });

  it('o anel de progresso conta até o valor; com "reduzir movimento", mostra o valor direto', async () => {
    stubMotion(true);
    const { unmount } = render(<ProgressRing percent={42} />);
    expect(screen.getByText('42')).toBeInTheDocument();
    unmount();

    stubMotion(false);
    render(<ProgressRing percent={42} />);
    expect(screen.queryByText('42')).not.toBeInTheDocument();
    expect(await screen.findByText('42', undefined, { timeout: 8000 })).toBeInTheDocument();
    // O texto acessível traz o valor final desde o início.
    expect(screen.getByRole('img', { name: '42% das horas da semana apontadas' })).toBeInTheDocument();
  });

  it('o controle segmentado continua marcando a opção escolhida', async () => {
    stubMotion(false);
    function Tabs() {
      const [value, setValue] = useState<'a' | 'b'>('a');
      return <Segmented label="Exemplo" value={value} onChange={setValue} options={[{ value: 'a', label: 'Um' }, { value: 'b', label: 'Dois' }]} />;
    }
    render(<Tabs />);
    await userEvent.click(screen.getByRole('tab', { name: 'Dois' }));
    expect(screen.getByRole('tab', { name: 'Dois' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Um' })).toHaveAttribute('aria-selected', 'false');
  });

  it('o foco inicial do painel não tira o foco de um campo que a pessoa já escolheu dentro dele', async () => {
    stubMotion(false);
    // O foco inicial vem um quadro depois de abrir: o clique no segundo campo chega antes dele.
    render(
      <SlideOver open onClose={() => {}} title="Declarar chamado">
        <button type="button">Chamado</button>
        <input aria-label="Número do chamado" />
      </SlideOver>,
    );
    const field = screen.getByLabelText('Número do chamado');
    field.focus();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(field).toHaveFocus();
  });
});
