import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { InfoIcon } from './icons';

type Side = 'bottom' | 'top';

/** Folga mínima entre a dica e a borda da janela. */
const EDGE = 8;
const GAP = 8;

/**
 * ⓘ que guarda o texto explicativo de uma tela, métrica ou gráfico. A dica abre ao passar o
 * mouse, ao focar pelo teclado ou ao tocar (toque de novo, ou fora, para fechar); Esc fecha.
 * O texto fica ligado ao botão por aria-describedby, então leitores de tela o anunciam.
 * Centralizada no ícone, a dica é deslocada para dentro da janela (e abre para cima, se faltar
 * espaço embaixo), em vez de vazar pela borda.
 */
export function InfoHint({
  children,
  label = 'Mais informações',
  className = '',
}: {
  children: ReactNode;
  /** Nome acessível do botão; use algo específico ("Sobre o painel") quando houver vários ⓘ. */
  label?: string;
  className?: string;
}) {
  const id = useId();
  const root = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const tip = useRef<HTMLSpanElement>(null);
  // Três origens independentes: o ponteiro do mouse, o foco do teclado e o toque/clique.
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [pinned, setPinned] = useState(false);
  // `left` é o deslocamento, em px, da dica em relação ao ícone; nulo = centralizada.
  const [place, setPlace] = useState<{ left: number | null; side: Side }>({ left: null, side: 'bottom' });
  const open = hover || focus || pinned;

  const close = () => {
    setHover(false);
    setFocus(false);
    setPinned(false);
  };

  // Fechada, a dica sai do layout (display: none): invisível mas presente, ela ainda criaria
  // rolagem horizontal quando passasse da borda. Ao abrir, é medida antes de pintar.
  useLayoutEffect(() => {
    if (!open || !button.current || !tip.current) return;
    const b = button.current.getBoundingClientRect();
    const t = tip.current.getBoundingClientRect();
    const origin = root.current!.getBoundingClientRect().left;
    // clientWidth/Height, não innerWidth: no celular, uma dica que ainda não foi reposicionada
    // alarga a janela virtual por um instante, e innerWidth passaria a medir essa janela alargada.
    const { clientWidth: vw, clientHeight: vh } = document.documentElement;
    const centered = b.left + b.width / 2 - t.width / 2;
    // Limita a borda esquerda da dica à janela; se ela for mais larga que a janela, vale a esquerda.
    const left = Math.max(EDGE, Math.min(centered, vw - EDGE - t.width)) - origin;
    const fitsBelow = b.bottom + GAP + t.height <= vh - EDGE;
    const side: Side = fitsBelow || b.top - GAP - t.height < EDGE ? 'bottom' : 'top';
    setPlace((p) => (p.left === left && p.side === side ? p : { left, side }));
  }, [open]);

  // Tocar fora fecha (no celular não há "sair com o ponteiro"); Esc fecha mesmo quando a dica
  // abriu só por hover. Na captura, para o Esc não fechar também o painel ou modal que a contém.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) close();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      close();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open]);

  return (
    <span
      ref={root}
      className={`relative inline-flex align-middle ${className}`}
      // Só o mouse abre por passagem; no toque o "hover" emulado atrapalharia o clique.
      onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(true)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(false)}
    >
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-describedby={id}
        onClick={() => setPinned((p) => !p)}
        // Foco por clique não abre (o clique já decide); só o foco de teclado.
        onFocus={(e) => e.currentTarget.matches(':focus-visible') && setFocus(true)}
        onBlur={close}
        className={`grid size-6 place-items-center rounded-full outline-none transition hover:text-ink focus-visible:ring-2 focus-visible:ring-accent pointer-coarse:-m-1.5 pointer-coarse:size-9 ${
          open ? 'text-ink' : 'text-ink-3'
        }`}
      >
        <InfoIcon size={16} />
      </button>

      <span
        ref={tip}
        id={id}
        role="tooltip"
        // Clicar no texto da dica não tira o foco do botão (o que a fecharia).
        onMouseDown={(e) => e.preventDefault()}
        style={place.left === null ? undefined : { left: place.left }}
        className={`absolute z-30 w-max max-w-[min(18rem,calc(100vw-1rem))] ${
          place.left === null ? 'left-1/2 -translate-x-1/2' : ''
        } ${
          place.side === 'bottom' ? 'top-full pt-2' : 'bottom-full pb-2'
        } ${open ? 'hint-in block' : 'hidden'}`}
      >
        {/* O espaçamento acima faz parte da área de passagem: o mouse alcança a dica sem fechá-la. */}
        <span className="tip-surface block p-3 text-left text-xs leading-relaxed font-normal tracking-normal whitespace-normal text-ink-2 normal-case">
          {children}
        </span>
      </span>
    </span>
  );
}
