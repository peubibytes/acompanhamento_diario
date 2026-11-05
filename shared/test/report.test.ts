import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildDailyReport,
  buildDemandSummary,
  dailyReportMarkdown,
  dayReference,
  doneDetail,
  doneHeadline,
  nextWorkday,
  parseHM,
  planSentence,
  previousWorkday,
  tidyText,
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

  it('a frase chama o dia de ontem, hoje ou pelo nome', () => {
    assert.equal(dayReference(DATE, TODAY), 'ontem');
    assert.equal(dayReference(TODAY, TODAY), 'hoje');
    assert.equal(dayReference('2026-10-30', '2026-11-02'), 'na sexta-feira (30/10)'); // segunda falando da sexta
  });
});

describe('arrumação do texto digitado', () => {
  it('espaços, pontuação repetida e o ponto final', () => {
    assert.equal(tidyText('  Ajuste  das consultas ,feito..  '), 'Ajuste das consultas, feito');
    assert.equal(tidyText('Pronto!!! Testado ;ok.'), 'Pronto! Testado; ok');
    assert.equal(tidyText('Valor 1,5 mantido...'), 'Valor 1,5 mantido');
  });
});

describe('relatório diário: o que foi feito', () => {
  const r = report();

  it('a frase de métricas conta chamados, reuniões e horas em ciclos', () => {
    assert.equal(doneHeadline(r, TODAY), 'Ontem, atendi 2 chamados, participei de 2 reuniões e fiz 3h30 de demandas de Ciclo.');
    assert.equal(r.done.cycleMinutes, 210); // 09:00–11:30 e 14:00–15:00
  });

  it('a frase de detalhamento junta chamados, pessoas e as ações dos ciclos', () => {
    assert.equal(
      doneDetail(r.done),
      'Atendi aos chamados TESTE-1 – Erro no relatório fictício (concluído) e TESTE-2 – Lentidão fictícia, entrei em reunião ' +
        'com Equipe Exemplo e fiz minhas demandas de ciclo: Projeto Alfa (ajuste das consultas; testes – PR aberto; ' +
        'deploy: publicado em staging; impedimento com Equipe D resolvido).',
    );
  });

  it('a frase de métricas cita só o que houve, com a pontuação certa', () => {
    const only = (acts: Activity[], demands: Demand[]) => doneHeadline(report({ acts, demands, changes: [], blockers: [] }), TODAY);
    assert.equal(only([act(3, '15:00', '16:00')], [working]), 'Ontem, atendi 1 chamado.');
    assert.equal(only([act(6, '09:00', '09:15')], [daily]), 'Ontem, participei de 1 reunião.');
    assert.equal(only([act(1, '09:00', '10:00')], [alpha]), 'Ontem, fiz 1h de demandas de Ciclo.');
    // Chamado e ciclo, sem reunião: sem vírgula antes do "e".
    assert.equal(only([act(3, '08:00', '09:00'), act(1, '09:00', '10:00')], [working, alpha]), 'Ontem, atendi 1 chamado e fiz 1h de demandas de Ciclo.');
    assert.equal(
      only([act(3, '08:00', '09:00'), act(6, '09:00', '09:15'), act(1, '10:00', '11:00')], [working, daily, alpha]),
      'Ontem, atendi 1 chamado, participei de 1 reunião e fiz 1h de demandas de Ciclo.',
    );
    assert.doesNotMatch(only([act(3, '08:00', '09:00')], [working]), /\b0\b|, e /);
  });

  it('ciclos: o que andou, sem repetir, com eventos e impedimentos resolvidos no dia', () => {
    assert.deepEqual(r.done.cycles, [
      {
        demandId: 1,
        label: 'Projeto Alfa',
        category: 'ciclo',
        subtitle: '',
        status: 'Em andamento',
        changed: false,
        completed: false,
        minutes: 210,
        progress: ['Ajuste das consultas', 'Testes – PR aberto', 'Deploy: publicado em staging', 'Impedimento com Equipe D resolvido'],
      },
    ]);
  });

  it('chamados: o concluído no dia primeiro, com a troca de status', () => {
    assert.deepEqual(
      r.done.tickets.map((t) => [t.label, t.subtitle, t.status, t.completed, t.progress]),
      [
        ['TESTE-1', 'Erro no relatório fictício', 'Em andamento → Concluído', true, ['Correção aplicada']],
        ['TESTE-2', 'Lentidão fictícia', 'Em andamento', false, ['Análise do log']],
      ],
    );
    assert.equal(r.done.completedTasks, 1);
  });

  it('reuniões: cada uma uma vez; as pessoas sem repetir', () => {
    assert.deepEqual(
      r.done.meetings.map((m) => m.label),
      ['Daily · Status do dia', 'Planejamento · Sprint'],
    );
    assert.deepEqual(r.done.people, ['Equipe Exemplo']);
  });

  it('a declaração do dia e o ciclo não tocado não entram', () => {
    assert.equal(r.done.tickets.some((t) => t.label === 'TESTE-3'), false);
    assert.equal(r.done.cycles.some((c) => c.label === 'Projeto Beta'), false);
  });

  it('ida e volta de status no mesmo dia não é mudança', () => {
    const roundTrip = report({
      changes: [
        { demandId: 3, from: 'em_andamento', to: 'concluido', date: DATE },
        { demandId: 3, from: 'concluido', to: 'em_andamento', date: DATE },
      ],
    });
    const t = roundTrip.done.tickets.find((x) => x.label === 'TESTE-2')!;
    assert.deepEqual([t.status, t.changed], ['Em andamento', false]);
  });

  it('mais de três chamados: a frase cita a quantidade e a tabela lista', () => {
    const many: Demand[] = [10, 11, 12, 13].map((id) => ({
      id,
      category: 'chamado',
      ticketNumber: `TESTE-${id}`,
      description: `Fictício ${id}`,
      status: 'em_andamento',
    }));
    const acts = many.map((d, i) => act(d.id, `0${i + 1}:00`, `0${i + 1}:30`, 'Análise'));
    const big = report({ demands: many, acts, changes: [], blockers: [] });
    assert.equal(doneDetail(big.done), 'Atendi aos 4 chamados da tabela abaixo.');
    const md = dailyReportMarkdown(big, { today: TODAY });
    assert.match(md, /\| Chamado \| Descrição \| Situação \|\n\| --- \| --- \| --- \|\n\| TESTE-13 \| Fictício 13 \| Em andamento \|/);
    assert.match(md, /Para hoje, buscarei encerrar os 4 chamados da tabela abaixo\./);
  });

  it('dia sem nada', () => {
    const empty = report({ acts: [], changes: [], blockers: [], demands: [beta, daily] });
    assert.equal(doneHeadline(empty, TODAY), '');
    assert.equal(doneDetail(empty.done), '');
  });
});

