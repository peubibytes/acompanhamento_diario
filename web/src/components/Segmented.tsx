import type { ReactNode } from 'react';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
  count?: number;
}

/** Controle segmentado em pílula: uma opção por vez, com contagem opcional. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  size = 'md',
  stretch = false,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Nome acessível do grupo. */
  label: string;
  size?: 'sm' | 'md';
  /** Ocupa a largura toda, com as opções divididas por igual. */
  stretch?: boolean;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={`${stretch ? 'flex w-full' : 'inline-flex'} items-center rounded-full bg-surface-2 p-1`}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.value)}
            className={`inline-flex items-center justify-center gap-1.5 rounded-full font-medium whitespace-nowrap transition ${
              stretch ? 'min-w-0 flex-1' : ''
            } ${size === 'sm' ? 'px-3 py-1 text-xs' : 'px-3.5 py-1.5 text-sm'} ${
              on ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:text-ink'
            }`}
          >
            {o.icon}
            <span className="truncate">{o.label}</span>
            {o.count !== undefined && <span className="tabular text-xs text-ink-3">{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
