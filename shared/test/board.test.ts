import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyBoardMove,
  BOARD_COLUMNS,
  boardColumnOf,
  buildBoard,
  buildDemandSummary,
  CYCLE_STATUSES,
  placeInOrder,
  statusForColumn,
  TASK_STATUSES,
  TICKET_STATUSES,
  type Demand,
  type DemandStatusChange,
  type DemandSummary,
} from '../src/index.ts';

const TODAY = '2026-10-27'; // terça

const cycle = (id: number, over: Partial<Extract<Demand, { category: 'ciclo' }>> = {}): Demand => ({
  id,
  category: 'ciclo',
  title: `Ciclo ${id}`,
  description: '',
  kind: 'planejada',
  status: 'em_andamento',
  priority: 'media',
  startDate: '2026-10-01',
  dueDate: null,
  branch: '',
  prUrl: '',
  environment: null,
  ...over,
});
const ticket = (id: number, status: Extract<Demand, { category: 'chamado' }>['status'] = 'nao_iniciado'): Demand => ({
  id,
  category: 'chamado',
  ticketNumber: `SCTASK000000${id}`,
  description: 'Exemplo',
  status,
});
const training = (id: number, status: Extract<Demand, { category: 'treinamento' }>['status']): Demand => ({
  id,
  category: 'treinamento',
  title: `Treinamento ${id}`,
  description: '',
  status,
});
const meeting: Demand = { id: 90, category: 'reuniao', meetingType: 'Daily', participants: '', subject: '' };

function summaries(demands: Demand[], ranks: Record<number, number> = {}, changes: DemandStatusChange[] = []): DemandSummary[] {
  const boardRanks = new Map(Object.entries(ranks).map(([id, rank]) => [Number(id), rank]));
  return demands.map((d) => buildDemandSummary(d, [], TODAY, { statusChanges: changes, boardRanks }));
}
const ids = (list: DemandSummary[]) => list.map((d) => d.id);

describe('Kanban: colunas', () => {
  it('todo status de ciclo, chamado e tarefa tem coluna, menos "cancelado"', () => {
    for (const s of [...CYCLE_STATUSES, ...TICKET_STATUSES, ...TASK_STATUSES]) {
      if (s === 'cancelado') assert.equal(boardColumnOf(s), null);
      else assert.ok(BOARD_COLUMNS.includes(boardColumnOf(s)!), s);
    }
    assert.equal(boardColumnOf('em_homologacao'), 'aguardando');
    assert.equal(boardColumnOf('iniciado'), 'em_andamento');
  });

  it('o status de destino é um status válido da categoria e cai na própria coluna', () => {
    for (const column of BOARD_COLUMNS) {
      for (const [category, statuses] of [
        ['ciclo', CYCLE_STATUSES],
        ['chamado', TICKET_STATUSES],
        ['treinamento', TASK_STATUSES],
        ['atividade', TASK_STATUSES],
      ] as const) {
        const status = statusForColumn(category, column);
        if (status === null) continue;
        assert.ok((statuses as readonly string[]).includes(status), `${category}/${column}`);
        assert.equal(boardColumnOf(status), column);
      }
    }
  });

  it('treinamento e atividade não têm "Aguardando"; reunião não tem coluna alguma', () => {
    assert.equal(statusForColumn('treinamento', 'aguardando'), null);
    assert.equal(statusForColumn('atividade', 'aguardando'), null);
    assert.equal(statusForColumn('chamado', 'aguardando'), 'em_espera');
    assert.equal(statusForColumn('ciclo', 'aguardando'), 'aguardando_terceiro');
    for (const column of BOARD_COLUMNS) assert.equal(statusForColumn('reuniao', column), null);
  });
});

