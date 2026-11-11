import { useRef, type ReactNode } from 'react';
import { useSlidingThumb } from '../motion';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
  count?: number;
}

/**
 * Controle segmentado em pílula: uma opção por vez, com contagem opcional. O fundo da opção escolhida
 * desliza até a nova escolha (onde não dá para medir a tela, a opção só troca de fundo).
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  size = 'md',
  stretch = false,
  dense = false,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Nome acessível do grupo. */
  label: string;
  size?: 'sm' | 'md';
  /** No celular, ocupa a largura toda com as opções divididas por igual; de sm em diante, o tamanho do conteúdo. */
  stretch?: boolean;
  /** No celular, texto e margem menores, para caberem muitas opções sem truncar (só com `stretch`). */
  dense?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const thumb = useSlidingThumb(root, '[aria-selected="true"]', [value, options.length, size, stretch, dense]);

  return (
    <div
      ref={root}
      role="tablist"
      aria-label={label}
      className={`${stretch ? 'flex w-full sm:inline-flex sm:w-auto' : 'inline-flex'} relative items-center rounded-full bg-surface-2 p-1`}
    >
      {thumb && <span aria-hidden="true" className="pointer-events-none absolute rounded-full bg-surface shadow-sm" style={thumb} />}
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.value)}
            className={`press relative inline-flex items-center justify-center gap-1.5 rounded-full font-medium whitespace-nowrap ${
              stretch ? `min-w-0 ${dense ? 'flex-auto' : 'flex-1'} sm:flex-none` : ''
            } ${size === 'sm' ? 'px-3 py-1 text-xs' : stretch ? `${dense ? 'px-1 text-xs max-[22.5rem]:px-0.5 max-[22.5rem]:text-2xs' : 'px-2 text-sm'} py-1.5 sm:px-3.5 sm:text-sm` : 'px-3.5 py-1.5 text-sm'} ${
              on ? (thumb ? 'text-ink' : 'bg-surface text-ink shadow-sm') : 'text-ink-2 hover:text-ink'
            }`}
          >
            {o.icon}
            <span className="truncate">{o.label}</span>
            {o.count !== undefined && (
              // Com `dense`, a contagem some nas telas mais estreitas: o nome inteiro vale mais que o número.
              <span className={`tabular text-xs text-ink-3 ${dense ? 'max-[26rem]:hidden' : ''}`}>{o.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
