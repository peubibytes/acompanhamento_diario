import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  blockersSummary,
  buildDailyReport,
  buildDemandSummary,
  dailyReportMarkdown,
  doneSummary,
  nextWorkday,
  parseHM,
  previousWorkday,
  type Activity,
  type CycleDemand,
  type Demand,
  type DemandBlocker,
  type DemandEvent,
  type DemandStatusChange,
} from '../src/index.ts';

const DATE = '2026-10-28'; // quarta
const TODAY = '2026-10-29'; // quinta

const alpha: CycleDemand = {
  id: 1,
  category: 'ciclo',
  title: 'Projeto Alfa',
  description: '',
  kind: 'planejada',
  status: 'em_andamento',
  priority: 'alta',
  startDate: '2026-10-01',
  dueDate: '2026-11-02',
  branch: '',
  prUrl: '',
  environment: null,
};
const beta: CycleDemand = { ...alpha, id: 7, title: 'Projeto Beta', priority: 'media', dueDate: null };
const done: Demand = { id: 2, category: 'chamado', ticketNumber: 'TESTE-1', description: 'Erro no relatório fictício', status: 'concluido' };
const working: Demand = { id: 3, category: 'chamado', ticketNumber: 'TESTE-2', description: 'Lentidão fictícia', status: 'em_andamento' };
const queued1: Demand = { id: 4, category: 'chamado', ticketNumber: 'TESTE-3', description: 'Fictício', status: 'nao_iniciado' };
const queued2: Demand = { id: 5, category: 'treinamento', title: 'Curso fictício', description: '', status: 'nao_iniciado' };
const daily: Demand = { id: 6, category: 'reuniao', meetingType: 'Daily', participants: 'Equipe Exemplo', subject: 'Status do dia' };
const planning: Demand = { id: 8, category: 'reuniao', meetingType: 'Planejamento', participants: 'Equipe Exemplo', subject: 'Sprint' };

let nextId = 1;
const act = (demandId: number | null, start: string, end: string, description = '', notes = ''): Activity => ({
  id: nextId++,
  date: DATE,
  startMinute: parseHM(start)!,
  endMinute: parseHM(end)!,
  project: demandId === null ? 'Projeto antigo' : '',
  description,
  notes,
  demandId,
});

const statusChanges: DemandStatusChange[] = [
  { demandId: 1, from: null, to: 'novo', date: '2026-10-01' },
  { demandId: 2, from: 'em_andamento', to: 'concluido', date: DATE },
  { demandId: 4, from: null, to: 'nao_iniciado', date: DATE }, // declarada no dia: não é "feito"
];
const events: DemandEvent[] = [{ id: 1, demandId: 1, date: DATE, kind: 'deploy', text: 'Publicado em staging', flagged: false }];
const blockers: DemandBlocker[] = [
  { id: 1, demandId: 1, owner: 'Equipe B', description: 'Libera o acesso', since: '2026-10-26', resolvedAt: null, flagged: false },
  { id: 2, demandId: 1, owner: 'Equipe C', description: '', since: '2026-10-20', resolvedAt: '2026-10-27', flagged: false }, // antes do dia
  { id: 3, demandId: 1, owner: 'Equipe D', description: '', since: '2026-10-27', resolvedAt: DATE, flagged: false },
];

const activities = [
  act(6, '08:45', '09:00'), // Daily
  act(1, '09:00', '11:00', 'Ajuste das consultas'),
  act(1, '11:00', '11:30', 'Ajuste das consultas'), // mesma descrição: aparece uma vez
  act(1, '14:00', '15:00', 'Testes', 'PR aberto'),
  act(2, '13:00', '14:00', 'Correção aplicada'),
  act(3, '15:00', '16:00', 'Análise do log'),
  act(8, '16:00', '17:00'), // Planejamento
  act(6, '17:00', '17:15'), // a mesma Daily de novo: conta uma reunião
  act(null, '17:15', '17:30', 'Item antigo'), // sem demanda: fica de fora
];

const allDemands = [alpha, beta, done, working, queued1, queued2, daily, planning];