describe('Kanban: quadro', () => {
  it('distribui por status e deixa de fora reuniões e ciclos cancelados', () => {
    const board = buildBoard(
      summaries([
        cycle(1, { status: 'novo' }),
        cycle(2, { status: 'em_homologacao' }),
        cycle(3, { status: 'cancelado' }),
        ticket(4, 'em_espera'),
        training(5, 'iniciado'),
        meeting,
      ]),
      TODAY,
    );
    assert.deepEqual(ids(board.a_fazer), [1]);
    assert.deepEqual(ids(board.em_andamento), [5]);
    assert.deepEqual(ids(board.aguardando), [2, 4]);
    assert.deepEqual(ids(board.concluido), []);
  });

  it('a ordem manual vem primeiro; o resto segue prazo, prioridade e ordem de declaração', () => {
    const board = buildBoard(
      summaries(
        [
          ticket(1),
          cycle(2, { status: 'novo', priority: 'urgente' }),
          cycle(3, { status: 'novo', dueDate: '2026-10-20' }), // atrasado
          ticket(4),
          ticket(5),
        ],
        { 5: 1, 4: 2 },
      ),
      TODAY,
    );
    assert.deepEqual(ids(board.a_fazer), [5, 4, 3, 2, 1]);
  });

  it('"Concluído" traz só os últimos 7 dias, do mais recente ao mais antigo, sem a ordem manual', () => {
    const done = (id: number, date: string): DemandStatusChange => ({ demandId: id, from: 'em_andamento', to: 'concluido', date });
    const board = buildBoard(
      summaries(
        [ticket(1, 'concluido'), ticket(2, 'concluido'), ticket(3, 'concluido'), ticket(4, 'concluido')],
        { 1: 1, 2: 2 },
        [done(1, '2026-10-21'), done(2, '2026-10-27'), done(3, '2026-10-20'), done(4, '2026-10-24')],
      ),
      TODAY,
    );
    // 21/10 é o sétimo dia contando hoje (27/10); 20/10 já saiu.
    assert.deepEqual(ids(board.concluido), [2, 4, 1]);
  });
});

describe('Kanban: nova ordem da coluna', () => {
  it('coloca antes de um cartão, depois de outro ou no fim', () => {
    assert.deepEqual(placeInOrder([1, 2, 3], 3, { beforeId: 1 }), [3, 1, 2]);
    assert.deepEqual(placeInOrder([1, 2, 3], 1, { afterId: 2 }), [2, 1, 3]);
    assert.deepEqual(placeInOrder([1, 2, 3], 1), [2, 3, 1]);
    assert.deepEqual(placeInOrder([1, 2, 3], 9, { beforeId: 2 }), [1, 9, 2, 3]);
    assert.deepEqual(placeInOrder([], 9), [9]);
  });

  it('referência fora da coluna: vai para o fim; a própria posição não conta', () => {
    assert.deepEqual(placeInOrder([1, 2], 9, { beforeId: 77 }), [1, 2, 9]);
    assert.deepEqual(placeInOrder([1, 2, 3], 2, { beforeId: 3 }), [1, 2, 3]);
  });
});

describe('Kanban: movimento aplicado na tela', () => {
  it('troca o status, marca a conclusão de hoje e regrava a ordem da coluna', () => {
    const before = summaries([ticket(1, 'em_andamento'), ticket(2, 'em_andamento'), ticket(3)]);
    const reordered = applyBoardMove(before, { demandId: 2, order: [2, 1] }, TODAY);
    assert.deepEqual(ids(buildBoard(reordered, TODAY).em_andamento), [2, 1]);
    assert.equal(reordered[2].boardRank, null);

    const done = applyBoardMove(reordered, { demandId: 1, status: 'concluido' }, TODAY);
    const board = buildBoard(done, TODAY);
    assert.deepEqual(ids(board.concluido), [1]);
    assert.equal(done[0].completedAt, TODAY);

    const reopened = applyBoardMove(done, { demandId: 1, status: 'nao_iniciado', order: [1, 3] }, TODAY);
    assert.equal(reopened[0].completedAt, null);
    assert.deepEqual(ids(buildBoard(reopened, TODAY).a_fazer), [1, 3]);
    // A lista original não muda.
    assert.equal(before[0].boardRank, null);
  });
});
