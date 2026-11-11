// Peças comuns aos relatórios do dia e do período: exportar, escala, tabela leve e a lista de impedimentos.

import type { ReactNode } from 'react';
import { blockerText, type ReportBlockerItem } from '@acomp/shared';
import { HourglassIcon } from '../../components/icons';
import { Segmented } from '../../components/Segmented';
import { useToast } from '../../components/Toast';

export type ReportScale = 'dia' | 'semana' | 'mes';

const SCALES: { value: ReportScale; label: string }[] = [
  { value: 'dia', label: 'Dia' },
  { value: 'semana', label: 'Semana' },
  { value: 'mes', label: 'Mês' },
];

/** Dia (daily), Semana ou Mês (1:1 e prestação de contas). */
export function ScaleSwitch({ value, onChange }: { value: ReportScale; onChange: (scale: ReportScale) => void }) {
  return <Segmented size="sm" label="Escala do relatório" value={value} onChange={onChange} options={SCALES} />;
}

export const SECONDARY =
  'btn-ghost';

export const GROUP = 'mb-2 text-xs font-medium text-ink-3';

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Copiar o Markdown e baixá-lo como arquivo. */
export function useReportExport(markdown: string, fileName: string) {
  const toast = useToast();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      toast('Relatório copiado.');
    } catch {
      toast('Não foi possível copiar. Use "Baixar .md".', 'error');
    }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  };
  return { copy, download };
}

/** "Baixar .md" e "Imprimir / PDF", à direita da navegação. */
export function ExportButtons({ ready, onDownload }: { ready: boolean; onDownload: () => void }) {
  return (
    <div className="flex items-center gap-1">
      <button type="button" onClick={onDownload} disabled={!ready} className={SECONDARY}>
        Baixar .md
      </button>
      <button type="button" onClick={() => window.print()} disabled={!ready} className={SECONDARY}>
        Imprimir / PDF
      </button>
    </div>
  );
}

/** Impedimentos: aguardando quem e há quanto tempo, ou resolvido quando. `bare` tira o filete de cima. */
export function BlockerList({ items, bare = false }: { items: ReportBlockerItem[]; bare?: boolean }) {
  return (
    <ul className={`space-y-3 text-sm ${bare ? '' : 'mt-5 border-t border-line pt-5'}`}>
      {items.map((i, index) => (
        <li key={index} className="flex gap-2.5">
          <span className={`mt-0.5 shrink-0 ${i.resolvedAt ? 'text-good-text' : 'text-warning-text'}`}>
            <HourglassIcon size={15} />
          </span>
          <span className="min-w-0 text-ink-2">
            <strong className="font-semibold text-ink">{i.label}</strong> — {blockerText(i)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Tabela leve: listras suaves em vez de bordas, cabeçalho discreto e a coluna `numeric` à direita.
 * Usada quando um tipo passa de três itens; no celular, rola dentro dela, nunca a página.
 */
export function LightTable({
  caption,
  head,
  rows,
  numeric,
  hideOnMobile = [],
}: {
  caption: string;
  head: string[];
  rows: { key: number; cells: ReactNode[] }[];
  numeric?: number;
  /** Colunas que somem no celular (o conteúdo delas vai para a primeira coluna, só no celular). */
  hideOnMobile?: number[];
}) {
  const align = (index: number) =>
    `${index === numeric ? 'text-right tabular' : 'text-left'} ${hideOnMobile.includes(index) ? 'hidden sm:table-cell' : ''}`;
  return (
    <div className="mt-5 overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <caption className={`${GROUP} text-left`}>{caption}</caption>
        <thead>
          <tr className="border-b border-line">
            {head.map((h, index) => (
              <th key={h} scope="col" className={`px-2 py-1.5 text-xs font-semibold text-ink-3 ${align(index)}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="align-top even:bg-surface-2">
              {r.cells.map((c, index) => (
                <td key={index} className={`px-2 py-2 text-ink-2 ${index === 0 ? 'whitespace-nowrap' : ''} ${align(index)}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
