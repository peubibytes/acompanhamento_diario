import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildDemandSummary,
  buildOverview,
  completedAtOf,
  cycleProgress,
  lastUpdateOf,
  parseHM,
  STALLED_WORKDAYS,
  statusChangeText,
  taskOverview,
  type CycleDemand,
  type Demand,
  type DemandStatusChange,
} from '../src/index.ts';

const TODAY = '2026-10-29'; // quinta
const PERIOD = { start: '2026-10-23', end: '2026-10-29' };

const ticket = (id: number, status: 'nao_iniciado' | 'iniciado' | 'em_andamento' | 'concluido'): Demand => ({
  id,
  category: 'chamado',
  ticketNumber: `TESTE${id}`,
  description: 'Descrição fictícia',
  status,
});

const cycleDemand = (id: number, overrides: Partial<CycleDemand> = {}): CycleDemand => ({
  id,
  category: 'ciclo',
  title: `Projeto ${id}`,
  description: '',
  kind: 'planejada',
  status: 'em_andamento',
  priority: 'media',
  startDate: '2026-10-01',
  dueDate: null,
  branch: '',
  prUrl: '',
  environment: null,
  ...overrides,
});

const change = (demandId: number, from: string | null, to: string, date: string): DemandStatusChange => ({
  demandId,
  from,
  to,
  date,
});

const log = (demandId: number, date: string, start: string, end: string, description = '') => ({
  demandId,
  date,
  startMinute: parseHM(start)!,
  endMinute: parseHM(end)!,
  description,
});

describe('histórico de status', () => {
  it('data de conclusão: a última vez que passou a Concluído, só se hoje está concluída', () => {
    const done = ticket(1, 'concluido');
    const changes = [
      change(1, null, 'nao_iniciado', '2026-10-20'),
      change(1, 'nao_iniciado', 'concluido', '2026-10-21'),
      change(1, 'concluido', 'em_andamento', '2026-10-22'),
      change(1, 'em_andamento', 'concluido', '2026-10-26'),
    ];
    assert.equal(completedAtOf(done, changes), '2026-10-26');
    assert.equal(completedAtOf(ticket(1, 'em_andamento'), changes), null);
    const meeting: Demand = { id: 9, category: 'reuniao', meetingType: 'Daily', participants: 'Equipe', subject: 'Dia' };
    assert.equal(completedAtOf(meeting, []), null);
  });

  it('texto da troca, com os rótulos de ciclo e de tarefa', () => {
    assert.equal(statusChangeText({ from: 'em_andamento', to: 'concluido' }), 'Em andamento → Concluído');
    assert.equal(statusChangeText({ from: null, to: 'novo' }), 'Declarada como Novo');
  });
});

describe('última atualização', () => {
  it('é o mais recente entre evento, troca de status e apontamento', () => {
    const events = [{ demandId: 1, date: '2026-10-26', kind: 'deploy' as const, text: 'Publicado em staging' }];
    const changes = [change(1, null, 'novo', '2026-10-20')];
    const acts = [log(1, '2026-10-27', '09:00', '10:00', 'Ajustes finais')];
    assert.deepEqual(lastUpdateOf(1, events, changes, acts), {
      date: '2026-10-27',
      kind: 'apontamento',
      text: 'Ajustes finais',
    });
    assert.equal(lastUpdateOf(1, events, changes, [])?.text, 'Publicado em staging');
    assert.equal(lastUpdateOf(1, [], [], []), null);
  });

  it('no mesmo dia, evento vence troca de status, que vence apontamento', () => {
    const events = [{ demandId: 1, date: '2026-10-27', kind: 'acao' as const, text: 'Contato feito' }];
    const changes = [change(1, 'novo', 'em_andamento', '2026-10-27')];
    const acts = [log(1, '2026-10-27', '09:00', '10:00', 'x')];
    assert.equal(lastUpdateOf(1, events, changes, acts)?.kind, 'evento');
    assert.equal(lastUpdateOf(1, [], changes, acts)?.kind, 'status');
  });

  it('ignora os dados de outras demandas e apontamentos sem duração', () => {
    const acts = [log(2, '2026-10-28', '09:00', '10:00'), log(1, '2026-10-28', '09:00', '09:00')];
    assert.equal(lastUpdateOf(1, [], [], acts), null);
  });

  it('o resumo da demanda traz a data de conclusão e a última atualização', () => {
    const s = buildDemandSummary(ticket(1, 'concluido'), [], TODAY, {
      statusChanges: [change(1, 'em_andamento', 'concluido', '2026-10-28')],
    });
    assert.equal(s.completedAt, '2026-10-28');
    assert.deepEqual(s.tracking.lastUpdate, { date: '2026-10-28', kind: 'status', text: 'Em andamento → Concluído' });
  });
});

