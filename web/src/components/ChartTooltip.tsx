import type { ReactNode } from 'react';

/** Espaço entre as colunas (e entre os rótulos de baixo, que acompanham as colunas). */
export const COLUMN_GAP = {
  week: 'gap-2 sm:gap-4',
  month: 'gap-px @lg:gap-1',
};

/**
 * No mês, quando há valores sobre as colunas, a etiqueta "Meta" da linha ganha uma faixa à direita
 * (fora das colunas) para não cobrir o valor da última.
 */
export const SIDE_GUTTER = { inset: '@[58rem]:right-[4.5rem]', pad: '@[58rem]:pr-[4.5rem]' };

/**
 * Tooltip dos gráficos de colunas: centrado na coluna (`center`, em % da largura) e preso às bordas
 * do gráfico (clamp), para não vazar da tela no celular. Só existe enquanto uma coluna está com o
 * mouse ou o foco: fechado, não ocupa lugar no layout. Posiciona-se pelo ancestral `relative`.
 */
export function ChartTooltip({ center, children }: { center: number; children: ReactNode }) {
  return (
    <span
      role="tooltip"
      style={{ left: `clamp(0px, calc(${center}% - 6rem), calc(100% - 12rem))` }}
      className="tip-surface pointer-events-none absolute bottom-full z-20 mb-2 w-48 animate-[hint-in_0.15s_ease-out_both] p-3 text-left"
    >
      {children}
    </span>
  );
}
