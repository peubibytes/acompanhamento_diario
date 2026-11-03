import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildPeriodSummary,
  buildTimeline,
  categorySplit,
  cycleYield,
  familyOf,
  getPeriod,
  previousPeriod,
  unplannedTime,
  type Activity,
  type DemandBlocker,
  type DemandCategory,
  type DemandEvent,
  type YieldCycle,
} from '../src/index.ts';

const log = (demandId: number | null, date: string, startMinute: number, endMinute: number): Activity => ({
  id: 0,
  date,
  startMinute,
  endMinute,
  project: 'Projeto fictício',
  description: '',
  notes: '',
  demandId,
});

const demands: { id: number; category: DemandCategory }[] = [
  { id: 1, category: 'chamado' },
  { id: 2, category: 'ciclo' },
  { id: 3, category: 'reuniao' },
  { id: 4, category: 'treinamento' },
];

const WEEK = getPeriod('2026-10-23', 'week'); // Sex 23/10 → Qui 29/10
const DAY = '2026-10-26';

describe('família da demanda', () => {
  it('chamado, reunião e treinamento são Tarefas; ciclo é Ciclos', () => {
    assert.equal(familyOf('chamado'), 'tarefas');
    assert.equal(familyOf('reuniao'), 'tarefas');
    assert.equal(familyOf('treinamento'), 'tarefas');
    assert.equal(familyOf('ciclo'), 'ciclos');
  });
});

describe('tempo por categoria', () => {
  it('sem sobreposição: cada categoria fica com o seu tempo, e as famílias somam as suas', () => {
    const acts = [log(1, DAY, 480, 540), log(3, DAY, 540, 570), log(4, DAY, 570, 590), log(2, DAY, 600, 720)];
    const s = categorySplit(acts, demands, WEEK);
    const day = s.days.find((d) => d.date === DAY)!;
    assert.deepEqual([day.chamado, day.reuniao, day.treinamento, day.ciclo, day.semDemanda], [60, 30, 20, 120, 0]);
    assert.deepEqual([day.tarefas, day.ciclos, day.total], [110, 120, 230]);
    assert.equal(s.total.total, 230);
    assert.deepEqual(s.predominant, { family: 'ciclos', percent: 52 });
  });

  it('sobreposição entre categorias é dividida igualmente e a soma bate com o dia', () => {
    const acts = [log(1, DAY, 480, 600), log(2, DAY, 540, 660)];
    const day = categorySplit(acts, demands, WEEK).days.find((d) => d.date === DAY)!;
    assert.deepEqual([day.chamado, day.ciclo, day.total], [90, 90, 180]);
  });

  it('sobreposição entre duas categorias de Tarefas também é dividida (a família soma as duas)', () => {
    // Reunião 480–600 e chamado 540–660: 540–600 vale metade para cada um.
    const day = categorySplit([log(3, DAY, 480, 600), log(1, DAY, 540, 660)], demands, WEEK).days.find((d) => d.date === DAY)!;
    assert.deepEqual([day.reuniao, day.chamado, day.tarefas, day.total], [90, 90, 180, 180]);
  });

  it('três categorias ao mesmo tempo: um terço para cada', () => {
    const acts = [log(1, DAY, 480, 540), log(3, DAY, 480, 540), log(2, DAY, 480, 540)];
    const day = categorySplit(acts, demands, WEEK).days.find((d) => d.date === DAY)!;
    assert.deepEqual([day.chamado, day.reuniao, day.ciclo, day.total], [20, 20, 20, 60]);
  });

  it('sobreposição dentro da mesma categoria conta uma vez (união)', () => {
    const more = [...demands, { id: 5, category: 'chamado' as const }];
    const acts = [log(1, DAY, 480, 600), log(5, DAY, 540, 660), log(2, DAY, 600, 720)];
    const s = categorySplit(acts, more, WEEK);
    const day = s.days.find((d) => d.date === DAY)!;
    // 480–600 só chamados; 600–660 chamado e ciclo (30 cada); 660–720 só ciclo.
    assert.deepEqual([day.chamado, day.ciclo, day.total], [150, 90, 240]);
    assert.deepEqual(s.predominant, { family: 'tarefas', percent: 63 });
  });

  it('a soma dos grupos é sempre o total do dia nas métricas, em minutos inteiros', () => {
    const acts = [
      log(1, DAY, 480, 481),
      log(2, DAY, 480, 481),
      log(3, DAY, 480, 482),
      log(4, DAY, 481, 484),
      log(2, DAY, 482, 487),
      log(null, DAY, 483, 490),
    ];
    const split = categorySplit(acts, demands, WEEK);
    const metrics = buildPeriodSummary(WEEK, acts, () => 330);
    for (const day of split.days) {
      const parts = [day.chamado, day.reuniao, day.treinamento, day.ciclo, day.semDemanda];
      assert.ok(parts.every(Number.isInteger));
      assert.equal(parts.reduce((a, b) => a + b, 0), day.total);
      assert.equal(day.tarefas, day.chamado + day.reuniao + day.treinamento);
      assert.equal(day.total, metrics.days.find((m) => m.date === day.date)!.minutes);
    }
  });

  it('apontamento sem demanda (legado) aparece à parte', () => {
    const day = categorySplit([log(null, DAY, 480, 540), log(1, DAY, 600, 660)], demands, WEEK).days.find((d) => d.date === DAY)!;
    assert.deepEqual([day.chamado, day.ciclo, day.semDemanda], [60, 0, 60]);
  });

  it('empate entre Tarefas e Ciclos ou período vazio não têm família predominante', () => {
    assert.equal(categorySplit([], demands, WEEK).predominant, null);
    assert.equal(categorySplit([log(1, DAY, 480, 510), log(4, DAY, 510, 540), log(2, DAY, 600, 660)], demands, WEEK).predominant, null);
  });

  it('no mês: um dia por dia útil; sábado e fora do mês não entram', () => {
    const nov = getPeriod('2026-11-10', 'month');
    const acts = [log(1, '2026-11-02', 480, 540), log(2, '2026-11-07', 480, 540), log(2, '2026-12-01', 480, 540), log(2, '2026-10-30', 480, 540)];
    const s = categorySplit(acts, demands, nov);
    assert.equal(s.days.length, 21);
    assert.equal(s.total.total, 60);
    assert.deepEqual([s.total.chamado, s.total.ciclo], [60, 0]);
  });
});