describe('relatório diário: impedimentos', () => {
  it('abertos no dia e os resolvidos nele; o resolvido antes não entra', () => {
    const b = report().blockers;
    assert.deepEqual([b.open, b.resolved], [1, 1]);
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
  it('chamados que ficaram e os novos, treinamentos iniciados e ciclos abertos; o resto vai para a fila', () => {
    const next = report().next;
    assert.equal(next.date, '2026-10-29');
    assert.deepEqual(
      next.tickets.map((i) => [i.label, i.detail, i.isNew]),
      [
        ['TESTE-2', 'Lentidão fictícia', false],
        ['TESTE-3', 'Fictício', true], // declarado no dia do relatório
      ],
    );
    assert.deepEqual(
      next.cycles.map((i) => [i.label, i.detail]),
      [
        ['Projeto Alfa', 'Em andamento · prazo 02/11 (prazo próximo) · impedimento aberto'],
        ['Projeto Beta', 'Em andamento'],
      ],
    );
    // Todo treinamento aberto entra no plano, iniciado ou não.
    assert.deepEqual(next.trainings.map((i) => i.label), ['Curso fictício']);
  });

  it('a frase de planejamento, e sem os itens desmarcados', () => {
    const next = report().next;
    assert.equal(
      planSentence(next, TODAY),
      'Para hoje, buscarei encerrar os chamados TESTE-2 – Lentidão fictícia e TESTE-3 – Fictício, seguirei no treinamento Curso fictício e atuarei nas demandas Projeto Alfa e Projeto Beta.',
    );
    assert.equal(planSentence(next, TODAY, new Set([3, 4, 5, 7])), 'Para hoje, atuarei na demanda Projeto Alfa.');
    assert.equal(planSentence(next, '2026-10-30', new Set([1, 3, 4, 5, 7])), 'Para quinta-feira (29/10), não há demandas em aberto.');
  });

  it('chamado antigo não iniciado entra no plano, mas sem o selo "novo"', () => {
    const old = report({ changes: [{ demandId: 4, from: null, to: 'nao_iniciado', date: '2026-10-20' }] }).next;
    assert.deepEqual(old.tickets.map((i) => [i.label, i.isNew]), [['TESTE-2', false], ['TESTE-3', false]]);
  });
});

describe('relatório diário: Markdown', () => {
  it('dois tópicos, cada um aberto pela sua frase', () => {
    const md = dailyReportMarkdown(report(), { today: TODAY });
    assert.equal(
      md,
      [
        '# Daily — Qua 28/10',
        '',
        '## O que foi feito ontem',
        'Ontem, atendi 2 chamados, participei de 2 reuniões e fiz 3h30 de demandas de Ciclo.',
        '',
        'Atendi aos chamados TESTE-1 – Erro no relatório fictício (concluído) e TESTE-2 – Lentidão fictícia, entrei em reunião ' +
          'com Equipe Exemplo e fiz minhas demandas de ciclo: Projeto Alfa (ajuste das consultas; testes – PR aberto; ' +
          'deploy: publicado em staging; impedimento com Equipe D resolvido).',
        '',
        '## O que será feito hoje',
        'Para hoje, buscarei encerrar os chamados TESTE-2 – Lentidão fictícia e TESTE-3 – Fictício, seguirei no treinamento Curso fictício e atuarei nas demandas Projeto Alfa e Projeto Beta.',
        '',
        '- **Projeto Alfa** — impedimento aguardando Equipe B desde 26/10 (3 dias úteis): Libera o acesso',
        '',
      ].join('\n'),
    );
  });

  it('itens desmarcados saem da frase', () => {
    const md = dailyReportMarkdown(report(), { today: TODAY, skipNext: new Set([3, 4, 5]) });
    assert.match(md, /Para hoje, atuarei nas demandas Projeto Alfa e Projeto Beta\./);
    assert.doesNotMatch(md, /Na fila/);
  });

  it('dia vazio', () => {
    const md = dailyReportMarkdown(report({ acts: [], changes: [], blockers: [], demands: [beta] }), { today: TODAY });
    assert.match(md, /## O que foi feito ontem\nNada registrado ontem\./);
    assert.match(md, /## O que será feito hoje\nPara hoje, atuarei na demanda Projeto Beta\./);
  });

  it('os títulos dizem o dia quando não é ontem nem hoje', () => {
    const md = dailyReportMarkdown(report(), { today: '2026-10-30' });
    assert.match(md, /## O que foi feito na quarta-feira \(28\/10\)\nNa quarta-feira \(28\/10\), atendi/);
    assert.match(md, /## O que será feito na quinta-feira \(29\/10\)\nPara quinta-feira \(29\/10\), buscarei/);
  });
});

describe('relatório diário: atividades', () => {
  const doc: Demand = { id: 9, category: 'atividade', title: 'Documentação fictícia', description: '', status: 'em_andamento' };
  const kits: Demand = { id: 10, category: 'atividade', title: 'Busca de kits fictícios', description: '', status: 'nao_iniciado' };

  it('ficam numa seção própria, fora da frase de métricas e do detalhamento', () => {
    const r = report({
      demands: [working, doc],
      acts: [act(3, '08:00', '09:00', 'Análise do log'), act(9, '09:00', '11:00', 'Revisão do texto', 'Enviado para validação')],
      changes: [],
      blockers: [],
    });
    assert.deepEqual(r.done.otherWork.map((i) => [i.label, i.progress]), [['Documentação fictícia', ['Revisão do texto – Enviado para validação']]]);
    assert.equal(doneHeadline(r, TODAY), 'Ontem, atendi 1 chamado.');
    assert.doesNotMatch(doneDetail(r.done), /Documentação/);
    assert.equal(r.done.completedTasks, 0);

    const md = dailyReportMarkdown(r, { today: TODAY });
    assert.match(md, /\*\*Outras atividades\*\*\n- Documentação fictícia \(revisão do texto – Enviado para validação\)\n/);
  });

  it('um dia só com atividades tem seção, mas não tem frase de métricas', () => {
    const r = report({ demands: [doc], acts: [act(9, '09:00', '10:00', 'Revisão do texto')], changes: [], blockers: [] });
    assert.equal(doneHeadline(r, TODAY), '');
    const md = dailyReportMarkdown(r, { today: TODAY });
    assert.doesNotMatch(md, /Nada registrado/);
    assert.match(md, /## O que foi feito ontem\n\n\*\*Outras atividades\*\*\n- Documentação fictícia \(revisão do texto\)\n/);
  });

  it('concluída no dia não conta como tarefa concluída e nunca entra no plano', () => {
    const r = report({
      demands: [doc, kits],
      acts: [act(9, '09:00', '10:00', 'Revisão do texto')],
      changes: [{ demandId: 9, from: 'em_andamento', to: 'concluido', date: DATE }],
      blockers: [],
    });
    assert.equal(r.done.completedTasks, 0);
    assert.equal(r.done.otherWork[0].status, 'Em andamento → Concluído');
    assert.deepEqual([r.next.tickets.length, r.next.trainings.length, r.next.cycles.length], [0, 0, 0]);
    assert.equal(planSentence(r.next, TODAY), 'Para hoje, não há demandas em aberto.');
  });
});
