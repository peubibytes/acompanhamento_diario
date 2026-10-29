import type { ReactNode } from 'react';
import { ArrowLeft } from './icons';
import { InfoHint } from './InfoHint';

/**
 * Cabeçalho padrão das telas: o título, um ⓘ com o texto explicativo (que não fica fixo na
 * tela) e, à direita, a ação principal. Um filtro, quando a tela tem, vem logo abaixo.
 * `onBack` acrescenta uma seta de voltar antes do título, para as telas sem item no menu.
 */
export function PageHeader({
  title,
  hint,
  action,
  onBack,
}: {
  title: string;
  hint?: ReactNode;
  action?: ReactNode;
  onBack?: () => void;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
      <div className="flex min-h-10 min-w-0 items-center gap-1.5">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Voltar"
            className="-ml-2 grid size-9 shrink-0 place-items-center rounded-full text-ink-2 outline-none transition hover:bg-surface-2 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"
          >
            <ArrowLeft size={18} />
          </button>
        )}
        <h1 className="truncate text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {hint && <InfoHint label={`Sobre ${title}`}>{hint}</InfoHint>}
      </div>
      {action && <div className="flex shrink-0 flex-wrap items-center gap-3">{action}</div>}
    </header>
  );
}
