import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { after, before, beforeEach, describe, it } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import type { Activity, CycleSummary, DemandSummary } from '@acomp/shared';
import { createApp } from '../src/app.ts';
import { migrate, openDb, SCHEMA_VERSION } from '../src/db.ts';
import { createRepo } from '../src/repo.ts';

let server: Server;
let base = '';
let today = '2026-10-27'; // terça-feira, ciclo 23/10 → 29/10

async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(base + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
}

/** Apontamento de exemplo, feito sobre a reunião declarada no `before`. */
const sample = {
  date: '2026-10-26',
  startMinute: 480,
  endMinute: 525,
  demandId: 0,
  description: 'Leitura da documentação',
  notes: 'Resumo enviado',
};

before(async () => {
  const repo = createRepo(openDb(':memory:'));
  server = createApp({ repo, today: () => today }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://localhost:${(server.address() as AddressInfo).port}/api`;

  const meeting = await api('POST', '/demands', {
    category: 'reuniao',
    meetingType: 'Daily',
    participants: 'Equipe Exemplo',
    subject: 'Status do dia',
  });
  sample.demandId = meeting.data.id;
});

after(() => server.close());

beforeEach(() => {
  today = '2026-10-27';
});

describe('API de apontamentos e ciclos', () => {
  it('cria, lista, edita e remove um apontamento sobre uma demanda', async () => {
    const created = await api('POST', '/activities', sample);
    assert.equal(created.status, 201);
    assert.deepEqual(created.data.warnings, []);
    const id = created.data.activity.id;
    // O "projeto" da planilha passa a ser o nome da demanda.
    assert.equal(created.data.activity.project, 'Daily · Status do dia');

    const list = await api('GET', '/activities?date=2026-10-26');
    assert.equal(list.data.length, 1);
    assert.equal(list.data[0].demandId, sample.demandId);

    // O status existe só na demanda: o apontamento não o tem, e um status enviado é ignorado.
    const edited = await api('PUT', `/activities/${id}`, { ...sample, notes: 'Revisado', status: 'pendente_aprovacao' });
    assert.equal(edited.status, 200);
    assert.equal(edited.data.activity.notes, 'Revisado');
    assert.equal('status' in edited.data.activity, false);

    assert.equal((await api('DELETE', `/activities/${id}`)).status, 204);
    assert.equal((await api('DELETE', `/activities/${id}`)).status, 404);
  });

  it('só aponta o que foi declarado', async () => {
    const { demandId: _, ...withoutDemand } = sample;
    const missing = await api('POST', '/activities', withoutDemand);
    assert.equal(missing.status, 400);
    assert.match(missing.data.error, /Escolha a demanda/);

    const unknown = await api('POST', '/activities', { ...sample, demandId: 9999 });
    assert.equal(unknown.status, 400);
    assert.match(unknown.data.error, /Demanda não encontrada/);
  });

  it('valida horários e dias úteis', async () => {
    const cases: [object, RegExp][] = [
      [{ ...sample, endMinute: 480 }, /fim deve ser depois/],
      [{ ...sample, date: '2026-10-24' }, /dias úteis/],
      [{ ...sample, date: '2026-13-01' }, /Data inválida/],
    ];
    for (const [body, message] of cases) {
      const res = await api('POST', '/activities', body);
      assert.equal(res.status, 400);
      assert.match(res.data.error, message);
    }
  });

  it('avisa quando há sobreposição de horários', async () => {
    const first = await api('POST', '/activities', { ...sample, date: '2026-10-28', startMinute: 540, endMinute: 600 });
    const second = await api('POST', '/activities', { ...sample, date: '2026-10-28', startMinute: 570, endMinute: 630 });
    assert.equal(second.status, 201);
    assert.equal(second.data.warnings.length, 1);
    assert.match(second.data.warnings[0], /Daily · Status do dia" \(09:00–10:00\)/);

    // Encostar no fim da anterior não é sobreposição.
    const third = await api('POST', '/activities', { ...sample, date: '2026-10-28', startMinute: 630, endMinute: 660 });
    assert.deepEqual(third.data.warnings, []);

    for (const r of [first, second, third]) await api('DELETE', `/activities/${r.data.activity.id}`);
  });

  it('resume o ciclo sexta → quinta com as métricas da planilha', async () => {
    await api('POST', '/activities', sample);
    await api('POST', '/activities', { ...sample, date: '2026-10-23', startMinute: 480, endMinute: 810 });

    const { status, data } = (await api('GET', '/cycles/2026-10-25')) as { status: number; data: CycleSummary };
    assert.equal(status, 200);
    assert.equal(data.start, '2026-10-23');
    assert.equal(data.end, '2026-10-29');
    assert.deepEqual(
      data.days.map((d) => d.weekdayShort),
      ['Sex', 'Seg', 'Ter', 'Qua', 'Qui'],
    );
    assert.equal(data.days[0].conformity, 'conforme');
    assert.equal(data.days[1].diagnosis, 'Faltam 04:45');
    assert.equal(data.week.goal, 1650);
    assert.equal(data.week.total, 375);
    assert.equal(data.week.fillPercent, 22);
  });

  it('meta definida no ciclo atual vale para os próximos e não altera o passado', async () => {
    // Ciclo passado com apontamento, ainda seguindo a meta padrão (5h30).
    await api('POST', '/activities', { ...sample, date: '2026-10-16' });

    const res = await api('PUT', '/cycles/2026-10-27/goal', { dailyGoalMinutes: 528 });
    assert.equal(res.data.appliesToNextCycles, true);

    assert.equal((await api('GET', '/cycles/2026-10-27')).data.dailyGoal, 528);
    assert.equal((await api('GET', '/cycles/2026-11-03')).data.dailyGoal, 528);
    assert.equal((await api('GET', '/cycles/2026-10-16')).data.dailyGoal, 330);
    assert.equal((await api('GET', '/cycles/2026-10-27')).data.week.goal, 2640);
  });

  it('meta editada em ciclo passado vale só para ele', async () => {
    const res = await api('PUT', '/cycles/2026-10-09/goal', { dailyGoalMinutes: 400 });
    assert.equal(res.data.appliesToNextCycles, false);
    assert.equal((await api('GET', '/cycles/2026-10-09')).data.dailyGoal, 400);
    assert.equal((await api('GET', '/cycles/2026-10-27')).data.dailyGoal, 528);
  });

  it('rejeita meta inválida e JSON malformado', async () => {
    assert.equal((await api('PUT', '/cycles/2026-10-27/goal', { dailyGoalMinutes: 0 })).status, 400);
    const res = await fetch(`${base}/activities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{oops',
    });
    assert.equal(res.status, 400);
  });
});

describe('sobreposição de horários no resumo', () => {
  it('soma o dia pela união dos intervalos', async () => {
    const day = '2026-11-02';
    const a = await api('POST', '/activities', { ...sample, date: day, startMinute: 480, endMinute: 600 });
    const b = await api('POST', '/activities', { ...sample, date: day, startMinute: 540, endMinute: 660 });
    const { data } = (await api('GET', `/cycles/${day}`)) as { data: CycleSummary };
    const monday = data.days.find((d) => d.date === day)!;
    assert.equal(monday.minutes, 180);
    assert.equal(monday.overlapMinutes, 60);
    assert.match(b.data.warnings[0], /conta uma única vez/);
    for (const r of [a, b]) await api('DELETE', `/activities/${r.data.activity.id}`);
  });
});

describe('API de demandas: declaração', () => {
  const cycleBody = { category: 'ciclo', title: 'Migração de relatórios', dueDate: '2026-11-06' };
  const ticketBody = {
    category: 'chamado',
    ticketNumber: ' sctask0000001 ',
    description: 'Erro ao gerar o relatório mensal. Solicitado pela área financeira.',
  };
  const trainingBody = { category: 'treinamento', title: 'Curso de SQL' };

  it('declara os quatro tipos, sem nenhum campo de horas', async () => {
    const cycle = (await api('POST', '/demands', { ...cycleBody, targetMinutes: 600 })).data as DemandSummary;
    assert.equal(cycle.category, 'ciclo');
    assert.equal(cycle.label, 'Migração de relatórios');
    assert.equal(cycle.category === 'ciclo' && cycle.startDate, '2026-10-27'); // padrão: hoje
    assert.equal(cycle.category === 'ciclo' && cycle.status, 'novo');
    assert.equal('targetMinutes' in cycle, false); // campo de horas é ignorado

    const ticket = (await api('POST', '/demands', ticketBody)).data as DemandSummary;
    assert.equal(ticket.category === 'chamado' && ticket.ticketNumber, 'SCTASK0000001');
    assert.equal(ticket.category === 'chamado' && ticket.status, 'nao_iniciado');
    assert.equal(ticket.subtitle, 'Erro ao gerar o relatório mensal. Solicitado pela área financeira.');

    const training = (await api('POST', '/demands', trainingBody)).data as DemandSummary;
    assert.equal(training.label, 'Curso de SQL');

    const meeting = (await api('GET', `/demands/${sample.demandId}`)).data as DemandSummary;
    assert.equal(meeting.label, 'Daily · Status do dia');
    assert.equal(meeting.subtitle, 'com Equipe Exemplo');

    for (const d of [cycle, ticket, training]) await api('DELETE', `/demands/${d.id}`);
  });

  it('valida os campos de cada tipo', async () => {
    const cases: [object, RegExp][] = [
      [{ ...cycleBody, title: ' ' }, /nome do projeto/],
      [{ ...cycleBody, startDate: '2026-11-10' }, /anterior ao início/],
      [{ ...cycleBody, status: 'iniciado' }, /Status inválido/],
      [{ ...cycleBody, prUrl: 'pr-1' }, /Link do PR inválido/],
      [{ ...ticketBody, ticketNumber: '' }, /número do chamado/],
      [{ ...ticketBody, ticketNumber: 'com espaço' }, /Número do chamado inválido/],
      [{ category: 'chamado', ticketNumber: 'INC1' }, /Descreva o chamado/],
      [{ ...ticketBody, status: 'cancelado' }, /Status inválido/],
      [{ category: 'reuniao', meetingType: 'Daily', subject: 'Status' }, /com quem/],
      [{ category: 'reuniao', participants: 'Equipe', subject: 'Status' }, /tipo da reunião/],
      [{ category: 'reuniao', meetingType: 'Daily', participants: 'Equipe' }, /assunto/],
      [{ category: 'treinamento' }, /nome do treinamento/],
      [{ category: 'outro', title: 'x' }, /Tipo de demanda inválido/],
      [{ title: 'Sem categoria' }, /Tipo de demanda inválido/],
    ];
    for (const [body, message] of cases) {
      const res = await api('POST', '/demands', body);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.match(res.data.error, message);
    }
  });

  it('não declara duas vezes o mesmo chamado nem a mesma reunião', async () => {
    const ticket = (await api('POST', '/demands', ticketBody)).data;
    const again = await api('POST', '/demands', { ...ticketBody, ticketNumber: 'SCTASK0000001' });
    assert.equal(again.status, 409);
    assert.match(again.data.error, /SCTASK0000001 já está declarado/);

    const other = (await api('POST', '/demands', { ...ticketBody, ticketNumber: 'INC0000002' })).data;
    const clash = await api('PUT', `/demands/${other.id}`, ticketBody);
    assert.equal(clash.status, 409);
    // Editar o próprio chamado mantendo o número não é duplicidade.
    assert.equal((await api('PUT', `/demands/${ticket.id}`, { ...ticketBody, status: 'iniciado' })).status, 200);

    const meeting = await api('POST', '/demands', {
      category: 'reuniao',
      meetingType: 'daily',
      participants: 'equipe exemplo',
      subject: 'STATUS DO DIA',
    });
    assert.equal(meeting.status, 409);

    for (const d of [ticket, other]) await api('DELETE', `/demands/${d.id}`);
  });

  it('edita sem mudar o tipo e atualiza o nome gravado nos apontamentos', async () => {
    const training = (await api('POST', '/demands', trainingBody)).data;
    const act = (await api('POST', '/activities', { ...sample, date: '2026-11-03', demandId: training.id })).data.activity;
    assert.equal(act.project, 'Curso de SQL');

    const renamed = await api('PUT', `/demands/${training.id}`, { ...trainingBody, title: 'Curso de SQL avançado' });
    assert.equal(renamed.data.label, 'Curso de SQL avançado');
    const [after] = (await api('GET', '/activities?date=2026-11-03')).data as Activity[];
    assert.equal(after.project, 'Curso de SQL avançado');

    const changed = await api('PUT', `/demands/${training.id}`, { ...ticketBody });
    assert.equal(changed.status, 400);
    assert.match(changed.data.error, /tipo de uma demanda não muda/);
    assert.equal((await api('PUT', '/demands/9999', trainingBody)).status, 404);

    await api('DELETE', `/activities/${act.id}`);
    await api('DELETE', `/demands/${training.id}`);
  });

  it('só exclui a demanda que não tem apontamentos', async () => {
    const training = (await api('POST', '/demands', trainingBody)).data;
    const act = (await api('POST', '/activities', { ...sample, date: '2026-11-03', demandId: training.id })).data.activity;

    const blocked = await api('DELETE', `/demands/${training.id}`);
    assert.equal(blocked.status, 409);
    assert.match(blocked.data.error, /1 apontamento/);

    await api('DELETE', `/activities/${act.id}`);
    assert.equal((await api('DELETE', `/demands/${training.id}`)).status, 204);
    assert.equal((await api('DELETE', `/demands/${training.id}`)).status, 404);
  });

  it('filtra por status e categoria, e ordena por categoria', async () => {
    const open = (await api('POST', '/demands', ticketBody)).data;
    const done = (await api('POST', '/demands', { ...ticketBody, ticketNumber: 'INC9', status: 'concluido' })).data;
    const cycle = (await api('POST', '/demands', cycleBody)).data;

    const labels = async (query: string) =>
      ((await api('GET', `/demands${query}`)).data as DemandSummary[]).map((d) => d.label);
    assert.deepEqual(await labels(''), ['Migração de relatórios', 'SCTASK0000001', 'INC9', 'Daily · Status do dia']);
    assert.deepEqual(await labels('?category=chamado&status=abertas'), ['SCTASK0000001']);
    assert.deepEqual(await labels('?status=encerradas'), ['INC9']);
    assert.equal((await api('GET', '/demands?status=ativa')).status, 400);
    assert.equal((await api('GET', '/demands?category=xyz')).status, 400);

    for (const d of [open, done, cycle]) await api('DELETE', `/demands/${d.id}`);
  });
});

describe('API de demandas: ciclos', () => {
  const cycleBody = {
    category: 'ciclo',
    title: 'Ajuste no relatório de vendas',
    kind: 'intempestiva',
    priority: 'alta',
    status: 'em_andamento',
    dueDate: '2026-10-29',
    branch: 'feature/ajuste-relatorio',
    prUrl: 'https://exemplo.invalid/pr/1',
    environment: 'staging',
  };

  it('calcula horas apontadas, prazo e lembrete a partir dos apontamentos', async () => {
    const d = (await api('POST', '/demands', cycleBody)).data as DemandSummary;
    assert.equal(d.category === 'ciclo' && d.environment, 'staging');

    const link = { ...sample, demandId: d.id };
    const acts = [
      await api('POST', '/activities', { ...link, date: '2026-10-26', startMinute: 480, endMinute: 720 }),
      await api('POST', '/activities', { ...link, date: '2026-10-27', startMinute: 540, endMinute: 660 }),
      await api('POST', '/activities', { ...link, date: '2026-10-27', startMinute: 600, endMinute: 720 }),
    ];

    const { data: detail } = await api('GET', `/demands/${d.id}`);
    assert.equal(detail.metrics.logged, 420); // 4h + união(09–11, 10–12) = 3h
    assert.equal(detail.metrics.dayCount, 2);
    assert.equal(detail.metrics.deadline, 'proxima');
    assert.equal(detail.metrics.reminder, 'Vence em 2 dias úteis (29/10). 7h apontadas até agora.');
    assert.equal(detail.activities.length, 3);
    assert.equal(detail.activities[0].date, '2026-10-27'); // mais recentes primeiro

    for (const r of acts) await api('DELETE', `/activities/${r.data.activity.id}`);
    await api('DELETE', `/demands/${d.id}`);
  });

  it('registra linha do tempo e impedimentos, separando a espera', async () => {
    const d = (await api('POST', '/demands', cycleBody)).data as DemandSummary;

    const e1 = await api('POST', `/demands/${d.id}/events`, { date: '2026-10-23', kind: 'decisao', text: 'Escopo definido' });
    assert.equal(e1.status, 201);
    const e2 = await api('POST', `/demands/${d.id}/events`, { text: 'Ajuste enviado para validação' });
    assert.equal(e2.data.date, '2026-10-27'); // padrão: hoje
    assert.equal(e2.data.kind, 'acao');
    assert.equal((await api('POST', `/demands/${d.id}/events`, { text: ' ' })).status, 400);

    const edited = await api('PUT', `/demands/${d.id}/events/${e1.data.id}`, { ...e1.data, text: 'Escopo revisado' });
    assert.equal(edited.data.text, 'Escopo revisado');

    const b = await api('POST', `/demands/${d.id}/blockers`, { owner: 'Equipe de infraestrutura', since: '2026-10-26' });
    assert.equal(b.status, 201);
    assert.equal(b.data.resolvedAt, null);
    const bad = await api('POST', `/demands/${d.id}/blockers`, {
      owner: 'Equipe X',
      since: '2026-10-26',
      resolvedAt: '2026-10-20',
    });
    assert.match(bad.data.error, /anterior ao início/);

    let detail = (await api('GET', `/demands/${d.id}`)).data;
    assert.equal(detail.events.length, 2);
    assert.equal(detail.events[0].date, '2026-10-27'); // mais recentes primeiro
    assert.equal(detail.blockers.length, 1);
    const { lastUpdate, ...counts } = detail.tracking;
    assert.deepEqual(counts, { eventCount: 2, lastEventDate: '2026-10-27', openBlockers: 1, waitingWorkdays: 2 });
    assert.deepEqual(lastUpdate, { date: '2026-10-27', kind: 'evento', text: 'Ajuste enviado para validação' });

    await api('PUT', `/demands/${d.id}/blockers/${b.data.id}`, { ...b.data, resolvedAt: '2026-10-26' });
    detail = (await api('GET', `/demands/${d.id}`)).data;
    assert.equal(detail.tracking.openBlockers, 0);
    assert.equal(detail.tracking.waitingWorkdays, 1);

    // Itens inexistentes ou de demanda inexistente não são encontrados.
    assert.equal((await api('PUT', `/demands/${d.id}/events/9999`, { text: 'x' })).status, 404);
    assert.equal((await api('POST', '/demands/9999/events', { text: 'x' })).status, 404);
    assert.equal((await api('DELETE', `/demands/${d.id}/events/${e2.data.id}`)).status, 204);
    assert.equal((await api('DELETE', `/demands/${d.id}/events/${e2.data.id}`)).status, 404);

    // Excluir o ciclo leva junto a linha do tempo e os impedimentos.
    await api('DELETE', `/demands/${d.id}`);
    const again = (await api('POST', '/demands', cycleBody)).data as DemandSummary;
    assert.deepEqual(again.tracking, {
      eventCount: 0,
      lastEventDate: null,
      openBlockers: 0,
      waitingWorkdays: 0,
      lastUpdate: { date: '2026-10-27', kind: 'status', text: 'Declarada como Em andamento' },
    });
    await api('DELETE', `/demands/${again.id}`);
  });

  it('tarefas não têm linha do tempo nem impedimentos', async () => {
    const res = await api('POST', `/demands/${sample.demandId}/events`, { text: 'x' });
    assert.equal(res.status, 400);
    assert.match(res.data.error, /só nos ciclos/);
    assert.equal((await api('POST', `/demands/${sample.demandId}/blockers`, { owner: 'x' })).status, 400);
  });
});

describe('API de tarefas: histórico de status e métricas', () => {
  const ticketBody = { category: 'chamado', ticketNumber: 'HIST0000001', description: 'Descrição fictícia' };
  const metrics = async (date = today) => (await api('GET', `/metrics?date=${date}`)).data;

  it('registra cada troca de status com a data e informa quando foi concluída', async () => {
    const created = (await api('POST', '/demands', ticketBody)).data as DemandSummary;
    today = '2026-10-28';
    await api('PUT', `/demands/${created.id}`, { ...ticketBody, status: 'em_andamento' });
    // Editar sem trocar o status não entra no histórico.
    await api('PUT', `/demands/${created.id}`, { ...ticketBody, status: 'em_andamento', description: 'Descrição revisada' });
    today = '2026-10-29';
    const done = (await api('PUT', `/demands/${created.id}`, { ...ticketBody, status: 'concluido' })).data as DemandSummary;
    assert.equal(done.completedAt, '2026-10-29');
    assert.deepEqual(done.tracking.lastUpdate, { date: '2026-10-29', kind: 'status', text: 'Em andamento → Concluído' });

    const { data: detail } = await api('GET', `/demands/${created.id}`);
    assert.deepEqual(
      detail.statusChanges.map((c: { from: string | null; to: string; date: string }) => [c.from, c.to, c.date]),
      [
        ['em_andamento', 'concluido', '2026-10-29'],
        ['nao_iniciado', 'em_andamento', '2026-10-28'],
        [null, 'nao_iniciado', '2026-10-27'],
      ],
    );

    // Reabrir apaga a data de conclusão, mas o histórico fica.
    const reopened = (await api('PUT', `/demands/${created.id}`, { ...ticketBody, status: 'iniciado' })).data;
    assert.equal(reopened.completedAt, null);

    await api('DELETE', `/demands/${created.id}`);
    assert.equal((await api('GET', `/demands/${created.id}`)).status, 404);
  });

  it('reunião não tem status e não entra no histórico', async () => {
    const m = (await api('POST', '/demands', {
      category: 'reuniao',
      meetingType: 'Semanal',
      participants: 'Equipe Exemplo',
      subject: 'Histórico',
    })).data as DemandSummary;
    const { data: detail } = await api('GET', `/demands/${m.id}`);
    assert.deepEqual(detail.statusChanges, []);
    assert.equal(detail.completedAt, null);
    await api('DELETE', `/demands/${m.id}`);
  });

  it('métricas: concluídas no ciclo, na fila e em andamento', async () => {
    today = '2026-10-29'; // quinta, fecha o ciclo 23/10 → 29/10
    const before = (await metrics()).tasks;
    const mk = async (n: number, status: string) =>
      ((await api('POST', '/demands', { ...ticketBody, ticketNumber: `METR000000${n}`, status })).data as DemandSummary).id;
    const ids = [await mk(1, 'nao_iniciado'), await mk(2, 'em_andamento'), await mk(3, 'concluido')];

    const after = await metrics();
    assert.deepEqual(after.period, { start: '2026-10-23', end: '2026-10-29' });
    assert.equal(after.tasks.queued - before.queued, 1);
    assert.equal(after.tasks.inProgress - before.inProgress, 1);
    assert.equal(after.tasks.completed - before.completed, 1); // concluída hoje, dentro do ciclo

    // No ciclo seguinte, a mesma tarefa não conta como concluída; a fila e o andamento seguem.
    const next = await metrics('2026-10-30');
    assert.equal(next.tasks.completed, 0);
    assert.equal(next.tasks.queued - before.queued, 1);

    for (const id of ids) await api('DELETE', `/demands/${id}`);
  });

  it('métricas dos ciclos: última atualização e horas no período', async () => {
    const c = (await api('POST', '/demands', { category: 'ciclo', title: 'Ciclo das métricas' })).data as DemandSummary;
    await api('POST', `/demands/${c.id}/events`, { date: '2026-10-26', kind: 'deploy', text: 'Publicado em staging' });
    const act = await api('POST', '/activities', { ...sample, demandId: c.id, date: '2026-10-28', startMinute: 480, endMinute: 600 });
    today = '2026-10-29';

    const row = (await metrics()).cycles.find((x: { id: number }) => x.id === c.id);
    assert.deepEqual(row.lastUpdate, { date: '2026-10-28', kind: 'apontamento', text: sample.description });
    assert.equal(row.loggedInPeriod, 120);
    assert.equal(row.logged, 120);
    assert.equal(row.idleWorkdays, 1);
    assert.equal(row.stalled, false);

    assert.equal((await api('GET', '/metrics?date=2026-13-01')).status, 400);
    await api('DELETE', `/activities/${act.data.activity.id}`);
    await api('DELETE', `/demands/${c.id}`);
  });
});

describe('API do relatório diário', () => {
  it('reúne o que foi feito, os impedimentos e o que será feito', async () => {
    today = '2026-10-29';
    const cycle = (await api('POST', '/demands', { category: 'ciclo', title: 'Ciclo do relatório', dueDate: '2026-11-06' })).data as DemandSummary;
    const ticket = (await api('POST', '/demands', { category: 'chamado', ticketNumber: 'REL0000001', description: 'Fictício' })).data as DemandSummary;
    const act = await api('POST', '/activities', { ...sample, demandId: cycle.id, date: '2026-10-28', startMinute: 540, endMinute: 660 });
    const meet = await api('POST', '/activities', { ...sample, date: '2026-10-28', startMinute: 480, endMinute: 495 }); // a Daily
    await api('POST', `/demands/${cycle.id}/events`, { date: '2026-10-28', kind: 'decisao', text: 'Escopo fechado' });
    await api('POST', `/demands/${cycle.id}/blockers`, { owner: 'Equipe Exemplo', since: '2026-10-27' });

    // Sem `date`, o relatório é do dia útil anterior a hoje.
    const { status, data: r } = await api('GET', '/reports/daily');
    assert.equal(status, 200);
    assert.equal(r.date, '2026-10-28');
    // Fala de ciclos, tarefas e reuniões; horários e horas apontadas não entram.
    assert.equal('minutes' in r.done, false);
    const item = r.done.cycles.find((i: { demandId: number }) => i.demandId === cycle.id);
    assert.equal(item.label, 'Ciclo do relatório');
    assert.deepEqual(item.progress, [`${sample.description} (${sample.notes})`, 'Decisão: Escopo fechado']);
    assert.deepEqual(
      r.done.meetings.map((m: { label: string }) => m.label),
      ['Daily · Status do dia'],
    );
    assert.equal(r.blockers.open, 1);
    assert.equal(r.blockers.items[0].waitingWorkdays, 2); // ter 27 e qua 28
    assert.equal(r.next.date, '2026-10-29');
    const next = [...r.next.cycles, ...r.next.tasks].map((i: { demandId: number }) => i.demandId);
    assert.ok(next.includes(cycle.id));
    assert.equal(next.includes(ticket.id), false); // não iniciado: só na fila
    assert.ok(r.next.queued >= 1);

    assert.equal((await api('GET', '/reports/daily?date=2026-10-27')).data.date, '2026-10-27');
    assert.equal((await api('GET', '/reports/daily?date=2026-13-01')).status, 400);

    for (const a of [act, meet]) await api('DELETE', `/activities/${a.data.activity.id}`);
    for (const id of [cycle.id, ticket.id]) await api('DELETE', `/demands/${id}`);
  });
});

describe('migração do banco', () => {
  it('cria o histórico de status das demandas existentes, datado pelo último update', () => {
    const db = new DatabaseSync(':memory:');
    migrate(db, 5);
    db.exec(`
      INSERT INTO demands (category, ticket_number, description, status, updated_at)
        VALUES ('chamado', 'MIG0000001', 'Descrição fictícia', 'em_andamento', '2026-10-20 12:00:00');
      INSERT INTO demands (category, title, meeting_type, participants)
        VALUES ('reuniao', 'Assunto', 'Daily', 'Equipe Exemplo');
    `);

    migrate(db);

    assert.deepEqual(createRepo(db).listAllStatusChanges(), [
      { demandId: 1, from: null, to: 'em_andamento', date: '2026-10-20' },
    ]);
  });

  it('remove o status do apontamento e preserva o que não era o padrão nas observações', () => {
    const db = new DatabaseSync(':memory:');
    migrate(db, 4);
    db.exec(`
      INSERT INTO activities (date, start_minute, end_minute, project, notes, status) VALUES
        ('2026-10-26', 480, 525, 'A', '', 'concluido'),
        ('2026-10-26', 540, 600, 'B', '', 'pendente_aprovacao'),
        ('2026-10-26', 600, 660, 'C', 'Resumo enviado', 'nao_concluido');
    `);

    migrate(db);

    const columns = (db.prepare('PRAGMA table_info(activities)').all() as { name: string }[]).map((c) => c.name);
    assert.equal(columns.includes('status'), false);
    const [a, b, c] = createRepo(db).listActivities('2026-10-26', '2026-10-26');
    assert.equal(a.notes, '');
    assert.equal(b.notes, 'Status anterior: Pendente de aprovação.');
    assert.equal(c.notes, 'Resumo enviado\nStatus anterior: Não concluído.');
  });

  it('atualiza um banco da versão inicial sem perder dados', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE activities (
        id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, start_minute INTEGER NOT NULL,
        end_minute INTEGER NOT NULL, project TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '', status TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, CHECK (end_minute > start_minute));
      INSERT INTO activities (date, start_minute, end_minute, project, status)
        VALUES ('2026-10-26', 480, 525, 'Antiga', 'concluido');
    `);

    migrate(db);
    migrate(db); // idempotente

    const version = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
    assert.equal(version, SCHEMA_VERSION);
    const repo = createRepo(db);
    const [row] = repo.listActivities('2026-10-26', '2026-10-26');
    // Apontamentos antigos, sem demanda, são mantidos como estavam.
    assert.equal(row.project, 'Antiga');
    assert.equal(row.demandId, null);
    assert.deepEqual(repo.listDemands(), []);
  });

  it('converte as demandas da v0.2 em ciclos sem perder o vínculo dos apontamentos', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    migrate(db, 2);
    db.exec(`
      INSERT INTO demands (title, target_minutes, start_date, status) VALUES ('Aberta', 600, '2026-10-01', 'ativa');
      INSERT INTO demands (title, description, target_minutes, start_date, status)
        VALUES ('Fechada', 'Escopo combinado', 270, '2026-10-01', 'concluida');
      INSERT INTO activities (date, start_minute, end_minute, project, status, demand_id)
        VALUES ('2026-10-26', 480, 525, 'Vinculada', 'concluido', 1);
    `);

    migrate(db);

    const repo = createRepo(db);
    const [open, closed] = repo.listDemands();
    assert.equal(open.category, 'ciclo');
    assert.equal(open.category === 'ciclo' && open.status, 'em_andamento');
    assert.equal(open.category === 'ciclo' && open.description, 'Versão anterior: meta de 10h.');
    assert.equal(closed.category === 'ciclo' && closed.status, 'concluido');
    assert.equal(closed.category === 'ciclo' && closed.description, 'Escopo combinado\n\nVersão anterior: meta de 4h30.');
    const [act] = repo.listActivities('2026-10-26', '2026-10-26');
    assert.equal(act.demandId, 1); // o DROP das tabelas antigas não apagou o vínculo
    const fk = db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number };
    assert.equal(fk.foreign_keys, 1);
  });

  it('preserva na descrição os campos da v0.4 que deixaram de existir', () => {
    const db = new DatabaseSync(':memory:');
    migrate(db, 3);
    db.exec(`
      INSERT INTO demands (title, external_ids, system, kind, priority, progress_percent, target_minutes,
                           start_date, due_date, status)
        VALUES ('Chamado antigo', '["SCTASK0000001","RITM0000002"]', 'Sistema Exemplo', 'intempestiva', 'alta',
                40, 450, '2026-10-01', '2026-11-01', 'aguardando_terceiro');
      INSERT INTO demands (title, start_date) VALUES ('Sem extras', '2026-10-01');
      INSERT INTO demand_events (demand_id, date, kind, text) VALUES (1, '2026-10-02', 'acao', 'Contato feito');
    `);

    migrate(db);

    const repo = createRepo(db);
    const [old, plain] = repo.listDemands();
    assert.equal(old.category === 'ciclo' && old.kind, 'intempestiva');
    assert.equal(old.category === 'ciclo' && old.dueDate, '2026-11-01');
    assert.equal(
      old.category === 'ciclo' && old.description,
      'Versão anterior: meta de 7h30; progresso de 40%; identificadores SCTASK0000001, RITM0000002; sistema Sistema Exemplo.',
    );
    assert.equal(plain.category === 'ciclo' && plain.description, '');
    assert.equal(repo.listDemandEvents(1).length, 1);
  });
});
