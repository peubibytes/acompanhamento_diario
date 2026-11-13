// Kanban (v0.16, docs/decisions/0017): as demandas com status, em quatro colunas. A coluna vem do
// status; a ordem dentro dela é a prioridade que o colaborador deu (gravada em `boardRank`).
// Reuniões não têm status e ficam de fora; ciclos cancelados também.

import { addDays, type ISODate } from './cycle.ts';
import type { DeadlineStatus, DemandCategory, DemandPriority, DemandSummary } from './demands.ts';

export const BOARD_COLUMNS = ['a_fazer', 'em_andamento', 'aguardando', 'concluido'] as const;
export type BoardColumn = (typeof BOARD_COLUMNS)[number];

export const BOARD_COLUMN_LABEL: Record<BoardColumn, string> = {
  a_fazer: 'A fazer',
  em_andamento: 'Em andamento',
  aguardando: 'Aguardando',
  concluido: 'Concluído',
};

/** A coluna "Concluído" mostra só o que foi concluído nos últimos N dias (contando hoje). */
export const BOARD_DONE_DAYS = 7;

const COLUMN_OF_STATUS: Record<string, BoardColumn> = {
  novo: 'a_fazer',
  nao_iniciado: 'a_fazer',
  em_andamento: 'em_andamento',
  aguardando_terceiro: 'aguardando',
  em_homologacao: 'aguardando',
  em_espera: 'aguardando',
  concluido: 'concluido',
};

/** Coluna de um status (de qualquer categoria); nula para "cancelado", que não entra no quadro. */
export const boardColumnOf = (status: string): BoardColumn | null => COLUMN_OF_STATUS[status] ?? null;

/**
 * O status que a demanda recebe ao ser solta numa coluna. Nulo quando a categoria não tem um status para ela (só a
 * reunião; desde a v0.19, treinamento e atividade vão para "Aguardando" como "Em espera", decisão 0022).
 */
export function statusForColumn(category: DemandCategory, column: BoardColumn): string | null {
  if (category === 'reuniao') return null;
  switch (column) {
    case 'a_fazer':
      return category === 'ciclo' ? 'novo' : 'nao_iniciado';
    case 'em_andamento':
      return 'em_andamento';
    case 'aguardando':
      return category === 'ciclo' ? 'aguardando_terceiro' : 'em_espera';
    case 'concluido':
      return 'concluido';
  }
}

export type Board = Record<BoardColumn, DemandSummary[]>;

const URGENCY: Record<DeadlineStatus, number> = {
  atrasada: 0,
  vence_hoje: 1,
  proxima: 2,
  no_prazo: 3,
  sem_prazo: 3,
  concluida: 4,
  cancelada: 4,
};
const PRIORITY: Record<DemandPriority, number> = { urgente: 0, alta: 1, media: 2, baixa: 3 };
/** Só os ciclos têm prioridade declarada; as tarefas contam como "média". */
const priorityOf = (d: DemandSummary) => PRIORITY[d.category === 'ciclo' ? d.priority : 'media'];

/**
 * Ordem dentro de uma coluna: primeiro o que o colaborador já ordenou (`boardRank`), na ordem dele;
 * depois o que ainda não foi ordenado, pelo prazo (vencido, hoje, próximo), pela prioridade do ciclo
 * e, por fim, da declaração mais antiga para a mais nova (o que chega entra no fim da fila).
 */
export function compareBoard(a: DemandSummary, b: DemandSummary): number {
  if (a.boardRank !== null && b.boardRank !== null) return a.boardRank - b.boardRank || a.id - b.id;
  if (a.boardRank !== null) return -1;
  if (b.boardRank !== null) return 1;
  return URGENCY[a.metrics.deadline] - URGENCY[b.metrics.deadline] || priorityOf(a) - priorityOf(b) || a.id - b.id;
}

/** "Concluído": o mais recente primeiro (a ordem manual não vale aqui). */
const compareDone = (a: DemandSummary, b: DemandSummary) =>
  (b.completedAt ?? '').localeCompare(a.completedAt ?? '') || b.id - a.id;

/** Distribui as demandas pelas colunas, já na ordem de exibição. */
export function buildBoard(demands: DemandSummary[], today: ISODate): Board {
  const board: Board = { a_fazer: [], em_andamento: [], aguardando: [], concluido: [] };
  const doneSince = addDays(today, -(BOARD_DONE_DAYS - 1));
  for (const d of demands) {
    if (d.category === 'reuniao') continue;
    const column = boardColumnOf(d.status);
    if (!column) continue;
    if (column === 'concluido' && (d.completedAt === null || d.completedAt < doneSince)) continue;
    board[column].push(d);
  }
  for (const column of BOARD_COLUMNS) board[column].sort(column === 'concluido' ? compareDone : compareBoard);
  return board;
}

/**
 * Nova ordem de uma coluna com `id` colocado antes de `beforeId`; sem `beforeId`, depois de
 * `afterId`; sem nenhum dos dois (ou se a referência não está na coluna), no fim.
 * `order` é a coluna inteira (inclusive o que um filtro esconde), para a ordem gravada ser completa.
 */
export function placeInOrder(
  order: readonly number[],
  id: number,
  { beforeId = null, afterId = null }: { beforeId?: number | null; afterId?: number | null } = {},
): number[] {
  const rest = order.filter((x) => x !== id);
  const before = beforeId === null ? -1 : rest.indexOf(beforeId);
  const after = afterId === null ? -1 : rest.indexOf(afterId);
  const at = before >= 0 ? before : after >= 0 ? after + 1 : rest.length;
  return [...rest.slice(0, at), id, ...rest.slice(at)];
}

/** Movimento de um cartão: novo status (se mudou de coluna) e a nova ordem da coluna de destino. */
export interface BoardMove {
  demandId: number;
  status?: string;
  order?: number[];
}

/**
 * O movimento aplicado a uma lista de demandas, sem ir ao servidor: a tela usa para mostrar o
 * cartão no lugar novo na hora (a resposta do servidor confirma depois). Uma demanda que passa a
 * Concluído ganha a data de hoje; a que sai de Concluído a perde.
 */
export function applyBoardMove(demands: DemandSummary[], move: BoardMove, today: ISODate): DemandSummary[] {
  const rankOf = new Map((move.order ?? []).map((id, index) => [id, index + 1]));
  return demands.map((d) => {
    let next = d;
    if (d.id === move.demandId && move.status !== undefined && d.category !== 'reuniao' && d.status !== move.status) {
      next = { ...d, status: move.status, completedAt: move.status === 'concluido' ? today : null } as DemandSummary;
    }
    const rank = rankOf.get(d.id);
    return rank === undefined ? next : { ...next, boardRank: rank };
  });
}
