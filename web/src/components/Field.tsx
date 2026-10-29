import type { ReactNode } from 'react';

/** Rótulo de formulário; `optional` acrescenta "· opcional". Explicações vão em placeholder ou ⓘ. */
export function Field({ label, optional, children }: { label: string; optional?: boolean; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-ink-2">
        {label}
        {optional && <span className="font-normal text-ink-3"> · opcional</span>}
      </span>
      {children}
    </label>
  );
}
