import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildDailyReport,
  buildDemandSummary,
  dailyReportMarkdown,
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
const done: Demand = { id: 2, category: 'chamado', ticketNumber: 'TESTE-1', description: 'Fictício', status: 'concluido' };
const working: Demand = { id: 3, category: 'chamado', ticketNumber: 'TESTE-2', description: 'Fictício', status: 'em_andamento' };
const queued1: Demand = { id: 4, category: 'chamado', ticketNumber: 'TESTE-3', description: 'Fictício', status: 'nao_iniciado' };
const queued2: Demand = { id: 5, category: 'treinamento', title: 'Curso fictício', description: '', status: 'nao_iniciado' };
const meeting: Demand = { id: 6, category: 'reuniao', meetingType: 'Daily', participants: 'Equipe Exemplo', subject: 'Status do dia' };

const act = (id: number, demandId: number | null, start: string, end: string, description: string, notes = ''): Activity => ({
  id,
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
  { demandId: 3, from: null, to: 'em_andamento', date: DATE }, // declarada no dia: não conta como "feito"
];
const events: DemandEvent[] = [{ id: 1, demandId: 1, date: DATE, kind: 'deploy', text: 'Publicado em staging' }];
const blockers: DemandBlocker[] = [
  { id: 1, demandId: 1, owner: 'Equipe B', description: 'Libera o acesso', since: '2026-10-26', resolvedAt: null },
  { id: 2, demandId: 1, owner: 'Equipe C', description: '', since: '2026-10-20', resolvedAt: '2026-10-27' }, // antes do dia
  { id: 3, demandId: 1, owner: 'Equipe D', description: '', since: '2026-10-27', resolvedAt: DATE },
];

const activities = [
  act(1, 1, '09:00', '11:00', 'Ajuste das consultas'),
  act(2, 1, '10:30', '11:30', 'Testes', 'PR aberto'), // sobrepõe: o dia conta 09:00–11:30
  act(3, 2, '13:00', '14:00', 'Correção aplicada'),
  act(4, null, '14:00', '14:30', 'Item antigo'),
];

function report(overrides: { demands?: Demand[]; acts?: Activity[]; blockers?: DemandBlocker[] } = {}) {
  const demands = overrides.demands ?? [alpha, done, working, queued1, queued2, meeting];
  const acts = overrides.acts ?? activities;
  const history = { events, blockers: overrides.blockers ?? blockers, statusChanges };
  return buildDailyReport({
    date: DATE,
    goal: 330,
    activities: acts,
    demands: demands.map((d) => buildDemandSummary(d, acts, TODAY, history)),
    events,
    blockers: overrides.blockers ?? blockers,
    statusChanges,
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

  it('métricas do dia', () => {
    assert.equal(r.done.minutes, 150 + 60 + 30); // união 09:00–11:30 + 1h + 30min
    assert.equal(r.done.goal, 330);
    assert.equal(r.done.conformity, 'nao_conforme');
    assert.equal(r.done.activityCount, 4);
    assert.deepEqual(r.done.worked, { ciclo: 1, chamado: 1 }); // o item sem demanda não tem tipo
    assert.equal(r.done.completedTasks, 1);
  });

  it('itens por demanda, do maior tempo para o menor', () => {
    assert.deepEqual(
      r.done.items.map((i) => [i.label, i.minutes]),
      [
        ['Projeto Alfa', 150],
        ['TESTE-1', 60],
        ['Projeto antigo', 30],
      ],
    );
    const [first] = r.done.items;
    assert.deepEqual(first.entries.map((e) => e.description), ['Ajuste das consultas', 'Testes']);
    assert.deepEqual(first.events, [{ kind: 'deploy', text: 'Publicado em staging' }]);
    assert.deepEqual(r.done.items[1].statusChanges, ['Em andamento → Concluído']);
  });

  it('a declaração do dia não vira item sem apontamento nem evento', () => {
    assert.equal(r.done.items.some((i) => i.label === 'TESTE-2'), false);
  });

  it('dia sem nada', () => {
    const empty = report({ acts: [] });
    assert.equal(empty.done.activityCount, 0);
    assert.equal(empty.done.minutes, 0);
    assert.equal(empty.done.conformity, 'pendente');
  });
});

describe('relatório diário: impedimentos', () => {
  it('abertos, novos e resolvidos no dia; o resolvido antes não entra', () => {
    const b = report().blockers;
    assert.equal(b.open, 1);
    assert.equal(b.opened, 0);
    assert.equal(b.resolved, 1);
    assert.equal(b.longestWait, 3); // seg 26, ter 27, qua 28
    assert.deepEqual(
      b.items.map((i) => [i.owner, i.resolvedAt, i.waitingWorkdays]),
      [
        ['Equipe B', null, 3],
        ['Equipe D', DATE, 2],
      ],
    );
  });

  it('um impedimento resolvido depois do dia ainda estava aberto nele', () => {
    const later: DemandBlocker = { id: 9, demandId: 1, owner: 'Equipe E', description: '', since: '2026-10-27', resolvedAt: '2026-10-30' };
    const b = report({ blockers: [later] }).blockers;
    assert.equal(b.open, 1);
    assert.equal(b.items[0].resolvedAt, null);
  });

  it('sem impedimentos', () => {
    const b = report({ blockers: [] }).blockers;
    assert.deepEqual([b.open, b.opened, b.resolved, b.longestWait, b.items.length], [0, 0, 0, 0, 0]);
  });
});

describe('relatório diário: o que será feito', () => {
  it('andamento primeiro, depois os ciclos; reunião e concluídas ficam de fora', () => {
    const next = report().next!;
    assert.equal(next.date, '2026-10-29');
    assert.deepEqual(
      next.items.map((i) => [i.label, i.detail]),
      [
        ['TESTE-2', 'Em andamento'],
        ['Projeto Alfa', 'Em andamento · prazo 02/11 (prazo próximo) · impedimento aberto'],
      ],
    );
    assert.equal(next.queued, 2);
  });

  it('some quando só há demandas encerradas e reuniões', () => {
    assert.equal(report({ demands: [done, meeting] }).next, null);
  });

  it('aparece só com a fila', () => {
    const next = report({ demands: [queued1, meeting] }).next!;
    assert.equal(next.items.length, 0);
    assert.equal(next.queued, 1);
  });
});

describe('relatório diário: Markdown', () => {
  it('seções, métricas e itens', () => {
    const md = dailyReportMarkdown(report(), { today: TODAY });
    assert.equal(
      md,
      [
        '# Daily — Qua 28/10',
        '',
        '## O que foi feito',
        '4h apontadas (meta 5h30 · Não conforme) · 4 apontamentos · 1 ciclo, 1 chamado · 1 tarefa concluída',
        '',
        '- **Projeto Alfa** (Ciclo) — 2h30',
        '  - 09:00–11:00 Ajuste das consultas',
        '  - 10:30–11:30 Testes ↳ PR aberto',
        '  - Deploy: Publicado em staging',
        '- **TESTE-1** (Chamado) — 1h · Em andamento → Concluído',
        '  - 13:00–14:00 Correção aplicada',
        '- **Projeto antigo** — 30min',
        '  - 14:00–14:30 Item antigo',
        '',
        '## Impedimentos',
        '1 aberto · 0 novos · 1 resolvido · maior espera: 3 dias úteis',
        '',
        '- **Projeto Alfa** — Equipe B desde 26/10 (3 dias úteis): Libera o acesso',
        '- **Projeto Alfa** — Equipe D resolvido em 28/10 (2 dias úteis)',
        '',
        '## O que será feito hoje (Qui 29/10)',
        '- **TESTE-2** (Chamado) — Em andamento',
        '- **Projeto Alfa** (Ciclo) — Em andamento · prazo 02/11 (prazo próximo) · impedimento aberto',
        '- Na fila: 2 tarefas',
        '',
      ].join('\n'),
    );
  });

  it('itens desmarcados saem do texto; sem nenhum, a seção some', () => {
    const r = report();
    const some = dailyReportMarkdown(r, { today: TODAY, skipNext: new Set([3, 'fila']) });
    assert.match(some, /Projeto Alfa\*\* \(Ciclo\) — Em andamento · prazo/);
    assert.doesNotMatch(some, /TESTE-2\*\* \(Chamado\) — Em andamento/);
    assert.doesNotMatch(some, /Na fila/);

    const none = dailyReportMarkdown(r, { today: TODAY, skipNext: new Set([1, 3, 'fila']) });
    assert.doesNotMatch(none, /O que será feito/);
  });

  it('dia sem apontamentos e sem impedimentos', () => {
    const md = dailyReportMarkdown(report({ acts: [], blockers: [] }), { today: TODAY });
    // Sem apontamentos, o que aconteceu no dia (evento, troca de status) ainda aparece.
    assert.match(md, /## O que foi feito\nNenhum apontamento neste dia · 1 tarefa concluída\n\n- \*\*Projeto Alfa\*\* \(Ciclo\)\n {2}- Deploy/);
    assert.match(md, /## Impedimentos\nSem impedimentos\./);
  });

  it('a seção final diz a data quando não é hoje', () => {
    assert.match(dailyReportMarkdown(report(), { today: '2026-10-30' }), /## O que será feito em Qui 29\/10/);
  });
});
