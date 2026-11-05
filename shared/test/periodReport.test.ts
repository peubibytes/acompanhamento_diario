import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildDemandSummary,
  buildPeriodReport,
  getPeriod,
  parseHM,
  periodBlockersSummary,
  periodDoneSummary,
  periodReportMarkdown,
  unplannedText,
  type Activity,
  type CycleDemand,
  type Demand,
  type DemandBlocker,
  type DemandEvent,
  type DemandStatusChange,
} from '../src/index.ts';

// Semana Sex 23/10 → Qui 29/10; hoje é a quarta 28/10 (a semana ainda não terminou).
const WEEK = getPeriod('2026-10-26', 'week');
const MONTH = getPeriod('2026-10-26', 'month');
const TODAY = '2026-10-28';

const alpha: CycleDemand = {
  id: 1,
  category: 'ciclo',
  title: 'Projeto Alfa',
  description: '',
  kind: 'planejada',
  status: 'em_homologacao',
  priority: 'alta',
  startDate: '2026-10-01',
  dueDate: null,
  branch: '',
  prUrl: '',
  environment: null,
};
const urgent: CycleDemand = { ...alpha, id: 2, title: 'Correção urgente', kind: 'intempestiva', status: 'em_andamento' };
const idle: CycleDemand = { ...alpha, id: 3, title: 'Projeto parado', status: 'novo' };
const closedTicket: Demand = { id: 4, category: 'chamado', ticketNumber: 'TESTE-1', description: 'Erro fictício', status: 'concluido' };
const openTicket: Demand = { id: 5, category: 'chamado', ticketNumber: 'TESTE-2', description: 'Lentidão fictícia', status: 'em_andamento' };
const course: Demand = { id: 6, category: 'treinamento', title: 'Curso fictício', description: '', status: 'nao_iniciado' };
const daily: Demand = { id: 7, category: 'reuniao', meetingType: 'Daily', participants: 'Equipe Exemplo', subject: 'Status' };

const act = (demandId: number | null, date: string, start: string, end: string): Activity => ({
  id: 0,
  date,
  startMinute: parseHM(start)!,
  endMinute: parseHM(end)!,
  project: '',
  description: 'Feito',
  notes: '',
  demandId,
});

const activities = [
  act(1, '2026-10-23', '09:00', '12:00'),
  act(1, '2026-10-26', '09:00', '11:00'),
  act(2, '2026-10-27', '09:00', '10:00'), // intempestiva: 1h de 8h
  act(5, '2026-10-27', '10:00', '11:00'),
  act(7, '2026-10-26', '08:45', '09:00'),
  act(7, '2026-10-27', '08:45', '09:00'),
  act(7, '2026-10-27', '17:00', '17:15'), // mesma Daily no mesmo dia: uma ocorrência
  act(1, '2026-10-21', '09:00', '17:00'), // semana anterior: fora
];
const changes: DemandStatusChange[] = [
  { demandId: 1, from: null, to: 'novo', date: '2026-10-01' },
  { demandId: 1, from: 'novo', to: 'em_andamento', date: '2026-10-02' }, // antes do período
  { demandId: 1, from: 'em_andamento', to: 'em_homologacao', date: '2026-10-26' },
  { demandId: 4, from: 'em_andamento', to: 'concluido', date: '2026-10-27' },
];
const events: DemandEvent[] = [
  { id: 1, demandId: 1, date: '2026-10-27', kind: 'deploy', text: 'Publicado em staging', flagged: false },
  { id: 2, demandId: 1, date: '2026-10-23', kind: 'decisao', text: 'Escopo fechado', flagged: true },
  { id: 3, demandId: 3, date: '2026-10-20', kind: 'acao', text: 'Antes do período', flagged: false },
];
const blockers: DemandBlocker[] = [
  { id: 1, demandId: 2, owner: 'Equipe B', description: 'Acesso', since: '2026-10-22', resolvedAt: null, flagged: false },
  { id: 2, demandId: 1, owner: 'Equipe C', description: '', since: '2026-10-20', resolvedAt: '2026-10-26', flagged: false },
  { id: 3, demandId: 1, owner: 'Equipe D', description: '', since: '2026-10-10', resolvedAt: '2026-10-15', flagged: false }, // antes
];

const demandList = [alpha, urgent, idle, closedTicket, openTicket, course, daily];

function build(period = WEEK) {
  const history = { events, blockers, statusChanges: changes };
  const summaries = demandList.map((d) => buildDemandSummary(d, activities, TODAY, history));
  return buildPeriodReport({ period, today: TODAY, activities, demands: summaries, events, blockers, statusChanges: changes });
}

