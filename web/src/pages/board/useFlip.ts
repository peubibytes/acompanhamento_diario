import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react';

interface Box {
  left: number;
  top: number;
}

const DURATION = 240;
const EASING = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
/** Um ponto de partida informado vale por este tempo: o lugar novo chega logo depois de soltar, não no mesmo render. */
const SEED_TTL = 600;

/**
 * Cartões que mudam de lugar deslizam até a posição nova, em vez de "pular" (técnica FLIP: mede antes
 * e depois de cada render e anima a diferença). Vale para reordenar, trocar de coluna e para os
 * vizinhos que abrem espaço. As posições são relativas ao quadro, para a rolagem da página não contar.
 * Com "reduzir movimento" ligado no sistema (ou sem suporte a animação), nada se move: só troca.
 *
 * Devolve `seed`: informa de onde um cartão deve partir no próximo render (ao soltar um arrasto, o
 * cartão sai de onde o fantasma estava, e não do lugar de origem).
 */
export function useFlip(container: RefObject<HTMLElement | null>, selector = '[data-card-id]') {
  const boxes = useRef(new Map<string, Box>());
  const seeds = useRef(new Map<string, { left: number; top: number; at: number }>());

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
      const box = { left: rect.left - origin.left, top: rect.top - origin.top };
      next.set(id, box);

      const before = boxes.current.get(id);
      let seed = seeds.current.get(id);
      if (seed && performance.now() - seed.at > SEED_TTL) {
        seeds.current.delete(id);
        seed = undefined;
      }
      // O cartão ainda não saiu do lugar: o ponto de partida fica guardado para o render em que ele sair.
      if (seed && before && Math.abs(before.left - box.left) < 1 && Math.abs(before.top - box.top) < 1) continue;
      if (seed) seeds.current.delete(id);
      const from = seed ? { left: seed.left - origin.left, top: seed.top - origin.top } : before;
      if (!from || still || typeof el.animate !== 'function') continue;
      const dx = from.left - box.left;
      const dy = from.top - box.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: DURATION, easing: EASING });
    }
    boxes.current = next;
  });

  /** Posição na janela (como em getBoundingClientRect) de onde o cartão parte no próximo render. */
  return useCallback((id: number, rect: { left: number; top: number }) => {
    seeds.current.set(String(id), { left: rect.left, top: rect.top, at: performance.now() });
  }, []);
}
