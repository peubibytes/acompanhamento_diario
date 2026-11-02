// Peças comuns aos relatórios do dia e do período: exportar, escala e a lista de impedimentos.

import { formatDayMonth, type ReportBlockerItem } from '@acomp/shared';
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
  'rounded-full px-4 py-2 text-sm font-semibold text-ink-2 outline-none transition hover:bg-surface-2 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60';

export const GROUP = 'mb-2 text-2xs font-semibold tracking-wider text-ink-3 uppercase';

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

/** Impedimentos: aguardando quem e há quanto tempo, ou resolvido quando. */
export function BlockerList({ items }: { items: ReportBlockerItem[] }) {
  return (
    <ul className="mt-5 space-y-3 border-t border-line pt-5 text-sm">
      {items.map((i, index) => (
        <li key={index} className="flex gap-2.5">
          <span className={`mt-0.5 shrink-0 ${i.resolvedAt ? 'text-good-text' : 'text-warning-text'}`}>
            <HourglassIcon size={15} />
          </span>
          <span className="min-w-0 text-ink-2">
            <strong className="font-semibold text-ink">{i.label}</strong> —{' '}
            {i.resolvedAt
              ? `resolvido em ${formatDayMonth(i.resolvedAt)} (${i.owner})`
              : `aguardando ${i.owner} desde ${formatDayMonth(i.since)} (${plural(i.waitingWorkdays, 'dia útil', 'dias úteis')})`}
            {i.description && <span className="text-ink-3">: {i.description}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}