describe('tarefas: concluídas, fila e em andamento', () => {
  const demands: Demand[] = [
    ticket(1, 'nao_iniciado'),
    ticket(2, 'nao_iniciado'),
    ticket(3, 'iniciado'),
    ticket(4, 'em_andamento'),
    ticket(5, 'concluido'), // no período
    ticket(6, 'concluido'), // antes do período
    { id: 7, category: 'treinamento', title: 'Curso fictício', description: '', status: 'concluido' },
    { id: 8, category: 'reuniao', meetingType: 'Daily', participants: 'Equipe', subject: 'Dia' },
    cycleDemand(9, { status: 'concluido' }),
  ];
  const changes = [
    change(5, 'em_andamento', 'concluido', '2026-10-27'),
    change(6, 'em_andamento', 'concluido', '2026-10-20'),
    change(7, 'iniciado', 'concluido', '2026-10-23'),
    change(9, 'em_andamento', 'concluido', '2026-10-27'),
  ];
  const summaries = demands.map((d) => buildDemandSummary(d, [], TODAY, { statusChanges: changes }));

  it('conta só chamados e treinamentos; reuniões e ciclos ficam de fora', () => {
    const o = taskOverview(summaries, PERIOD);
    assert.equal(o.queued, 2);
    assert.equal(o.inProgress, 2);
    assert.equal(o.completed, 2); // 5 e 7; a 6 foi concluída antes do período
    assert.deepEqual(o.byCategory.chamado, { completed: 1, queued: 2, inProgress: 2 });
    assert.deepEqual(o.byCategory.treinamento, { completed: 1, queued: 0, inProgress: 0 });
  });

  it('os limites do período entram (sexta e quinta)', () => {
    const dates = ['2026-10-22', '2026-10-23', '2026-10-29'];
    const edge = dates.map((date, i) =>
      buildDemandSummary(ticket(i + 1, 'concluido'), [], TODAY, {
        statusChanges: [change(i + 1, 'iniciado', 'concluido', date)],
      }),
    );
    assert.equal(taskOverview(edge, PERIOD).completed, 2);
  });
});

describe('ciclos: última atualização e horas', () => {
  const acts = [
    log(1, '2026-10-20', '09:00', '11:00'), // antes do período
    log(1, '2026-10-27', '09:00', '10:30', 'Ajuste das consultas'),
    log(1, '2026-10-27', '10:00', '11:00'), // sobreposto: a união conta uma vez
    log(2, '2026-10-21', '09:00', '10:00'),
  ];
  const demands = [cycleDemand(1), cycleDemand(2), cycleDemand(3, { status: 'concluido' })];
  const summaries = demands.map((d) =>
    buildDemandSummary(d, acts, TODAY, { statusChanges: [change(d.id, null, d.status, '2026-10-01')] }),
  );

  it('só ciclos abertos, com horas totais e no período (sobreposição conta uma vez)', () => {
    const progress = cycleProgress(summaries, acts, PERIOD, TODAY);
    assert.deepEqual(
      progress.map((p) => [p.id, p.logged, p.loggedInPeriod]),
      [
        [1, 240, 120], // 2h em 20/10 + 2h (09:00–11:00 pela união) em 27/10
        [2, 60, 0],
      ],
    );
  });

  it('marca como parado depois de STALLED_WORKDAYS dias úteis sem atualização', () => {
    const [recent, old] = cycleProgress(summaries, acts, PERIOD, TODAY);
    assert.equal(recent.lastUpdate?.date, '2026-10-27');
    assert.equal(recent.idleWorkdays, 2); // qua 28 e qui 29
    assert.equal(recent.stalled, false);
    assert.equal(old.lastUpdate?.date, '2026-10-21');
    assert.equal(old.idleWorkdays, 6); // qui 22, sex 23, seg 26, ter 27, qua 28, qui 29
    assert.ok(old.idleWorkdays! >= STALLED_WORKDAYS);
    assert.equal(old.stalled, true);
  });

  it('o resumo junta tarefas e ciclos', () => {
    const o = buildOverview(summaries, acts, PERIOD, TODAY);
    assert.deepEqual(o.period, PERIOD);
    assert.equal(o.tasks.completed, 0);
    assert.equal(o.cycles.length, 2);
  });
});
