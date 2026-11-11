import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { BoardColumn } from '@acomp/shared';

/** Onde o cartão cairia se fosse solto agora: a coluna e a posição entre os cartões visíveis dela. */
export interface DropTarget {
  column: BoardColumn;
  index: number;
  /** A coluna aceita este cartão (ex.: treinamento não tem "Aguardando"). */
  allowed: boolean;
}

export interface DragState {
  id: number;
  width: number;
  over: DropTarget | null;
}

interface Session {
  id: number;
  pointerId: number;
  startX: number;
  startY: number;
  /** Distância do ponteiro ao canto do cartão, para o fantasma não "pular". */
  offsetX: number;
  offsetY: number;
  x: number;
  y: number;
  el: HTMLElement;
  active: boolean;
}

/** Quanto o ponteiro precisa andar para um clique virar arrasto. */
const START_DISTANCE = 6;
/** Faixa, no topo e no fim da janela, em que arrastar rola a página. */
const SCROLL_EDGE = 72;
const SCROLL_STEP = 14;

/**
 * Arrastar cartões entre colunas e dentro delas, com eventos de ponteiro (mouse, caneta e toque).
 * Com o mouse, o cartão inteiro arrasta; no toque, só a pega (`data-drag-handle`), para o dedo
 * continuar rolando a página. As colunas se identificam por `data-board-column` e os cartões por
 * `data-card-id`; Esc cancela. Quem não arrasta usa os botões e o seletor do cartão.
 */
export function useCardDrag({
  canDrop,
  onDrop,
}: {
  canDrop: (id: number, column: BoardColumn) => boolean;
  /** `from`: onde o fantasma estava ao soltar (para o cartão deslizar dali até o lugar novo). */
  onDrop: (id: number, target: DropTarget, from: { left: number; top: number } | null) => void;
}) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const ghost = useRef<HTMLDivElement>(null);
  const session = useRef<Session | null>(null);
  // As versões mais recentes, para os listeners da janela (registrados uma vez por arrasto).
  const latest = useRef({ canDrop, onDrop, over: null as DropTarget | null });
  latest.current.canDrop = canDrop;
  latest.current.onDrop = onDrop;

  // Os listeners da janela são criados uma vez e só leem refs: o mesmo par add/remove em qualquer render.
  const handlers = useMemo(() => {
    const placeGhost = () => {
      const s = session.current;
      if (s && ghost.current) {
        ghost.current.style.transform = `translate3d(${s.x - s.offsetX}px, ${s.y - s.offsetY}px, 0)`;
      }
    };

    const targetAt = (s: Session): DropTarget | null => {
      for (const col of document.querySelectorAll<HTMLElement>('[data-board-column]')) {
        const box = col.getBoundingClientRect();
        if (box.width === 0 || s.x < box.left || s.x > box.right) continue;
        const column = col.dataset.boardColumn as BoardColumn;
        const index = [...col.querySelectorAll<HTMLElement>('[data-card-id]')].filter((card) => {
          if (Number(card.dataset.cardId) === s.id) return false;
          const r = card.getBoundingClientRect();
          return s.y > r.top + r.height / 2;
        }).length;
        return { column, index, allowed: latest.current.canDrop(s.id, column) };
      }
      return null;
    };

    const finish = (drop: boolean) => {
      const s = session.current;
      if (!s) return;
      session.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKey);
      if (!s.active) return;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      // O "clique" que o navegador dispara ao soltar não deve abrir o link do cartão.
      const swallow = (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
      };
      window.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);

      const over = latest.current.over;
      const from = ghost.current?.getBoundingClientRect() ?? null;
      latest.current.over = null;
      setDrag(null);
      if (drop && over?.allowed) latest.current.onDrop(s.id, over, from);
    };

    function onMove(e: PointerEvent) {
      const s = session.current;
      if (!s || e.pointerId !== s.pointerId) return;
      s.x = e.clientX;
      s.y = e.clientY;
      if (!s.active) {
        if (Math.hypot(s.x - s.startX, s.y - s.startY) < START_DISTANCE) return;
        s.active = true;
        const box = s.el.getBoundingClientRect();
        s.offsetX = s.startX - box.left;
        s.offsetY = s.startY - box.top;
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'grabbing';
        setDrag({ id: s.id, width: box.width, over: null });
      }
      if (s.y < SCROLL_EDGE) window.scrollBy(0, -SCROLL_STEP);
      else if (s.y > window.innerHeight - SCROLL_EDGE) window.scrollBy(0, SCROLL_STEP);
      placeGhost();

      const over = targetAt(s);
      const before = latest.current.over;
      if (over?.column === before?.column && over?.index === before?.index && over?.allowed === before?.allowed) return;
      latest.current.over = over;
      setDrag((d) => (d ? { ...d, over } : d));
    }
    function onUp(e: PointerEvent) {
      if (e.pointerId === session.current?.pointerId) finish(true);
    }
    function onCancel(e: PointerEvent) {
      if (e.pointerId === session.current?.pointerId) finish(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') finish(false);
    }

    const start = (id: number, e: ReactPointerEvent<HTMLElement>) => {
      if (session.current || (e.pointerType === 'mouse' && e.button !== 0)) return;
      const target = e.target as HTMLElement;
      const onHandle = target.closest('[data-drag-handle]') !== null;
      // No toque, só a pega arrasta; com o mouse, tudo menos os controles do cartão.
      if (e.pointerType === 'touch' ? !onHandle : !onHandle && target.closest('button, select, input, textarea') !== null) return;
      session.current = {
        id,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        offsetX: 0,
        offsetY: 0,
        x: e.clientX,
        y: e.clientY,
        el: e.currentTarget,
        active: false,
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
      window.addEventListener('keydown', onKey);
    };

    return { placeGhost, finish, start };
  }, []);

  // O fantasma só existe depois do primeiro render do arrasto: posiciona-o antes da pintura.
  useLayoutEffect(handlers.placeGhost, [drag?.id, handlers]);
  // Saiu da tela no meio de um arrasto: nada fica pendurado na janela.
  useEffect(() => () => handlers.finish(false), [handlers]);

  const onPointerDown = (id: number) => (e: ReactPointerEvent<HTMLElement>) => handlers.start(id, e);

  return { drag, ghostRef: ghost, onPointerDown };
}
