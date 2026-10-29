import type { ReactNode } from 'react';
import { InfoHint } from './InfoHint';

/** Rótulo curto de um bloco da tela, com o ⓘ do texto explicativo e um espaço à direita (filtro ou link). */
export function SectionTitle({ title, hint, aside }: { title: string; hint?: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="flex items-center gap-1.5">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {hint && <InfoHint label={`Sobre ${title.toLowerCase()}`}>{hint}</InfoHint>}
      </div>
      {aside}
    </div>
  );
}
