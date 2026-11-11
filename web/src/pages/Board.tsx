import { useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router';
import {
  BOARD_COLUMN_LABEL,
  BOARD_COLUMNS,
  BOARD_DONE_DAYS,
  boardColumnOf,
  buildBoard,
  DEMAND_CATEGORY_LABEL,
  DEMAND_CATEGORY_PLURAL,
  placeInOrder,
  statusForColumn,
  statusLabel,
  todayISO,
  type BoardColumn,
  type DemandCategory,
} from '@acomp/shared';
import { useDemands, useMoveCard } from '../api/client';
import { DemandForm } from '../components/DemandForms';
import { FilterSelect } from '../components/FilterSelect';
import { CheckIcon, ClockIcon, DashIcon, HourglassIcon, PlusIcon } from '../components/icons';
import { PageHeader } from '../components/PageHeader';
import { Segmented } from '../components/Segmented';
import { SlideOver } from '../components/SlideOver';
import { ErrorState, Skeleton } from '../components/States';
import { useToast } from '../components/Toast';
import { BoardCard, CardFace, type BoardDemand } from './board/BoardCard';
import { useCardDrag, type DropTarget } from './board/useCardDrag';
import { useFlip } from './board/useFlip';

/** As categorias com status, na ordem do filtro e do formulário. */
const BOARD_CATEGORIES = ['chamado', 'ciclo', 'treinamento', 'atividade'] as const;
type BoardCategory = (typeof BOARD_CATEGORIES)[number];
type Filter = BoardCategory | 'todos';
type Panel = { mode: 'new'; category: BoardCategory } | { mode: 'edit'; id: number };

const isBoardCategory = (v: string | null): v is BoardCategory => BOARD_CATEGORIES.includes(v as BoardCategory);

const COLUMN_ICON: Record<BoardColumn, (s: number) => ReactNode> = {
  a_fazer: (s) => <DashIcon size={s} />,
  em_andamento: (s) => <ClockIcon size={s} />,
  aguardando: (s) => <HourglassIcon size={s} />,
  concluido: (s) => <CheckIcon size={s} />,
};

const PAGE_HINT = (
  <>
    <span className="block">
      Suas demandas por andamento. <strong className="font-semibold text-ink">A ordem dentro da coluna é a sua prioridade:</strong>{' '}
      o que importa mais fica em cima.
    </span>
    <span className="mt-1.5 block">
      Arraste um cartão para outra coluna para trocar o status, ou para cima e para baixo para priorizar. Sem arrastar: o
      seletor do cartão troca o status e as setas mudam a posição.
    </span>
    <span className="mt-1.5 block">
      <strong className="font-semibold text-ink">Aguardando</strong> reúne chamados em espera e ciclos aguardando terceiro ou em
      homologação. <strong className="font-semibold text-ink">Concluído</strong> mostra os últimos {BOARD_DONE_DAYS} dias.
      Reuniões (sem status) e ciclos cancelados não aparecem aqui.
    </span>
  </>
);

const sameOrder = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((id, i) => id === b[i]);

export function Board() {
  const demands = useDemands();
  const move = useMoveCard();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const tipo = params.get('tipo');
  const filter: Filter = isBoardCategory(tipo) ? tipo : 'todos';

  /** No celular aparece uma coluna por vez. */
  const [mobileColumn, setMobileColumn] = useState<BoardColumn>('em_andamento');
  const [panel, setPanel] = useState<Panel | null>(null);
  const [dirty, setDirty] = useState(false);
  // Os cartões deslizam até o lugar novo ao reordenar ou trocar de coluna.
  const boardRef = useRef<HTMLDivElement>(null);
  const flipFrom = useFlip(boardRef);

  // O quadro inteiro (a ordem gravada é sempre a da coluna completa) e o que o filtro deixa ver.
  const board = useMemo(() => buildBoard(demands.data ?? [], todayISO()), [demands.data]);
  const visible = (column: BoardColumn) =>
    (filter === 'todos' ? board[column] : board[column].filter((d) => d.category === filter)) as BoardDemand[];
  const find = (id: number) => BOARD_COLUMNS.flatMap((c) => board[c]).find((d) => d.id === id) as BoardDemand | undefined;

  const send = (demand: BoardDemand, status: string | undefined, order: number[] | undefined) =>
    move.mutate(
      { demandId: demand.id, status, order },
      {
        onSuccess: () => {
          if (status === undefined) return;
          toast(boardColumnOf(status) ? `${demand.label}: ${statusLabel(status)}.` : `${demand.label} saiu do quadro (${statusLabel(status)}).`);
        },
        onError: (err) => toast(err.message, 'error'),
      },
    );

  /** Coloca o cartão na coluna, na posição `index` entre os cartões visíveis dela (sem contar ele mesmo). */
  const place = (demand: BoardDemand, column: BoardColumn, index: number) => {
    const from = boardColumnOf(demand.status);
    const status = column === from ? undefined : statusForColumn(demand.category, column);
    if (status === null) return;
    // "Concluído" não tem ordem manual: vale a data da conclusão.
    if (column === 'concluido') return status === undefined ? undefined : send(demand, status, undefined);

    const neighbours = visible(column).filter((d) => d.id !== demand.id);
    const current = board[column].map((d) => d.id);
    const order = placeInOrder(current, demand.id, {
      beforeId: neighbours[index]?.id ?? null,
      afterId: neighbours[index - 1]?.id ?? null,
    });
    if (status === undefined && sameOrder(order, current)) return;
    send(demand, status, order);
  };

  /** Status escolhido no seletor do cartão: mudando de coluna, o cartão entra no fim dela. */
  const setStatus = (demand: BoardDemand, status: string) => {
    if (status === demand.status) return;
    const to = boardColumnOf(status);
    const changesColumn = to !== null && to !== boardColumnOf(demand.status) && to !== 'concluido';
    send(demand, status, changesColumn ? placeInOrder(board[to].map((d) => d.id), demand.id) : undefined);
  };

  const { drag, ghostRef, onPointerDown } = useCardDrag({
    canDrop: (id, column) => {
      const demand = find(id);
      return demand !== undefined && (boardColumnOf(demand.status) === column || statusForColumn(demand.category, column) !== null);
    },
    onDrop: (id, target: DropTarget, from) => {
      const demand = find(id);
      if (!demand) return;
      if (from) flipFrom(id, from);
      place(demand, target.column, target.index);
    },
  });
  const dragged = drag ? find(drag.id) : undefined;

  const all = demands.data ?? [];
  const editing = panel?.mode === 'edit' ? all.find((d) => d.id === panel.id) : undefined;
  const panelCategory: DemandCategory | undefined = panel?.mode === 'new' ? panel.category : editing?.category;
  const openPanel = (next: Panel) => {
    setDirty(false);
    setPanel(next);
  };
  const closePanel = () => setPanel(null);

  const total = BOARD_COLUMNS.reduce((sum, c) => sum + visible(c).length, 0);
  const countOf = (category: BoardCategory) => BOARD_COLUMNS.reduce((sum, c) => sum + board[c].filter((d) => d.category === category).length, 0);

  return (
    <div className="space-y-section">
      <PageHeader
        title="Kanban"
        hint={PAGE_HINT}
        action={
          <button
            type="button"
            onClick={() => openPanel({ mode: 'new', category: filter === 'todos' ? 'chamado' : filter })}
            className="btn-primary"
          >
            <PlusIcon size={18} /> Declarar demanda
          </button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <FilterSelect
          label="Tipo de demanda"
          value={filter}
          onChange={(next) =>
            setParams(
              (p) => {
                if (next === 'todos') p.delete('tipo');
                else p.set('tipo', next);
                return p;
              },
              { replace: true },
            )
          }
          options={[
            { value: 'todos' as Filter, label: 'Todos os tipos' },
            ...BOARD_CATEGORIES.map((c) => ({
              value: c as Filter,
              label: `${DEMAND_CATEGORY_PLURAL[c]}${demands.data ? ` (${countOf(c)})` : ''}`,
            })),
          ]}
        />
        {/* Celular: uma coluna por vez. */}
        <div className="w-full lg:hidden">
          <Segmented
            label="Coluna"
            value={mobileColumn}
            onChange={setMobileColumn}
            stretch
            dense
            options={BOARD_COLUMNS.map((c) => ({
              value: c,
              label: BOARD_COLUMN_LABEL[c],
              count: demands.data ? visible(c).length : undefined,
            }))}
          />
        </div>
      </div>

      {demands.isPending ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
          {BOARD_COLUMNS.map((c) => (
            <Skeleton key={c} className={`h-48 ${c === mobileColumn ? '' : 'hidden lg:block'}`} />
          ))}
        </div>
      ) : demands.isError ? (
        <ErrorState message={demands.error.message} onRetry={() => demands.refetch()} />
      ) : (
        <div ref={boardRef} className="grid grid-cols-1 items-start gap-3 lg:grid-cols-4">
          {BOARD_COLUMNS.map((column) => {
            const cards = visible(column);
            const over = drag?.over?.column === column ? drag.over : null;
            // Só marca o ponto de soltura se o cartão for mesmo mudar de lugar.
            const origin = cards.findIndex((d) => d.id === drag?.id);
            const showLine = over?.allowed && column !== 'concluido' && over.index !== origin;
            const blocked = drag !== null && over !== null && !over.allowed;
            const sortable = column !== 'concluido';
            const rest = cards.filter((d) => d.id !== drag?.id);
            const line = (
              <li key="drop-line" aria-hidden="true" className="h-1 rounded-full bg-accent" />
            );
            const items: ReactNode[] = [];
            cards.forEach((d, i) => {
              if (showLine && rest[over.index]?.id === d.id) items.push(line);
              items.push(
                <BoardCard
                  key={d.id}
                  demand={d}
                  rank={sortable ? i + 1 : undefined}
                  dragging={drag?.id === d.id}
                  onPointerDown={onPointerDown(d.id)}
                  onStatus={(status) => setStatus(d, status)}
                  onUp={sortable && i > 0 ? () => place(d, column, i - 1) : undefined}
                  onDown={sortable && i < cards.length - 1 ? () => place(d, column, i + 1) : undefined}
                  onEdit={() => openPanel({ mode: 'edit', id: d.id })}
                />,
              );
            });
            if (showLine && over.index >= rest.length) items.push(line);

            return (
              <section
                key={column}
                data-board-column={column}
                aria-label={BOARD_COLUMN_LABEL[column]}
                className={`min-w-0 flex-col rounded-card bg-surface-2/60 p-2 transition ${column === mobileColumn ? 'flex' : 'hidden lg:flex'} ${
                  over?.allowed ? 'ring-2 ring-accent' : ''
                } ${blocked ? 'opacity-50' : ''}`}
              >
                <h2 className="flex items-center gap-2 px-2 py-1.5 text-sm font-semibold text-ink">
                  <span className="text-ink-3">{COLUMN_ICON[column](15)}</span>
                  {BOARD_COLUMN_LABEL[column]}
                  <span className="tabular text-xs font-medium text-ink-3">{cards.length}</span>
                  {column === 'concluido' && <span className="ml-auto text-2xs font-medium text-ink-3">últimos {BOARD_DONE_DAYS} dias</span>}
                </h2>
                {blocked && dragged && (
                  <p className="px-2 pb-1 text-xs text-ink-2">
                    {DEMAND_CATEGORY_LABEL[dragged.category]} não tem o status “{BOARD_COLUMN_LABEL[column]}”.
                  </p>
                )}
                {cards.length === 0 ? (
                  <p
                    className={`m-1 rounded-control border border-dashed px-3 py-6 text-center text-xs ${
                      over?.allowed ? 'border-accent text-accent' : 'border-line-strong/40 text-ink-3'
                    }`}
                  >
                    {over?.allowed ? 'Solte aqui' : total === 0 && column === 'a_fazer' ? 'Nenhuma demanda por aqui. Declare a primeira.' : 'Nada aqui'}
                  </p>
                ) : (
                  <ol className="flex min-h-12 flex-col gap-2 p-1">{items}</ol>
                )}
              </section>
            );
          })}
        </div>
      )}

      {/* O cartão que segue o ponteiro durante o arrasto. */}
      {drag &&
        dragged &&
        createPortal(
          <div ref={ghostRef} aria-hidden="true" className="pointer-events-none fixed top-0 left-0 z-50" style={{ width: drag.width }}>
            <div className="card rotate-2 p-3 shadow-[var(--shadow-pop)]">
              <CardFace demand={dragged} link={false} />
            </div>
          </div>,
          document.body,
        )}

      <SlideOver
        open={panel !== null && panelCategory !== undefined}
        onClose={closePanel}
        dirty={dirty}
        title={panel?.mode === 'edit' && panelCategory ? `Editar ${DEMAND_CATEGORY_LABEL[panelCategory].toLowerCase()}` : 'Declarar demanda'}
      >
        {panel?.mode === 'new' && (
          <div className="mb-5">
            <Segmented
              label="Tipo de demanda"
              value={panel.category}
              onChange={(category) => openPanel({ mode: 'new', category })}
              stretch
              dense
              options={BOARD_CATEGORIES.map((c) => ({ value: c, label: DEMAND_CATEGORY_LABEL[c] }))}
            />
          </div>
        )}
        {panelCategory && (
          <DemandForm key={panelCategory} category={panelCategory} editing={editing} onDone={closePanel} onDirtyChange={setDirty} />
        )}
      </SlideOver>
    </div>
  );
}
