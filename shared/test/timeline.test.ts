import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildTimeline,
  filterTimeline,
  lastUpdateOf,
  timelineMetrics,
  type DemandBlocker,
  type DemandEvent,
} from '../src/index.ts';

const TODAY = '2026-10-29'; // quinta

const events: DemandEvent[] = [
  { id: 1, demandId: 1, date: '2026-10-23', kind: 'decisao', text: 'Escopo definido', flagged: false },
  { id: 2, demandId: 1, date: '2026-10-27', kind: 'acao', text: 'Contato com a equipe', flagged: true },
  { id: 3, demandId: 2, date: '2026-10-27', kind: 'deploy', text: 'Publicado em staging', flagged: false },
  { id: 4, demandId: 1, date: '2026-10-26', kind: 'impedimento', text: 'Texto livre antigo', flagged: false },
  { id: 5, demandId: 9, date: '2026-10-26', kind: 'acao', text: 'Ciclo que não existe mais', flagged: false },
];
const blockers: DemandBlocker[] = [
  { id: 1, demandId: 1, owner: 'Equipe B', description: 'Liberar acesso', since: '2026-10-27', resolvedAt: null, flagged: true },
  { id: 2, demandId: 2, owner: 'Equipe C', description: '', since: '2026-10-20', resolvedAt: '2026-10-22', flagged: false },
];
const labels = new Map([
  [1, 'Projeto Alfa'],
  [2, 'Projeto Beta'],
]);
const timeline = buildTimeline(events, blockers, TODAY, (id) => labels.get(id));

describe('linha do tempo unificada', () => {
  it('junta eventos e impedimentos, do mais recente ao mais antigo', () => {
    assert.deepEqual(
      timeline.map((e) => e.key),
      [
        'impedimento:1', // 27/10: impedimentos antes dos eventos da mesma data
        'evento:3', // 27/10, cadastro mais novo primeiro
        'evento:2',
        'evento:4', // 26/10
        'evento:1', // 23/10
        'impedimento:2', // 20/10
      ],
    );
  });

  it('descarta o que é de um ciclo desconhecido e traz o nome do ciclo', () => {
    assert.equal(timeline.some((e) => e.demandId === 9), false);
    assert.equal(timeline[0].demandLabel, 'Projeto Alfa');
  });

  it('o impedimento vira uma entrada do tipo impedimento, com responsável e espera', () => {
    const [open] = timeline;
    assert.deepEqual(
      [open.source, open.kind, open.owner, open.text, open.resolvedAt, open.waitingWorkdays, open.flagged],
      ['impedimento', 'impedimento', 'Equipe B', 'Liberar acesso', null, 3, true], // ter 27, qua 28, qui 29
    );
    const resolved = timeline.at(-1)!;
    assert.deepEqual([resolved.resolvedAt, resolved.waitingWorkdays], ['2026-10-22', 3]); // 20, 21, 22
  });
});

describe('filtro', () => {
  it('por ciclo, por tipo e só marcados, combinados', () => {
    const keys = (f: Parameters<typeof filterTimeline>[1]) => filterTimeline(timeline, f).map((e) => e.key);
    assert.equal(keys({}).length, 6);
    assert.deepEqual(keys({ demandIds: new Set([2]) }), ['evento:3', 'impedimento:2']);
    assert.deepEqual(keys({ kinds: new Set(['impedimento'] as const) }), ['impedimento:1', 'evento:4', 'impedimento:2']);
    assert.deepEqual(keys({ flaggedOnly: true }), ['impedimento:1', 'evento:2']);
    assert.deepEqual(keys({ demandIds: new Set([1]), kinds: new Set(['acao', 'decisao'] as const), flaggedOnly: true }), ['evento:2']);
    assert.equal(keys({ demandIds: new Set(), kinds: new Set() }).length, 6); // vazio = todos
  });
});

describe('métricas', () => {
  it('quantidade de cada tipo, marcados, impedimentos abertos e espera', () => {
    const m = timelineMetrics(timeline, TODAY);
    assert.equal(m.total, 6);
    assert.deepEqual(m.byKind, { acao: 1, decisao: 1, impedimento: 3, validacao: 0, deploy: 1 });
    assert.equal(m.flagged, 2);
    assert.equal(m.openBlockers, 1);
    assert.equal(m.longestWait, 3);
    assert.equal(m.lastDate, '2026-10-27');
    assert.equal(m.idleWorkdays, 2); // qua 28 e qui 29
  });

  it('a resolução conta como registro; lista vazia não tem data', () => {
    const resolvedLate: DemandBlocker[] = [{ ...blockers[1], resolvedAt: '2026-10-28' }];
    const m = timelineMetrics(buildTimeline([], resolvedLate, TODAY, () => 'Projeto'), TODAY);
    assert.equal(m.lastDate, '2026-10-28');
    assert.equal(m.openBlockers, 0);

    const empty = timelineMetrics([], TODAY);
    assert.deepEqual([empty.total, empty.lastDate, empty.idleWorkdays, empty.longestWait], [0, null, null, 0]);
  });
});

describe('última atualização com impedimentos', () => {
  it('o início e a resolução de um impedimento são atualizações', () => {
    const open = lastUpdateOf(1, [], [], [], [{ demandId: 1, since: '2026-10-27', resolvedAt: null, owner: 'Equipe B' }]);
    assert.deepEqual(open, { date: '2026-10-27', kind: 'evento', text: 'Impedimento: Equipe B' });

    const closed = lastUpdateOf(1, [], [], [], [{ demandId: 1, since: '2026-10-20', resolvedAt: '2026-10-28', owner: 'Equipe B' }]);
    assert.deepEqual(closed, { date: '2026-10-28', kind: 'evento', text: 'Impedimento resolvido: Equipe B' });
  });
});