function report(overrides: { demands?: Demand[]; acts?: Activity[]; blockers?: DemandBlocker[]; changes?: DemandStatusChange[] } = {}) {
  const demands = overrides.demands ?? allDemands;
  const acts = overrides.acts ?? activities;
  const changes = overrides.changes ?? statusChanges;
  const theBlockers = overrides.blockers ?? blockers;
  const history = { events, blockers: theBlockers, statusChanges: changes };
  return buildDailyReport({
    date: DATE,
    activities: acts,
    demands: demands.map((d) => buildDemandSummary(d, acts, TODAY, history)),
    events,
    blockers: theBlockers,
    statusChanges: changes,
  });
}

describe('dias úteis vizinhos', () => {
  it('pula o fim de semana', () => {
    assert.equal(previousWorkday('2026-10-26'), '2026-10-23'); // segunda → sexta
    assert.equal(previousWorkday('2026-10-27'), '2026-10-26');
    assert.equal(nextWorkday('2026-10-23'), '2026-10-26'); // sexta → segunda
    assert.equal(nextWorkday('2026-10-28'), '2026-10-29');
  });
});

describe('relatório diário: o que foi feito', () => {
  const r = report();

  it('resume em ciclos, tarefas e reuniões, sem horários nem horas', () => {
    assert.equal(doneSummary(r.done), '1 ciclo · 2 tarefas (1 concluída) · 2 reuniões');
    assert.equal(JSON.stringify(r.done).match(/minute|minutes|goal|conformity/i), null);
  });

  it('ciclos: o que andou, sem repetir, com os eventos do dia', () => {
    assert.deepEqual(r.done.cycles, [
      {
        demandId: 1,
        label: 'Projeto Alfa',
        category: 'ciclo',
        subtitle: '',
        status: 'Em andamento',
        changed: false,
        progress: ['Ajuste das consultas', 'Testes (PR aberto)', 'Deploy: Publicado em staging'],
      },
    ]);
  });

  it('tarefas: a concluída no dia primeiro, com a troca de status e o complemento', () => {
    assert.deepEqual(
      r.done.tasks.map((t) => [t.label, t.subtitle, t.status, t.changed, t.progress]),
      [
        ['TESTE-1', 'Erro no relatório fictício', 'Em andamento → Concluído', true, ['Correção aplicada']],
        ['TESTE-2', 'Lentidão fictícia', 'Em andamento', false, ['Análise do log']],
      ],
    );
    assert.equal(r.done.completedTasks, 1);
  });

  it('reuniões: cada uma uma vez, na ordem em que aconteceram', () => {
    assert.deepEqual(
      r.done.meetings.map((m) => m.label),
      ['Daily · Status do dia', 'Planejamento · Sprint'],
    );
  });

  it('a declaração do dia e o ciclo não tocado não entram', () => {
    assert.equal(r.done.tasks.some((t) => t.label === 'TESTE-3'), false);
    assert.equal(r.done.cycles.some((c) => c.label === 'Projeto Beta'), false);
  });

  it('ida e volta de status no mesmo dia não é mudança', () => {
    const roundTrip = report({
      changes: [
        { demandId: 3, from: 'em_andamento', to: 'concluido', date: DATE },
        { demandId: 3, from: 'concluido', to: 'em_andamento', date: DATE },
      ],
    });
    const t = roundTrip.done.tasks.find((x) => x.label === 'TESTE-2')!;
    assert.deepEqual([t.status, t.changed], ['Em andamento', false]);
  });

  it('dia sem nada', () => {
    const empty = report({ acts: [], changes: [], demands: [beta, daily] });
    assert.equal(doneSummary(empty.done), '');
  });
});

describe('relatório diário: impedimentos', () => {
  it('abertos no dia e os resolvidos nele; o resolvido antes não entra', () => {
    const b = report().blockers;
    assert.equal(blockersSummary(b), '1 aberto · 1 resolvido no dia');
    assert.deepEqual(
      b.items.map((i) => [i.owner, i.resolvedAt, i.waitingWorkdays]),
      [
        ['Equipe B', null, 3], // seg 26, ter 27, qua 28
        ['Equipe D', DATE, 2],
      ],
    );
  });

  it('um impedimento resolvido depois do dia ainda estava aberto nele', () => {
    const later: DemandBlocker = { id: 9, demandId: 1, owner: 'Equipe E', description: '', since: '2026-10-27', resolvedAt: '2026-10-30', flagged: false };
    const b = report({ blockers: [later] }).blockers;
    assert.deepEqual([b.open, b.items[0].resolvedAt], [1, null]);
  });
});

