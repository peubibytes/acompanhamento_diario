import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { XIcon } from './icons';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Painel deslizante (modal) que sai da direita e, no celular, ocupa a tela. Abriga formulários
 * sem disputar a atenção com a lista. Teclado e leitor de tela: diálogo modal com foco preso
 * dentro dele, Esc fecha, o foco volta a quem o abriu e a rolagem da página fica travada.
 * Com `dirty`, fechar (✕, Esc ou clique fora) pede confirmação antes de descartar o que foi digitado.
 */
export function SlideOver({
  open,
  onClose,
  title,
  subtitle,
  dirty = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** Há algo digitado que se perderia ao fechar. */
  dirty?: boolean;
  children: ReactNode;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const [confirming, setConfirming] = useState(false);

  const requestClose = () => (dirty ? setConfirming(true) : onClose());
  // Guarda a versão mais recente para o listener de teclado (registrado uma vez por abertura).
  const latest = useRef({ confirming, requestClose });
  latest.current = { confirming, requestClose };

  useEffect(() => {
    if (!open) {
      setConfirming(false);
      return;
    }
    const opener = document.activeElement as HTMLElement | null;
    const root = document.documentElement;
    root.style.overflow = 'hidden';

    // Foco inicial: o primeiro campo do corpo; na falta dele, o próprio painel.
    const frame = requestAnimationFrame(() => {
      const body = panel.current?.querySelector<HTMLElement>('[data-slideover-body]');
      (body?.querySelector<HTMLElement>(FOCUSABLE) ?? panel.current)?.focus();
    });

    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const { confirming: asking, requestClose: close } = latest.current;
      if (asking) setConfirming(false);
      else close();
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKeyDown);
      root.style.overflow = '';
      if (opener?.isConnected) opener.focus();
    };
  }, [open]);

  if (!open) return null;

  /** Tab e Shift+Tab giram dentro do painel. */
  const trapFocus = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !panel.current) return;
    const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
    if (items.length === 0) {
      e.preventDefault();
      return;
    }
    const [first, last] = [items[0], items[items.length - 1]];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === panel.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    // z-40: acima do header (z-30) e abaixo dos avisos (z-50).
    <div className="fixed inset-0 z-40">
      <div className="hint-in absolute inset-0 bg-black/40" onClick={requestClose} aria-hidden="true" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={trapFocus}
        className="slide-in absolute inset-y-0 right-0 flex w-full flex-col border-l border-line bg-surface shadow-[var(--shadow-pop)] outline-none sm:max-w-[28rem]"
      >
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-ink">
              {title}
            </h2>
            {subtitle && <p className="mt-0.5 text-xs text-ink-3">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Fechar"
            className="-mt-1 -mr-1.5 grid size-9 shrink-0 place-items-center rounded-full text-ink-3 outline-none transition hover:bg-surface-2 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"
          >
            <XIcon size={18} />
          </button>
        </header>

        {confirming && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 bg-warning-soft px-5 py-3 text-sm text-warning-text sm:px-6"
          >
            <span className="font-medium">Descartar o que foi digitado?</span>
            <span className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-full px-3 py-1 text-xs font-semibold outline-none hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-accent"
              >
                Continuar editando
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full bg-critical px-3 py-1 text-xs font-semibold text-white outline-none hover:brightness-110 focus-visible:ring-2 focus-visible:ring-accent"
              >
                Descartar
              </button>
            </span>
          </div>
        )}

        <div data-slideover-body className="flex-1 overflow-y-auto px-5 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-6">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
