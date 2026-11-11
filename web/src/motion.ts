// Movimento feito em JavaScript (o que o CSS sozinho não faz). As durações e curvas das classes ficam
// em index.css; aqui valem as mesmas regras: curto, sem atrasar um clique, e nada se o sistema pede
// "reduzir movimento". Ver docs/decisions/0018.

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';

/**
 * Pode animar? Não, se o sistema pede "reduzir movimento" ou se o ambiente não sabe responder
 * (testes em jsdom): nesses casos tudo acontece na hora, como antes.
 */
export function motionOK(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** Tempo da saída de painéis e avisos (o --dur-2 do CSS): o elemento fica na tela até a animação acabar. */
export const EXIT_MS = 200;

const easeOut = (t: number) => 1 - (1 - t) ** 3;

/**
 * O número sobe (ou desce) até o valor novo, em vez de trocar de uma vez. Sempre inteiro. Sem
 * movimento permitido, devolve o valor na hora.
 */
export function useCountUp(value: number, duration = 650): number {
  const [shown, setShown] = useState(() => (motionOK() ? 0 : value));
  const from = useRef(shown);
  from.current = shown;

  useEffect(() => {
    if (!motionOK() || from.current === value) {
      setShown(value);
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let frame = requestAnimationFrame(function tick() {
      // O relógio é sempre o mesmo do início (o do quadro pode ter outra origem, conforme o ambiente).
      const t = Math.min(1, Math.max(0, (performance.now() - start) / duration));
      setShown(Math.round(origin + (value - origin) * easeOut(t)));
      if (t < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  return shown;
}

/**
 * O "polegar" de um controle segmentado: um fundo que desliza até a opção escolhida. Mede a opção
 * marcada (`selector`, dentro de `container`) e devolve o estilo do fundo; refaz a medida quando o
 * controle muda de tamanho. Na primeira medida o fundo aparece no lugar, sem deslizar de fora.
 */
export function useSlidingThumb(container: RefObject<HTMLElement | null>, selector: string, deps: unknown[]): CSSProperties | null {
  const [box, setBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const root = container.current;
    if (!root) return;
    const measure = () => {
      const el = root.querySelector<HTMLElement>(selector);
      if (!el || el.offsetWidth === 0) return setBox(null);
      const next = { left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight };
      setBox((b) => (b && b.left === next.left && b.top === next.top && b.width === next.width && b.height === next.height ? b : next));
    };
    measure();
    if (typeof ResizeObserver !== 'function') return;
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    for (const child of root.children) observer.observe(child);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // Só depois da primeira pintura com o fundo no lugar é que as mudanças passam a deslizar.
  useEffect(() => {
    if (!box || ready) return;
    const frame = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(frame);
  }, [box, ready]);

  if (!box) return null;
  return {
    left: box.left,
    top: box.top,
    width: box.width,
    height: box.height,
    transition: ready ? 'left var(--dur-3) var(--ease-out), width var(--dur-3) var(--ease-out), top var(--dur-3) var(--ease-out)' : 'none',
  };
}

/**
 * Mantém um elemento montado enquanto a saída dele é animada. `open` é o que quem usa quer; `mounted`
 * diz se ainda deve renderizar e `closing`, se está de saída (para trocar a classe de entrada pela de
 * saída). Sem movimento permitido, some na hora.
 */
export function useExit(open: boolean, ms = EXIT_MS): { mounted: boolean; closing: boolean } {
  const [mounted, setMounted] = useState(open);
  // Abrir é imediato (ajuste durante o render, sem um quadro vazio).
  if (open && !mounted) setMounted(true);

  useEffect(() => {
    if (open || !mounted) return;
    if (!motionOK()) return setMounted(false);
    const timer = setTimeout(() => setMounted(false), ms);
    return () => clearTimeout(timer);
  }, [open, mounted, ms]);

  // Sem movimento, fechado é fechado já neste render (os testes conferem logo depois do clique).
  if (!open && mounted && !motionOK()) return { mounted: false, closing: false };
  return { mounted: open || mounted, closing: !open && mounted };
}
