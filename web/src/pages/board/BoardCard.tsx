import type { PointerEvent, ReactNode } from 'react';
import { Link } from 'react-router';
import {
  DEMAND_CATEGORY_LABEL,
  DEMAND_PRIORITY_LABEL,
  formatDayMonth,
  formatDuration,
  isOpenDemand,
  statusesOf,
  statusLabel,
  type CycleStatus,
  type DemandSummary,
  type TaskStatus,
  type TicketStatus,
} from '@acomp/shared';
import { categoryIcon, cycleStatusStyle, deadlineStyle, taskStatusStyle } from '../../components/DemandVisuals';
import { AlertIcon, ArrowDown, ArrowUp, ChevronDown, ClockIcon, GripIcon, HourglassIcon, PencilIcon } from '../../components/icons';

/** Uma demanda com status: a reunião não entra no quadro. */
export type BoardDemand = Exclude<DemandSummary, { category: 'reuniao' }>;

const statusStyle = (d: BoardDemand) =>
  d.category === 'ciclo' ? cycleStatusStyle[d.status as CycleStatus] : taskStatusStyle[d.status as TaskStatus | TicketStatus];

function CardButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="grid size-8 place-items-center rounded-full text-ink-3 outline-none transition hover:bg-surface-2 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-30"
    >
      {children}
    </button>
  );
}

/** O conteúdo do cartão, sem os controles: também é o "fantasma" que segue o ponteiro ao arrastar. */
export function CardFace({ demand: d, rank, link = true }: { demand: BoardDemand; rank?: number; link?: boolean }) {
  const open = isOpenDemand(d);
  const title = (
    <span
      className={`min-w-0 text-sm font-semibold break-words text-ink ${d.category === 'chamado' ? 'tabular tracking-wide' : ''} ${
        open ? '' : 'line-through decoration-ink-3'
      }`}
    >
      {d.label}
    </span>
  );
  const blockers = d.tracking.openBlockers;
  const blockersText = blockers === 1 ? '1 impedimento aberto' : `${blockers} impedimentos abertos`;
  const urgent = d.category === 'ciclo' && open && (d.priority === 'alta' || d.priority === 'urgente');
  const deadline = d.category === 'ciclo' && open && d.dueDate ? deadlineStyle[d.metrics.deadline] : null;
  const hasMeta = urgent || deadline !== null || blockers > 0 || d.metrics.logged > 0;

  return (
    <>
      <div className="flex items-start gap-2">
        {rank !== undefined && (
          <span className="tabular mt-0.5 w-4 shrink-0 text-right text-xs font-semibold text-ink-3" title={`Prioridade ${rank} na coluna`}>
            {rank}
            <span className="sr-only">º na coluna: </span>
          </span>
        )}
        <span className="mt-0.5 shrink-0 text-ink-3" title={DEMAND_CATEGORY_LABEL[d.category]}>
          {categoryIcon[d.category](15)}
          <span className="sr-only">{DEMAND_CATEGORY_LABEL[d.category]}: </span>
        </span>
        {link ? (
          <Link
            to={`/demandas?tipo=${d.category}#demanda-${d.id}`}
            draggable={false}
            className="min-w-0 rounded outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent"
          >
            {title}
          </Link>
        ) : (
          title
        )}
      </div>

      {d.subtitle && <p className="mt-1 line-clamp-2 text-xs break-words text-ink-2">{d.subtitle}</p>}

      {hasMeta && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-2">
          {urgent && d.category === 'ciclo' && (
            <span className={`inline-flex items-center gap-1 font-medium ${d.priority === 'urgente' ? 'text-critical-text' : 'text-warning-text'}`}>
              <AlertIcon size={13} />
              {DEMAND_PRIORITY_LABEL[d.priority]}
            </span>
          )}
          {deadline && d.category === 'ciclo' && d.dueDate && (
            <span className={`tabular inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${deadline.badge}`}>
              {deadline.icon(12)}
              {d.metrics.deadline === 'atrasada' ? 'Venceu' : d.metrics.deadline === 'vence_hoje' ? 'Hoje' : 'Prazo'}
              {d.metrics.deadline !== 'vence_hoje' && ` ${formatDayMonth(d.dueDate)}`}
            </span>
          )}
          {blockers > 0 && (
            <span className="inline-flex items-center gap-1 font-medium text-warning-text" title={blockersText}>
              <HourglassIcon size={13} />
              {blockers}
              <span className="sr-only"> {blockers === 1 ? 'impedimento aberto' : 'impedimentos abertos'}</span>
            </span>
          )}
          {d.metrics.logged > 0 && (
            <span className="tabular inline-flex items-center gap-1" title="Horas apontadas">
              <ClockIcon size={12} />
              {formatDuration(d.metrics.logged)}
              <span className="sr-only"> apontadas</span>
            </span>
          )}
        </div>
      )}
    </>
  );
}