describe('rendimento por ciclo', () => {
  const NOV = getPeriod('2026-11-10', 'month');
  const OCT = previousPeriod(NOV);
  const cycle = (id: number, status: YieldCycle['status'] = 'em_andamento', startDate = '2026-09-01'): YieldCycle => ({
    id,
    label: `Projeto ${id}`,
    status,
    startDate,
  });
  const run = (cycles: YieldCycle[], acts: Activity[], events: DemandEvent[] = [], blockers: DemandBlocker[] = []) =>
    cycleYield(cycles, acts, buildTimeline(events, blockers, '2026-11-30', (id) => `Projeto ${id}`), NOV, OCT);

  it('horas por dia útil, total, anterior, variação e média dos dias anteriores', () => {
    const acts = [
      log(10, '2026-10-05', 480, 600), // outubro: 120 min
      log(10, '2026-11-02', 480, 540), // 60
      log(10, '2026-11-03', 480, 600), // 120
      log(10, '2026-11-04', 480, 570), // 90
    ];
    const [y] = run([cycle(10)], acts);
    assert.equal(y.total, 270);
    assert.equal(y.previousTotal, 120);
    assert.deepEqual(y.change, { minutes: 150, percent: 125 });
    assert.equal(y.days.length, 21);
    assert.deepEqual(y.days.slice(0, 5).map((d) => d.minutes), [60, 120, 90, 0, 0]);
    // Média dos dias anteriores do período que tiveram apontamento no ciclo.
    assert.deepEqual(y.days.slice(0, 5).map((d) => d.priorAverage), [null, 60, 90, 90, 90]);
  });

  it('sobreposição dentro do mesmo ciclo no mesmo dia conta uma vez', () => {
    const [y] = run([cycle(10)], [log(10, '2026-11-02', 480, 600), log(10, '2026-11-02', 540, 660)]);
    assert.equal(y.total, 180);
  });

  it('ciclo sem apontamento no período anterior: variação em minutos, sem %', () => {
    const [y] = run([cycle(10)], [log(10, '2026-11-02', 480, 540)]);
    assert.equal(y.previousTotal, 0);
    assert.deepEqual(y.change, { minutes: 60, percent: null });
  });

  it('queda sobre o período anterior', () => {
    const [y] = run([cycle(10)], [log(10, '2026-10-05', 480, 720), log(10, '2026-11-02', 480, 600)]);
    assert.deepEqual(y.change, { minutes: -120, percent: -50 });
  });

  it('ciclo encerrado no meio do período entra com o que apontou; encerrado antes e sem nada, não', () => {
    const closedMid = cycle(10, 'concluido');
    const closedBefore = cycle(11, 'concluido');
    const result = run([closedMid, closedBefore], [log(10, '2026-11-02', 480, 540), log(10, '2026-11-03', 480, 540), log(11, '2026-10-06', 480, 540)]);
    assert.deepEqual(result.map((r) => r.id), [10]);
    assert.equal(result[0].open, false);
    assert.equal(result[0].total, 120);
  });

  it('ciclo aberto sem apontamento aparece zerado; o que só começa depois do período, não', () => {
    const result = run([cycle(10), cycle(11, 'novo', '2026-12-01')], []);
    assert.deepEqual(result.map((r) => [r.id, r.total, r.open]), [[10, 0, true]]);
  });

  it('só registro na linha do tempo, sem horas, mantém o ciclo encerrado na lista', () => {
    const events: DemandEvent[] = [{ id: 1, demandId: 10, date: '2026-11-05', kind: 'validacao', text: 'Validado', flagged: false }];
    const result = run([cycle(10, 'concluido')], [], events);
    assert.deepEqual(result.map((r) => [r.id, r.total, r.timelineCount]), [[10, 0, 1]]);
  });

  it('conta eventos, e início e resolução de impedimentos, só dentro do período', () => {
    const events: DemandEvent[] = [
      { id: 1, demandId: 10, date: '2026-11-03', kind: 'acao', text: 'a', flagged: false },
      { id: 2, demandId: 10, date: '2026-10-30', kind: 'acao', text: 'fora', flagged: false },
      { id: 3, demandId: 11, date: '2026-11-03', kind: 'acao', text: 'outro ciclo', flagged: false },
    ];
    const blockers: DemandBlocker[] = [
      { id: 1, demandId: 10, owner: 'Equipe', description: '', since: '2026-10-28', resolvedAt: '2026-11-04', flagged: false }, // só a resolução
      { id: 2, demandId: 10, owner: 'Equipe', description: '', since: '2026-11-09', resolvedAt: '2026-11-10', flagged: false }, // início e resolução
      { id: 3, demandId: 10, owner: 'Equipe', description: '', since: '2026-11-12', resolvedAt: null, flagged: false }, // só o início
    ];
    const [y] = run([cycle(10), cycle(11)], [], events, blockers).filter((r) => r.id === 10);
    assert.equal(y.timelineCount, 1 + 1 + 2 + 1);
  });

  it('do maior total para o menor; empate pelo nome', () => {
    const acts = [log(10, '2026-11-02', 480, 540), log(11, '2026-11-02', 600, 720), log(12, '2026-11-02', 780, 840)];
    assert.deepEqual(run([cycle(10), cycle(11), cycle(12)], acts).map((r) => r.id), [11, 10, 12]);
  });

  it('na semana, o anterior é a semana anterior', () => {
    const week = getPeriod('2026-10-30', 'week'); // Sex 30/10 → Qui 05/11
    const [y] = cycleYield(
      [cycle(10)],
      [log(10, '2026-10-23', 480, 540), log(10, '2026-10-30', 480, 600), log(10, '2026-11-02', 480, 540)],
      [],
      week,
      previousPeriod(week),
    );
    assert.equal(y.total, 180);
    assert.equal(y.previousTotal, 60);
    assert.equal(y.change.percent, 200);
    assert.equal(y.days.length, 5);
  });
});

