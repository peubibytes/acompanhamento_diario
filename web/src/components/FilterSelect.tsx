import { ChevronDown } from './icons';

/** Filtro discreto em forma de menu (select nativo): para escolhas secundárias, que não pedem uma faixa de botões. */
export function FilterSelect<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  /** Nome acessível do filtro (não aparece na tela). */
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="cursor-pointer appearance-none rounded-full bg-surface-2 py-1.5 pr-8 pl-3.5 text-sm font-medium text-ink outline-none transition hover:bg-surface-2/70 focus-visible:ring-2 focus-visible:ring-accent"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown size={14} className="pointer-events-none absolute right-3 text-ink-3" />
    </label>
  );
}