describe('relatório diário: o que será feito', () => {
  it('ciclos abertos, tarefas em andamento e a fila; reuniões e concluídas ficam de fora', () => {
    const next = report().next!;
    assert.equal(next.date, '2026-10-29');
    assert.deepEqual(
      next.cycles.map((i) => [i.label, i.detail]),
      [
        ['Projeto Alfa', 'Em andamento · prazo 02/11 (prazo próximo) · impedimento aberto'],
        ['Projeto Beta', 'Em andamento'],
      ],
    );
    assert.deepEqual(
      next.tasks.map((i) => [i.label, i.detail]),
      [['TESTE-2', 'Lentidão fictícia']],
    );
    assert.equal(next.queued, 2);
  });

  it('some quando só há demandas encerradas e reuniões', () => {
    assert.equal(report({ demands: [done, daily] }).next, null);
  });
});

describe('relatório diário: Markdown', () => {
  it('fala de ciclos, tarefas e reuniões, não de apontamentos', () => {
    const md = dailyReportMarkdown(report(), { today: TODAY });
    assert.equal(
      md,
      [
        '# Daily — Qua 28/10',
        '',
        '## O que foi feito',
        '1 ciclo · 2 tarefas (1 concluída) · 2 reuniões',
        '',
        '**Ciclos**',
        '- **Projeto Alfa** — Em andamento',
        '  - Ajuste das consultas',
        '  - Testes (PR aberto)',
        '  - Deploy: Publicado em staging',
        '',
        '**Tarefas**',
        '- **TESTE-1** (Chamado): Erro no relatório fictício — Em andamento → Concluído',
        '  - Correção aplicada',
        '- **TESTE-2** (Chamado): Lentidão fictícia — Em andamento',
        '  - Análise do log',
        '',
        '**Reuniões**',
        '- Daily · Status do dia (com Equipe Exemplo)',
        '- Planejamento · Sprint (com Equipe Exemplo)',
        '',
        '## Impedimentos',
        '1 aberto · 1 resolvido no dia',
        '',
        '- **Projeto Alfa** — aguardando Equipe B desde 26/10 (3 dias úteis): Libera o acesso',
        '- **Projeto Alfa** — resolvido em 28/10 (Equipe D)',
        '',
        '## O que será feito hoje (Qui 29/10)',
        '- **Projeto Alfa** — Em andamento · prazo 02/11 (prazo próximo) · impedimento aberto',
        '- **Projeto Beta** — Em andamento',
        '- **TESTE-2** (Chamado): Lentidão fictícia',
        '- Na fila: 2 tarefas',
        '',
      ].join('\n'),
    );
  });

  it('itens desmarcados saem do texto; sem nenhum, a seção some', () => {
    const r = report();
    const some = dailyReportMarkdown(r, { today: TODAY, skipNext: new Set([3, 'fila']) });
    assert.match(some, /## O que será feito hoje/);
    assert.doesNotMatch(some, /- \*\*TESTE-2\*\* \(Chamado\): Lentidão fictícia\n/);
    assert.doesNotMatch(some, /Na fila/);

    const none = dailyReportMarkdown(r, { today: TODAY, skipNext: new Set([1, 7, 3, 'fila']) });
    assert.doesNotMatch(none, /O que será feito/);
  });

  it('dia vazio e sem impedimentos', () => {
    const md = dailyReportMarkdown(report({ acts: [], changes: [], blockers: [], demands: [beta] }), { today: TODAY });
    assert.match(md, /## O que foi feito\nNada registrado neste dia\./);
    assert.match(md, /## Impedimentos\nSem impedimentos\./);
  });

  it('a seção final diz a data quando não é hoje', () => {
    assert.match(dailyReportMarkdown(report(), { today: '2026-10-30' }), /## O que será feito em Qui 29\/10/);
  });
});
