import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

interface Box {
  left: number;
  top: number;
}

// Os mesmos valores dos tokens de movimento do CSS (--dur-2 a --dur-3 e --ease-out, em index.css).
const DURATION = 240;
const EASING = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
/** Um ponto de partida informado vale por este tempo: o lugar novo chega logo depois de soltar, não no mesmo render. */
const SEED_TTL = 600;

const moved = (a: Box, b: Box) => Math.abs(a.left - b.left) >= 1 || Math.abs(a.top - b.top) >= 1;

/** O deslocamento que a animação em curso aplica agora ao elemento (zero sem animação). */
function currentOffset(el: HTMLElement, running: Animation | undefined): Box {
  if (!running || running.playState !== 'running') return { left: 0, top: 0 };
  const transform = getComputedStyle(el).transform;
  if (!transform || transform === 'none' || typeof DOMMatrixReadOnly !== 'function') return { left: 0, top: 0 };
  const m = new DOMMatrixReadOnly(transform);
  return { left: m.m41, top: m.m42 };
}

/**
 * Cartões que mudam de lugar deslizam até a posição nova, em vez de "pular" (técnica FLIP: mede antes
 * e depois de cada render e anima a diferença). Vale para reordenar, trocar de coluna e para os
 * vizinhos que abrem espaço. As posições são relativas ao quadro, para a rolagem da página não contar.
 * Com "reduzir movimento" ligado no sistema (ou sem suporte a animação), nada se move: só troca.
 *
 * Um movimento causa vários renders seguidos (a resposta otimista, a do servidor, a recarga), alguns
 * no meio da animação. Por isso o hook guarda sempre a posição de **layout** (a medida menos o
 * deslocamento da animação em curso): um render que não muda o layout deixa a animação seguir, e um
 * que muda parte de onde o cartão está na tela, sem pular nem voltar. Medir só o retângulo visual
 * gravava posições falsas, e o render seguinte animava cartões que não tinham saído do lugar.
 *
 * Devolve `seed`: informa de onde um cartão deve partir no próximo render (ao soltar um arrasto, o
 * cartão sai de onde o fantasma estava, e não do lugar de origem).
 */
export function useFlip(container: RefObject<HTMLElement | null>, selector = '[data-card-id]') {
  const boxes = useRef(new Map<string, Box>());
  const seeds = useRef(new Map<string, { left: number; top: number; at: number }>());
  const running = useRef(new Map<string, Animation>());

  // Sem dependências de propósito: mede a cada render (são poucos cartões).
  useLayoutEffect(() => {
    const root = container.current;
    if (!root) return;
    const origin = root.getBoundingClientRect();
    const still = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const next = new Map<string, Box>();

    for (const el of root.querySelectorAll<HTMLElement>(selector)) {
      const id = el.dataset.cardId;
      const rect = el.getBoundingClientRect();
      // Coluna escondida (celular): sem posição, sem animação.
      if (!id || rect.width === 0) continue;
      const current = running.current.get(id);
      const offset = currentOffset(el, current);
      // Onde o cartão está no layout, sem o deslocamento da animação em curso.
      const box = { left: rect.left - origin.left - offset.left, top: rect.top - origin.top - offset.top };
      next.set(id, box);

      const before = boxes.current.get(id);
      let seed = seeds.current.get(id);
      if (seed && performance.now() - seed.at > SEED_TTL) {
        seeds.current.delete(id);
        seed = undefined;
      }
      // Não saiu do lugar: a animação em curso (se houver) segue, e o ponto de partida fica para o render em que sair.
      if (before && !moved(before, box)) continue;
      if (seed) seeds.current.delete(id);
      // Parte de onde o cartão aparecia na tela: o fantasma solto, ou a posição anterior mais a animação em curso.
      const from = seed
        ? { left: seed.left - origin.left, top: seed.top - origin.top }
        : before && { left: before.left + offset.left, top: before.top + offset.top };
      current?.cancel();
      running.current.delete(id);
      if (!from || still || typeof el.animate !== 'function' || !moved(from, box)) continue;
      const animation = el.animate(
        [{ transform: `translate(${from.left - box.left}px, ${from.top - box.top}px)` }, { transform: 'none' }],
        { duration: DURATION, easing: EASING },
      );
      running.current.set(id, animation);
      animation.addEventListener?.('finish', () => {
        if (running.current.get(id) === animation) running.current.delete(id);
      });
    }
    boxes.current = next;
  });

  // Saiu da tela: nenhuma animação fica pendurada.
  useEffect(() => {
    const anims = running.current;
    return () => {
      for (const a of anims.values()) a.cancel();
      anims.clear();
    };
  }, []);

  /** Posição na janela (como em getBoundingClientRect) de onde o cartão parte no próximo render. */
  return useCallback((id: number, rect: { left: number; top: number }) => {
    seeds.current.set(String(id), { left: rect.left, top: rect.top, at: performance.now() });
  }, []);
}
