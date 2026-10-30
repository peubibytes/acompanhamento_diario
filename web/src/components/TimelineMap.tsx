import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import {
  DEMAND_EVENT_LABEL,
  formatDayMonth,
  snakeColumns,
  snakeLayout,
  type CycleDemand,
  type SnakeCell,
  type TimelineEntry,
} from '@acomp/shared';
import { CalendarIcon, FlagIcon, TargetIcon } from './icons';
import { dayLabel, kindStyle } from './Timeline';

/** Quantos registros o mapa mostra (os mais recentes); o resto fica em Detalhes → Ciclos. */
export const MAP_MAX_ENTRIES = 12;

const NODE_WIDTH = 112; // px: largura mínima de cada nó, que define quantas colunas cabem
const ROW = '6rem'; // altura de cada linha do mapa
const LINE = 'bg-ink-3/40';
const BORDER = 'border-ink-3/40';

interface MapNode {
  key: string;
  /** Linha curta sob o nó (a data, ou o nome do marco). */
  caption: string;
  /** Segunda linha sob o nó. */
  sub: string;
  /** O nó em si: o círculo com o ícone. */
  dot: ReactNode;
  /** Texto completo, no hover e no foco. */
  tip: ReactNode;
  /** Descrição para leitor de tela. */
  aria: string;
  /** Nó que leva a outra tela, em vez de só mostrar a dica. */
  href?: string;
}

/** O círculo do nó: 32 px, centralizado na coluna (é nele que as linhas se encontram). */
const DOT = 'mx-auto grid size-8 place-items-center rounded-full';

function nodesOf(demand: CycleDemand, entries: TimelineEntry[], moreHref: string): MapNode[] {
  // Do mais antigo ao mais novo; só os últimos MAP_MAX_ENTRIES.
  const ordered = [...entries].sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
  const hidden = Math.max(0, ordered.length - MAP_MAX_ENTRIES);
  const shown = ordered.slice(hidden);

  const nodes: MapNode[] = [
    {
      key: 'inicio',
      caption: formatDayMonth(demand.startDate),
      sub: 'Início',
      dot: (
        <span className={`${DOT} border-2 border-ink-3 bg-surface text-ink-2`}>
          <CalendarIcon size={14} />
        </span>
      ),
      tip: <>Início em {dayLabel(demand.startDate)}</>,
      aria: `Início em ${dayLabel(demand.startDate)}`,
    },
  ];

  if (hidden > 0) {
    nodes.push({
      key: 'mais',
      caption: `+${hidden}`,
      sub: 'anteriores',
      dot: <span className={`${DOT} border-2 border-dashed border-ink-3 bg-surface text-xs font-semibold text-ink-2`}>…</span>,
      tip: <>Ver os {hidden} registros mais antigos em Detalhes</>,
      aria: `Mais ${hidden} registros anteriores. Abrir em Detalhes`,
      href: moreHref,
    });
  }

  for (const e of shown) {
    const style = kindStyle[e.kind];
    const open = e.source === 'impedimento' && e.resolvedAt === null;
    const what =
      e.source === 'impedimento'
        ? `${open ? 'Aguardando' : 'Esperou'} ${e.owner}${e.text ? `: ${e.text}` : ''}`
        : e.text;
    nodes.push({
      key: e.key,
      caption: formatDayMonth(e.date),
      sub: DEMAND_EVENT_LABEL[e.kind],
      dot: (
        <span className="relative mx-auto block size-8">
          <span
            className={`${DOT} border-2 ${style.badge} ${e.flagged ? 'ring-2 ring-critical ring-offset-2 ring-offset-surface' : ''}`}
            style={{ borderColor: e.flagged ? 'var(--critical)' : style.dot }}
          >
            {style.icon(14)}
          </span>
          {e.flagged && (
            <span className="absolute -top-1.5 -right-2 grid size-4 place-items-center rounded-full bg-surface text-critical-text">
              <FlagIcon size={11} filled />
            </span>
          )}
        </span>
      ),
      tip: (
        <>
          <span className="block font-medium text-ink">
            {dayLabel(e.date)} · {DEMAND_EVENT_LABEL[e.kind]}
            {e.flagged && ' · marcado'}
          </span>
          <span className="mt-1 block">{what || '—'}</span>
          {e.source === 'impedimento' && (
            <span className="tabular mt-1 block text-ink-3">
              {e.resolvedAt ? `Resolvido em ${dayLabel(e.resolvedAt)} · ` : ''}
              {e.waitingWorkdays === 1 ? '1 dia útil' : `${e.waitingWorkdays} dias úteis`} de espera
            </span>
          )}
        </>
      ),
      aria: `${dayLabel(e.date)}, ${DEMAND_EVENT_LABEL[e.kind]}${e.flagged ? ', marcado' : ''}: ${what}`,
    });
  }

  if (demand.dueDate) {
    nodes.push({
      key: 'prazo',
      caption: formatDayMonth(demand.dueDate),
      sub: 'Prazo',
      dot: (
        <span className={`${DOT} border-2 border-dashed border-ink-3 bg-surface text-ink-2`}>
          <TargetIcon size={14} />
        </span>
      ),
      tip: <>Prazo em {dayLabel(demand.dueDate)}</>,
      aria: `Prazo em ${dayLabel(demand.dueDate)}`,
    });
  }

  return nodes;
}

