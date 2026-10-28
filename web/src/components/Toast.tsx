import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { AlertIcon, CheckIcon, XIcon } from './icons';

type Tone = 'success' | 'warning' | 'error';
interface ToastItem {
  id: number;
  tone: Tone;
  message: string;
}

const ToastContext = createContext<(message: string, tone?: Tone) => void>(() => {});

export const useToast = () => useContext(ToastContext);

const toneStyle: Record<Tone, string> = {
  success: 'text-good-text bg-good-soft',
  warning: 'text-warning-text bg-warning-soft',
  error: 'text-critical-text bg-critical-soft',
};

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => setItems((all) => all.filter((t) => t.id !== id)), []);

  const push = useCallback(
    (message: string, tone: Tone = 'success') => {
      const id = nextId++;
      setItems((all) => [...all, { id, tone, message }]);
      setTimeout(() => dismiss(id), tone === 'success' ? 3000 : 6000);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-20 z-50 sm:bottom-4 flex flex-col items-center gap-2 px-4"
        role="status"
        aria-live="polite"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className="card rise pointer-events-auto flex max-w-md items-start gap-3 px-4 py-3 text-sm"
          >
            <span className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full ${toneStyle[t.tone]}`}>
              {t.tone === 'success' ? <CheckIcon size={14} /> : <AlertIcon size={14} />}
            </span>
            <p className="flex-1 pt-0.5 text-ink">{t.message}</p>
            <button
              onClick={() => dismiss(t.id)}
              className="rounded-md p-1 text-ink-3 hover:bg-surface-2 hover:text-ink"
              aria-label="Fechar aviso"
            >
              <XIcon size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