describe('relatório do período', () => {
  it('ciclos que andaram: apontados, com troca, evento ou impedimento no período, na ordem habitual', () => {
    const { cycles } = build().done;
    // O parado (só evento antes do período) fica de fora; mesma prioridade e sem prazo: ordem do título.
    assert.deepEqual(
      cycles.map((c) => c.label),
      ['Correção urgente', 'Projeto Alfa'],
    );
    const alfa = cycles.find((c) => c.demandId === 1)!;
    assert.equal(alfa.status, 'Em andamento → Em homologação');
    assert.equal(alfa.changed, true);
    assert.equal(alfa.workedDays, 2);
    assert.deepEqual(alfa.events, ['23/10 Decisão: Escopo fechado', '27/10 Deploy: Publicado em staging']);
    assert.equal(alfa.kind, '');
    const urgente = cycles.find((c) => c.demandId === 2)!;
    assert.equal(urgente.kind, 'Intempestiva');
    assert.equal(urgente.changed, false);
  });

  it('tarefas: concluídas no período separadas das trabalhadas; a fila sem movimento fica de fora', () => {
    const { completedTasks, workedTasks } = build().done;
    assert.deepEqual(completedTasks.map((t) => t.label), ['TESTE-1']);
    assert.equal(completedTasks[0].status, 'Em andamento → Concluído');
    assert.deepEqual(workedTasks.map((t) => t.label), ['TESTE-2']);
  });

  it('reuniões: cada uma uma vez, com os dias em que aconteceu', () => {
    const { meetings } = build().done;
    assert.equal(meetings.length, 1);
    assert.deepEqual([meetings[0].demandId, meetings[0].participants, meetings[0].occurrences], [7, 'Equipe Exemplo', 2]);
  });

  it('impedimentos: abertos no fim do período e resolvidos nele; a espera para em hoje', () => {
    const { blockers: b } = build();
    assert.equal(b.open, 1);
    assert.equal(b.resolved, 1);
    assert.deepEqual(
      b.items.map((i) => [i.owner, i.resolvedAt, i.waitingWorkdays]),
      [
        ['Equipe B', null, 5], // 22, 23, 26, 27, 28 (hoje)
        ['Equipe C', '2026-10-26', 5], // 20 a 26
      ],
    );
    assert.equal(periodBlockersSummary(b), '1 aberto · 1 resolvido no período');
  });

  it('trabalho não planejado: a fatia do tempo em ciclos intempestivos', () => {
    const { unplanned } = build();
    // Total: 3h + 2h + 1h + 1h + 15 + 15 + 15 min = 7h45; intempestiva 1h.
    assert.deepEqual(unplanned, { minutes: 60, total: 465, percent: 13 });
    assert.equal(unplannedText(unplanned), '13% do tempo (1h de 7h45) em ciclos intempestivos.');
  });

  it('no mês entram as semanas inteiras do mês', () => {
    const report = build(MONTH);
    assert.equal(report.done.cycles.find((c) => c.demandId === 1)!.workedDays, 3);
    assert.deepEqual(report.done.cycles.map((c) => c.demandId).sort(), [1, 2, 3]);
  });

  it('resumo só com o que houve', () => {
    assert.equal(periodDoneSummary(build().done), '2 ciclos · 2 tarefas (1 concluída) · 1 reunião');
  });

  it('período sem nada: textos de vazio', () => {
    const empty = buildPeriodReport({ period: getPeriod('2026-12-04', 'week'), today: TODAY, activities: [], demands: [], events: [], blockers: [], statusChanges: [] });
    const md = periodReportMarkdown(empty);
    assert.match(md, /^# Relatório semanal — Sex 04\/12 → Qui 10\/12\n/);
    assert.match(md, /Nada registrado neste período\./);
    assert.match(md, /Sem impedimentos\./);
    assert.match(md, /## Trabalho não planejado\nSem apontamentos no período\./);
  });

  it('Markdown com ciclos, tarefas, reuniões e impedimentos', () => {
    const md = periodReportMarkdown(build());
    assert.match(md, /^# Relatório semanal — Sex 23\/10 → Qui 29\/10/);
    assert.match(md, /- \*\*Projeto Alfa\*\* — Em andamento → Em homologação · 2 dias de trabalho\n {2}- 23\/10 Decisão: Escopo fechado/);
    assert.match(md, /- \*\*Correção urgente\*\* \(intempestiva\) — Em andamento · 1 dia de trabalho/);
    assert.match(md, /\*\*Tarefas concluídas\*\*\n- \*\*TESTE-1\*\* \(Chamado\): Erro fictício — Em andamento → Concluído/);
    assert.match(md, /\(com Equipe Exemplo\) — 2 vezes/);
    assert.match(md, /aguardando Equipe B desde 22\/10 \(5 dias úteis\): Acesso/);
    assert.match(periodReportMarkdown(build(MONTH)), /^# Relatório mensal — Outubro de 2026/);
  });
});

describe('relatório do período: atividades', () => {
  const doc: Demand = { id: 8, category: 'atividade', title: 'Documentação fictícia', description: '', status: 'concluido' };
  const withDoc = [...activities, act(8, '2026-10-27', '13:00', '14:00')];
  const docChanges: DemandStatusChange[] = [...changes, { demandId: 8, from: 'em_andamento', to: 'concluido', date: '2026-10-27' }];

  function buildWithDoc(list: Demand[], acts: Activity[], statusChanges: DemandStatusChange[]) {
    const history = { events, blockers, statusChanges };
    const summaries = list.map((d) => buildDemandSummary(d, acts, TODAY, history));
    return buildPeriodReport({ period: WEEK, today: TODAY, activities: acts, demands: summaries, events, blockers, statusChanges });
  }

  it('têm seção própria e não entram no resumo nem na contagem de tarefas', () => {
    const base = build();
    const r = buildWithDoc([...demandList, doc], withDoc, docChanges);
    assert.deepEqual(r.done.otherWork.map((i) => [i.label, i.status]), [['Documentação fictícia', 'Em andamento → Concluído']]);
    assert.equal(periodDoneSummary(r.done), periodDoneSummary(base.done));
    assert.deepEqual(r.done.completedTasks.map((t) => t.label), base.done.completedTasks.map((t) => t.label));
    assert.match(periodReportMarkdown(r), /\*\*Outras atividades\*\*\n- \*\*Documentação fictícia\*\* \(Atividade\) — Em andamento → Concluído/);
    assert.doesNotMatch(periodReportMarkdown(base), /Outras atividades/);
  });

  it('um período só com atividades não é "nada registrado"', () => {
    const md = periodReportMarkdown(buildWithDoc([doc], [act(8, '2026-10-27', '13:00', '14:00')], []));
    assert.doesNotMatch(md, /Nada registrado/);
    assert.match(md, /\*\*Outras atividades\*\*/);
  });
});