/** Largura do elemento, acompanhando o redimensionamento (0 até a primeira medida). */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/**
 * Mapa da linha do tempo de um ciclo: o início, os registros (ação, decisão, impedimento…) e o
 * prazo, numa linha que vai da esquerda para a direita e, no limite, desce e volta da direita
 * para a esquerda. O DOM fica em ordem cronológica (é a ordem de leitura); só a posição visual zigue-zagueia.
 */
export function TimelineMap({ demand, label, entries }: { demand: CycleDemand; label: string; entries: TimelineEntry[] }) {
  const [ref, width] = useWidth();
  const columns = snakeColumns(width, NODE_WIDTH);
  const nodes = nodesOf(demand, entries, `/detalhes?aba=ciclos&ciclo=${demand.id}`);
  const cells = snakeLayout(nodes.length, columns);

  return (
    <div ref={ref} className="w-full">
      <ol
        aria-label={`Linha do tempo de ${label}`}
        className="grid"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gridAutoRows: ROW }}
      >
        {nodes.map((node, i) => (
          <MapCell key={node.key} node={node} cell={cells[i]} columns={columns} />
        ))}
      </ol>
    </div>
  );
}

function MapCell({ node, cell, columns }: { node: MapNode; cell: SnakeCell; columns: number }) {
  const tipId = useId();
  const rtl = cell.direction === 'rtl';
  // A dica abre para o lado onde há espaço: nas colunas das pontas, para dentro.
  const tipSide = cell.col === 0 ? 'left-0' : cell.col === columns - 1 ? 'right-0' : 'left-1/2 -translate-x-1/2';

  const body = (
    <>
      <span className="mt-1 block">{node.dot}</span>
      <span className="tabular mt-1 block text-xs font-medium text-ink">{node.caption}</span>
      <span className="block max-w-full truncate text-2xs text-ink-3">{node.sub}</span>
    </>
  );
  const focusRing = 'rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent';

  return (
    <li
      className="group relative flex justify-center"
      style={{ gridRow: cell.row + 1, gridColumn: cell.col + 1 }}
    >
      {/* Linhas de ligação: ficam atrás do nó e saem do centro dele. */}
      {cell.hasIncoming && (
        <span aria-hidden className={`absolute top-[19px] h-0.5 w-1/2 ${LINE} ${rtl ? 'right-0' : 'left-0'}`} />
      )}
      {cell.hasOutgoing && (
        <span aria-hidden className={`absolute top-[19px] h-0.5 w-1/2 ${LINE} ${rtl ? 'left-0' : 'right-0'}`} />
      )}
      {cell.turn && (
        <span
          aria-hidden
          className={`absolute top-[19px] w-1/2 border-y-2 ${BORDER} ${
            cell.turn === 'right' ? 'right-0 rounded-r-xl border-r-2' : 'left-0 rounded-l-xl border-l-2'
          }`}
          style={{ height: `calc(${ROW} + 2px)` }}
        />
      )}

      {node.href ? (
        <Link to={node.href} aria-label={node.aria} aria-describedby={tipId} className={`relative z-10 w-full max-w-28 text-center ${focusRing}`}>
          {body}
        </Link>
      ) : (
        <span
          tabIndex={0}
          role="img"
          aria-label={node.aria}
          aria-describedby={tipId}
          className={`relative z-10 block w-full max-w-28 text-center ${focusRing}`}
        >
          {body}
        </span>
      )}

      <span
        id={tipId}
        role="tooltip"
        className={`tip-surface hint-in pointer-events-none absolute top-[3.25rem] z-30 hidden w-56 max-w-[calc(100vw-3rem)] p-3 text-left text-xs text-ink-2 group-focus-within:block group-hover:block ${tipSide}`}
      >
        {node.tip}
      </span>
    </li>
  );
}
