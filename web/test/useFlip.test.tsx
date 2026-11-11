import { render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFlip } from '../src/pages/board/useFlip';

/*
 * O jsdom não tem layout nem animações. Aqui cada cartão tem uma posição de layout (data-top: 100 px por
 * posição na coluna) e `animate` devolve uma animação falsa cujo deslocamento atual (`progress`) entra
 * em getBoundingClientRect e em getComputedStyle(...).transform, como num navegador no meio da animação.
 */

interface FakeAnimation {
  playState: 'running' | 'finished' | 'idle';
  dx: number;
  dy: number;
  cancel: () => void;
  addEventListener: () => void;
}

let calls: { id: string; dx: number; dy: number }[];
let cancels: string[];
let anims: Map<Element, FakeAnimation>;
/** Fração do caminho que ainda falta percorrer nas animações em curso (1 = acabou de começar). */
let remaining: number;

const offsetOf = (el: Element) => {
  const a = anims.get(el);
  return a?.playState === 'running' ? { x: a.dx * remaining, y: a.dy * remaining } : { x: 0, y: 0 };
};

beforeEach(() => {
  calls = [];
  cancels = [];
  anims = new Map();
  remaining = 1;
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} }));
  vi.stubGlobal(
    'DOMMatrixReadOnly',
    class {
      m41: number;
      m42: number;
      constructor(value: string) {
        const n = (value.match(/-?[\d.]+/g) ?? []).map(Number);
        this.m41 = n[4] ?? 0;
        this.m42 = n[5] ?? 0;
      }
    },
  );
  vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element) => {
    const { x, y } = offsetOf(el);
    return { transform: x || y ? `matrix(1, 0, 0, 1, ${x}, ${y})` : 'none' } as CSSStyleDeclaration;
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const card = this.dataset.cardId !== undefined;
    const { x, y } = offsetOf(this);
    const left = Number(this.dataset.left ?? 0) + x;
    const top = Number(this.dataset.top ?? 0) + y;
    return { left, top, right: left + 100, bottom: top + 90, width: card ? 100 : 1000, height: 90, x: left, y: top } as DOMRect;
  });
  HTMLElement.prototype.animate = function (this: HTMLElement, keyframes: Keyframe[]) {
    const [, dx, dy] = /translate\(([-\d.e]+)px, ([-\d.e]+)px\)/.exec(String(keyframes[0].transform))!.map(Number);
    const id = this.dataset.cardId!;
    const animation: FakeAnimation = {
      playState: 'running',
      dx,
      dy,
      cancel() {
        this.playState = 'idle';
        cancels.push(id);
      },
      addEventListener() {},
    };
    anims.set(this, animation);
    calls.push({ id, dx, dy });
    return animation as unknown as Animation;
  } as typeof HTMLElement.prototype.animate;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
});

/** Duas colunas, como no Kanban: a ordem da primeira muda; a segunda ("Aguardando") nunca. */
function Board({ order, waiting = ['7', '8'] }: { order: string[]; waiting?: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useFlip(ref);
  return (
    <div ref={ref}>
      <ol>
        {order.map((id, i) => (
          <li key={id} data-card-id={id} data-top={i * 100} />
        ))}
      </ol>
      <ol>
        {waiting.map((id, i) => (
          <li key={id} data-card-id={id} data-left={300} data-top={i * 100} />
        ))}
      </ol>
    </div>
  );
}

const finishAll = () => anims.forEach((a) => (a.playState = 'finished'));

describe('useFlip (cartões do Kanban deslizam até o lugar novo)', () => {
  it('ao trocar dois cartões, cada um parte do lugar antigo; a outra coluna não se mexe', () => {
    const { rerender } = render(<Board order={['1', '2', '3']} />);
    rerender(<Board order={['2', '1', '3']} />);
    expect(calls).toEqual([
      { id: '2', dx: 0, dy: 100 },
      { id: '1', dx: 0, dy: -100 },
    ]);
  });

  it('um render no meio da animação, sem mudar o layout, deixa a animação seguir (não anima ao contrário)', () => {
    const { rerender } = render(<Board order={['1', '2', '3']} />);
    rerender(<Board order={['2', '1', '3']} />);
    calls = [];
    // A resposta do servidor e a recarga chegam com a animação ainda no começo.
    remaining = 0.9;
    rerender(<Board order={['2', '1', '3']} />);
    rerender(<Board order={['2', '1', '3']} />);
    expect(calls).toEqual([]);
    expect(cancels).toEqual([]);
  });

  it('depois de renders no meio da animação, o movimento seguinte anima, e só os cartões que mudaram', () => {
    const { rerender } = render(<Board order={['1', '2', '3']} />);
    rerender(<Board order={['2', '1', '3']} />);
    remaining = 0.9;
    rerender(<Board order={['2', '1', '3']} />);
    finishAll();
    calls = [];
    rerender(<Board order={['1', '2', '3']} />);
    expect(calls).toEqual([
      { id: '1', dx: 0, dy: 100 },
      { id: '2', dx: 0, dy: -100 },
    ]);
    expect(calls.some((c) => c.id === '7' || c.id === '8')).toBe(false);
  });

  it('a coluna "Aguardando" não anima ao reordenar outra coluna, mesmo depois de ter animado', () => {
    const { rerender } = render(<Board order={['1', '2']} waiting={['7', '8']} />);
    rerender(<Board order={['1', '2']} waiting={['8', '7']} />);
    remaining = 0.5;
    rerender(<Board order={['1', '2']} waiting={['8', '7']} />);
    finishAll();
    calls = [];
    rerender(<Board order={['2', '1']} waiting={['8', '7']} />);
    expect(calls.map((c) => c.id).sort()).toEqual(['1', '2']);
  });

  it('um movimento no meio da animação parte de onde o cartão está na tela', () => {
    const { rerender } = render(<Board order={['1', '2', '3']} />);
    rerender(<Board order={['2', '1', '3']} />); // 1 desce de 0 para 100
    remaining = 0.5; // 1 está na tela em 50
    calls = [];
    rerender(<Board order={['2', '3', '1']} />); // 1 vai para 200
    const one = calls.find((c) => c.id === '1');
    expect(one).toEqual({ id: '1', dx: 0, dy: 50 - 200 });
    expect(cancels).toContain('1');
  });
});
