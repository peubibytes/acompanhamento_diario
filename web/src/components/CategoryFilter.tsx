import { useRef, type CSSProperties, type KeyboardEvent } from 'react';
import type { DemandCategory } from '@acomp/shared';
import { categoryColor, categoryIcon, categoryInk } from './DemandVisuals';

export interface CategoryOption<T extends string> {
  value: T;
  /** O nome no plural ("Chamados"). */
  label: string;
  /** O tipo de demanda: dá o ícone e a cor. Sem ele (Todos), o chip é neutro. */
  category?: DemandCategory;
  count?: number;
  /** O que a contagem conta, no nome acessível ("Chamados, 3 em aberto"). */
  countLabel?: string;
  /** Opções de grupos diferentes ganham um divisor entre elas (ex.: Tarefas | Ciclo). */
  group?: string;
}

/**
 * Seletor de categoria em chips: todas as opções à vista, cada uma com o ícone e a cor do tipo, o nome e a
 * contagem. Uma escolha por vez (radiogroup): Tab entra no escolhido; ←/→, Home e End trocam.
 * A cor nunca é a única pista: o escolhido tem também o anel e o texto forte.
 */
export function CategoryFilter<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  /** Nome acessível do grupo (não aparece na tela). */
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: CategoryOption<T>[];
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const current = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );

  const choose = (index: number) => {
    const next = (index + options.length) % options.length;
    onChange(options[next].value);
    buttons.current[next]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const step: Record<string, () => void> = {
      ArrowRight: () => choose(current + 1),
      ArrowDown: () => choose(current + 1),
      ArrowLeft: () => choose(current - 1),
      ArrowUp: () => choose(current - 1),
      Home: () => choose(0),
      End: () => choose(options.length - 1),
    };
    if (!step[e.key]) return;
    e.preventDefault();
    step[e.key]();
  };

  return (
    <div role="radiogroup" aria-label={label} onKeyDown={onKeyDown} className="flex flex-wrap items-center gap-2 max-sm:gap-1.5">
      {options.map((o, i) => {
        const on = i === current;
        const empty = o.count === 0 && !on;
        const style = o.category
          ? ({ '--chip': categoryColor[o.category], '--chip-ink': categoryInk[o.category] } as CSSProperties)
          : undefined;
        return (
          <span key={o.value} className="contents">
            {i > 0 && o.group !== options[i - 1].group && (
              <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-line-strong/30" />
            )}
            <button
              ref={(el) => {
                buttons.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={o.count === undefined ? undefined : `${o.label}, ${o.count}${o.countLabel ? ` ${o.countLabel}` : ''}`}
              tabIndex={on ? 0 : -1}
              onClick={() => onChange(o.value)}
              style={style}
              className={`chip press inline-flex items-center gap-1.5 rounded-control py-1 pl-2.5 text-sm font-medium whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-accent max-sm:gap-1 max-sm:pl-2 max-sm:text-xs ${
                o.count === undefined ? 'pr-2.5 max-sm:pr-2' : 'pr-1 max-sm:pr-1'
              } ${on ? '' : empty ? 'text-ink-3 hover:text-ink-2' : 'text-ink-2 hover:text-ink'}`}
            >
              {o.category && (
                // Escolhido, o chip é invertido (fundo preto): o ícone acompanha o texto, e a cor do tipo vai para o
                // quadradinho ao lado, que contrasta com o fundo nos dois temas.
                <span aria-hidden="true" className="inline-flex items-center gap-1" style={on ? undefined : { color: categoryInk[o.category] }}>
                  {on && <span className="size-2" style={{ background: categoryColor[o.category] }} />}
                  {categoryIcon[o.category](14)}
                </span>
              )}
              <span>{o.label}</span>
              {o.count !== undefined && (
                <span
                  className={`num min-w-5 rounded-badge bg-surface-2 px-1 text-center text-xs leading-5 max-sm:min-w-4 ${on ? 'text-ink' : 'text-ink-3'}`}
                >
                  {o.count}
                </span>
              )}
            </button>
          </span>
        );
      })}
    </div>
  );
}