/**
 * Cartão do Kanban. Arrasta-se pelo cartão (mouse) ou pela pega (toque); sem arrastar, o seletor troca
 * o status e as setas mudam a prioridade dentro da coluna — o mesmo resultado, pelo teclado.
 */
export function BoardCard({
  demand: d,
  rank,
  dragging,
  onPointerDown,
  onStatus,
  onUp,
  onDown,
  onEdit,
}: {
  demand: BoardDemand;
  /** Posição na coluna (1 = topo); ausente em "Concluído", que não tem ordem manual. */
  rank?: number;
  /** Este é o cartão sendo arrastado: fica apagado no lugar de origem. */
  dragging: boolean;
  onPointerDown: (e: PointerEvent<HTMLElement>) => void;
  onStatus: (status: string) => void;
  /** Sobe ou desce uma posição; ausente quando o cartão já está na ponta (ou a coluna não tem ordem). */
  onUp?: () => void;
  onDown?: () => void;
  onEdit: () => void;
}) {
  const style = statusStyle(d);
  return (
    <li
      data-card-id={d.id}
      onPointerDown={onPointerDown}
      className={`group card relative cursor-grab p-3 select-none ${dragging ? 'opacity-40' : 'hover:shadow-[var(--shadow-pop)]'}`}
    >
      <CardFace demand={d} rank={rank} />

      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-1">
        <label
          className={`relative inline-flex max-w-full items-center gap-1.5 rounded-full py-1 pr-1 pl-2.5 text-xs font-medium has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent ${style.badge}`}
        >
          <span className="shrink-0">{style.icon(13)}</span>
          <span className="sr-only">Status de {d.label}</span>
          <select
            value={d.status}
            onChange={(e) => onStatus(e.target.value)}
            title={statusLabel(d.status)}
            className="min-w-0 cursor-pointer appearance-none truncate bg-transparent pr-5 font-medium outline-none [&>option]:bg-surface [&>option]:text-ink"
          >
            {statusesOf(d.category).map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </select>
          <ChevronDown size={12} className="pointer-events-none absolute right-2" />
        </label>

        {/* Com mouse, os controles flutuam no canto do cartão ao passar por ele ou focar; no toque, ficam sempre à mão, ao lado do status. */}
        <div className="ml-auto flex shrink-0 items-center can-hover:absolute can-hover:top-1.5 can-hover:right-1.5 can-hover:rounded-full can-hover:bg-surface can-hover:opacity-0 can-hover:shadow-[var(--shadow-pop)] can-hover:transition can-hover:group-focus-within:opacity-100 can-hover:group-hover:opacity-100">
          {rank !== undefined && (
            <>
              <CardButton label={`Subir ${d.label}`} onClick={() => onUp?.()} disabled={!onUp}>
                <ArrowUp size={15} />
              </CardButton>
              <CardButton label={`Descer ${d.label}`} onClick={() => onDown?.()} disabled={!onDown}>
                <ArrowDown size={15} />
              </CardButton>
            </>
          )}
          <CardButton label={`Editar ${d.label}`} onClick={onEdit}>
            <PencilIcon size={15} />
          </CardButton>
          <span
            data-drag-handle
            aria-hidden="true"
            title="Arrastar"
            className="grid size-8 touch-none place-items-center rounded-full text-ink-3 can-hover:hidden"
          >
            <GripIcon size={16} />
          </span>
        </div>
      </div>
    </li>
  );
}