describe('trabalho não planejado (intempestivas)', () => {
  // 5: ciclo intempestivo; 2: ciclo planejado (sem kind = não intempestivo); 1: chamado.
  const withKinds = [...demands, { id: 5, category: 'ciclo' as const, kind: 'intempestiva' as const }];

  it('é a fatia do tempo em ciclos intempestivos, arredondada', () => {
    const result = unplannedTime([log(5, DAY, 540, 600), log(2, DAY, 600, 780), log(1, '2026-10-27', 540, 600)], withKinds, WEEK);
    assert.deepEqual(result, { minutes: 60, total: 300, percent: 20 });
  });

  it('sobreposição com outra demanda é dividida, e o total conta o trecho uma vez', () => {
    // 9h–10h só intempestiva; 10h–11h junto com o chamado (30 min para cada).
    const result = unplannedTime([log(5, DAY, 540, 660), log(1, DAY, 600, 660)], withKinds, WEEK);
    assert.deepEqual(result, { minutes: 90, total: 120, percent: 75 });
  });

  it('dois intempestivos sobrepostos contam uma vez', () => {
    const both = [...withKinds, { id: 6, category: 'ciclo' as const, kind: 'intempestiva' as const }];
    assert.deepEqual(unplannedTime([log(5, DAY, 540, 600), log(6, DAY, 540, 600)], both, WEEK), { minutes: 60, total: 60, percent: 100 });
  });

  it('sem apontamento no período, a fatia é nula; fora do período não conta', () => {
    assert.deepEqual(unplannedTime([log(5, '2026-10-30', 540, 600)], withKinds, WEEK), { minutes: 0, total: 0, percent: null });
  });

  it('sem nenhum intempestivo, 0%', () => {
    assert.deepEqual(unplannedTime([log(2, DAY, 540, 600), log(null, DAY, 600, 630)], withKinds, WEEK), { minutes: 0, total: 90, percent: 0 });
  });
});
