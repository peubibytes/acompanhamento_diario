import type { ReactNode } from 'react';
import { InfoHint } from './InfoHint';

/**
 * Cabeçalho padrão das telas: o título, um ⓘ com o texto explicativo (que não fica fixo na
 * tela) e, à direita, a ação principal. Um filtro, quando a tela tem, vem logo abaixo.
 */
export function PageHeader({ title, hint, action }: { title: string; hint?: ReactNode; action?: ReactNode }) {
  return (
    <header className="flex min-h-10 flex-wrap items-center justify-between gap-x-4 gap-y-3">
      <div className="flex min-w-0 items-center gap-1.5">
        <h1 className="truncate text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {hint && <InfoHint label={`Sobre ${title}`}>{hint}</InfoHint>}
      </div>
      {action && <div className="flex shrink-0 flex-wrap items-center gap-3">{action}</div>}
    </header>
  );
}
