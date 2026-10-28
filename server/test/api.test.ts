import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { after, before, beforeEach, describe, it } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import type { CycleSummary, DemandSummary } from '@acomp/shared';
import { createApp } from '../src/app.ts';
import { migrate, openDb, SCHEMA_VERSION } from '../src/db.ts';
import { createRepo } from '../src/repo.ts';

let server: Server;
let base = '';
let today = '2026-10-27'; // terça-feira, ciclo 23/10 → 29/10

before(async () => {
  const repo = createRepo(openDb(':memory:'));
  server = createApp({ repo, today: () => today }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://localhost:${(server.address() as AddressInfo).port}/api`;
});

after(() => server.close());

beforeEach(() => {
  today = '2026-10-27';
});

async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(base + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
}

const sample = {
  date: '2026-10-26',
  startMinute: 480,
  endMinute: 525,
  project: 'Projeto Exemplo',
  description: 'Leitura da documentação',
  notes: 'Resumo enviado',
  status: 'concluido',
};

describe('API de atividades e ciclos', () => {
  it('cria, lista, edita e remove uma atividade', async () => {
    const created = await api('POST', '/activities', sample);
    assert.equal(created.status, 201);
    assert.deepEqual(created.data.warnings, []);
    const id = created.data.activity.id;

    const list = await api('GET', '/activities?date=2026-10-26');
    assert.equal(list.data.length, 1);
    assert.equal(list.data[0].project, 'Projeto Exemplo');

    const edited = await api('PUT', `/activities/${id}`, { ...sample, status: 'pendente_aprovacao' });
    assert.equal(edited.status, 200);
    assert.equal(edited.data.activity.status, 'pendente_aprovacao');

    assert.equal((await api('DELETE', `/activities/${id}`)).status, 204);
    assert.equal((await api('DELETE', `/activities/${id}`)).status, 404);
  });

  it('valida horários, dias úteis, status e projeto', async () => {
    const cases: [object, RegExp][] = [
      [{ ...sample, endMinute: 480 }, /fim deve ser depois/],
      [{ ...sample, date: '2026-10-24' }, /dias úteis/],
      [{ ...sample, date: '2026-13-01' }, /Data inválida/],
      [{ ...sample, status: 'em_andamento' }, /Status inválido/],
      [{ ...sample, project: '  ' }, /projeto/],
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
    assert.match(second.data.warnings[0], /09:00–10:00/);

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
    // Ciclo passado com atividade, ainda seguindo a meta padrão (5h30).
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

describe('API de demandas', () => {
  const demandBody = { title: 'Migração de relatórios', targetMinutes: 600, dueDate: '2026-10-29' };

  it('cria, vincula atividades e calcula horas, prazo e lembrete', async () => {
    const created = await api('POST', '/demands', demandBody);
    assert.equal(created.status, 201);
    const d = created.data as DemandSummary;
    assert.equal(d.startDate, '2026-10-27'); // padrão: hoje
    assert.equal(d.status, 'novo');
    assert.equal(d.metrics.progress, 'nao_iniciada');

    const link = { ...sample, demandId: d.id };
    const acts = [
      await api('POST', '/activities', { ...link, date: '2026-10-26', startMinute: 480, endMinute: 720 }),
      await api('POST', '/activities', { ...link, date: '2026-10-27', startMinute: 540, endMinute: 660 }),
      await api('POST', '/activities', { ...link, date: '2026-10-27', startMinute: 600, endMinute: 720 }),
    ];
    assert.equal(acts[0].data.activity.demandId, d.id);

    const { data: detail } = await api('GET', `/demands/${d.id}`);
    assert.equal(detail.metrics.logged, 420); // 4h + união(09–11, 10–12) = 3h
    assert.equal(detail.metrics.remaining, 180);
    assert.equal(detail.metrics.percent, 70);
    assert.equal(detail.metrics.deadline, 'proxima');
    assert.match(detail.metrics.reminder, /^Vence em 2 dias úteis \(29\/10\)\. Faltam 3h/);
    assert.equal(detail.activities.length, 3);
    assert.equal(detail.activities[0].date, '2026-10-27'); // mais recentes primeiro

    for (const r of acts) await api('DELETE', `/activities/${r.data.activity.id}`);
    await api('DELETE', `/demands/${d.id}`);
  });

  it('valida título, meta, prazo e vínculo inexistente', async () => {
    const cases: [object, RegExp][] = [
      [{ ...demandBody, title: ' ' }, /título/],
      [{ ...demandBody, targetMinutes: 0 }, /maior que zero/],
      [{ ...demandBody, targetMinutes: 1000 * 60 }, /999h59/],
      [{ ...demandBody, startDate: '2026-10-30', dueDate: '2026-10-29' }, /anterior ao início/],
      [{ ...demandBody, status: 'pausada' }, /Status inválido/],
    ];
    for (const [body, message] of cases) {
      const res = await api('POST', '/demands', body);
      assert.equal(res.status, 400);
      assert.match(res.data.error, message);
    }
    const res = await api('POST', '/activities', { ...sample, demandId: 9999 });
    assert.equal(res.status, 400);
    assert.match(res.data.error, /Demanda não encontrada/);
  });

  it('edita, conclui, filtra por status e ordena por urgência', async () => {
    const lateBody = { ...demandBody, title: 'Atrasada', startDate: '2026-10-01', dueDate: '2026-10-20' };
    const late = (await api('POST', '/demands', lateBody)).data;
    const free = (await api('POST', '/demands', { ...demandBody, title: 'Sem prazo', dueDate: null })).data;

    const list = (await api('GET', '/demands')).data as DemandSummary[];
    assert.deepEqual(
      list.map((d) => d.title),
      ['Atrasada', 'Sem prazo'],
    );
    assert.equal(list[0].metrics.deadline, 'atrasada');

    const done = await api('PUT', `/demands/${late.id}`, { ...lateBody, status: 'concluido' });
    assert.equal(done.data.metrics.deadline, 'concluida');
    assert.equal(done.data.metrics.reminder, null);

    const titles = async (query: string) =>
      ((await api('GET', `/demands${query}`)).data as DemandSummary[]).map((d) => d.title);
    assert.deepEqual(await titles('?status=abertas'), ['Sem prazo']);
    assert.deepEqual(await titles('?status=concluido'), ['Atrasada']);
    assert.equal((await api('GET', '/demands?status=xyz')).status, 400);

    // Sem startDate no corpo, a edição mantém a data de início original.
    const edited = await api('PUT', `/demands/${free.id}`, { ...demandBody, title: 'Renomeada', dueDate: null });
    assert.equal(edited.data.startDate, free.startDate);
    assert.equal((await api('PUT', '/demands/9999', demandBody)).status, 404);

    for (const d of [late, free]) await api('DELETE', `/demands/${d.id}`);
  });

  it('excluir a demanda mantém as atividades, sem vínculo', async () => {
    const d = (await api('POST', '/demands', demandBody)).data;
    const act = (await api('POST', '/activities', { ...sample, date: '2026-11-03', demandId: d.id })).data.activity;

    assert.equal((await api('DELETE', `/demands/${d.id}`)).status, 204);
    assert.equal((await api('DELETE', `/demands/${d.id}`)).status, 404);
    const [kept] = (await api('GET', '/activities?date=2026-11-03')).data;
    assert.equal(kept.id, act.id);
    assert.equal(kept.demandId, null);
    await api('DELETE', `/activities/${act.id}`);
  });
});

describe('API de demandas como chamados', () => {
  const ticket = {
    title: 'Ajuste no relatório de vendas',
    externalIds: ['sctask0000001', ' RITM0000002 ', 'SCTASK0000001'],
    system: 'Sistema Exemplo',
    kind: 'intempestiva',
    priority: 'alta',
    progressPercent: 40,
    targetMinutes: null,
    dueDate: '2026-11-06',
    status: 'em_andamento',
    branch: 'feature/ajuste-relatorio',
    prUrl: 'https://exemplo.invalid/pr/1',
    environment: 'staging',
  };

  it('grava os campos de chamado e aceita demanda sem meta de horas', async () => {
    const created = await api('POST', '/demands', ticket);
    assert.equal(created.status, 201);
    const d = created.data as DemandSummary;
    assert.deepEqual(d.externalIds, ['SCTASK0000001', 'RITM0000002']);
    assert.equal(d.kind, 'intempestiva');
    assert.equal(d.priority, 'alta');
    assert.equal(d.progressPercent, 40);
    assert.equal(d.targetMinutes, null);
    assert.equal(d.metrics.target, null);
    assert.equal(d.environment, 'staging');
    assert.deepEqual(d.tracking, { eventCount: 0, lastEventDate: null, openBlockers: 0, waitingWorkdays: 0 });

    // Só com o essencial, os campos novos recebem os padrões.
    const minimal = (await api('POST', '/demands', { title: 'Mínima' })).data as DemandSummary;
    assert.equal(minimal.kind, 'planejada');
    assert.equal(minimal.priority, 'media');
    assert.deepEqual(minimal.externalIds, []);

    for (const x of [d, minimal]) await api('DELETE', `/demands/${x.id}`);
  });

  it('valida identificadores, progresso, PR e ambiente', async () => {
    const cases: [object, RegExp][] = [
      [{ ...ticket, externalIds: ['com espaço'] }, /Identificador externo inválido/],
      [{ ...ticket, progressPercent: 101 }, /entre 0 e 100/],
      [{ ...ticket, prUrl: 'pr-1' }, /Link do PR inválido/],
      [{ ...ticket, environment: 'qa' }, /Ambiente inválido/],
      [{ ...ticket, kind: 'urgente' }, /Tipo inválido/],
    ];
    for (const [body, message] of cases) {
      const res = await api('POST', '/demands', body);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.match(res.data.error, message);
    }
  });

  it('registra linha do tempo e impedimentos, separando a espera', async () => {
    const d = (await api('POST', '/demands', ticket)).data as DemandSummary;

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
    assert.deepEqual(detail.tracking, { eventCount: 2, lastEventDate: '2026-10-27', openBlockers: 1, waitingWorkdays: 2 });

    await api('PUT', `/demands/${d.id}/blockers/${b.data.id}`, { ...b.data, resolvedAt: '2026-10-26' });
    detail = (await api('GET', `/demands/${d.id}`)).data;
    assert.equal(detail.tracking.openBlockers, 0);
    assert.equal(detail.tracking.waitingWorkdays, 1);

    // Itens de outra demanda ou inexistentes não são encontrados.
    assert.equal((await api('PUT', `/demands/${d.id}/events/9999`, { text: 'x' })).status, 404);
    assert.equal((await api('POST', '/demands/9999/events', { text: 'x' })).status, 404);
    assert.equal((await api('DELETE', `/demands/${d.id}/events/${e2.data.id}`)).status, 204);
    assert.equal((await api('DELETE', `/demands/${d.id}/events/${e2.data.id}`)).status, 404);

    // Excluir a demanda leva junto a linha do tempo e os impedimentos.
    await api('DELETE', `/demands/${d.id}`);
    const again = (await api('POST', '/demands', ticket)).data as DemandSummary;
    assert.deepEqual(again.tracking, { eventCount: 0, lastEventDate: null, openBlockers: 0, waitingWorkdays: 0 });
    await api('DELETE', `/demands/${again.id}`);
  });
});

describe('migração do banco', () => {
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
    assert.equal(row.project, 'Antiga');
    assert.equal(row.demandId, null);
    assert.deepEqual(repo.listDemands(), []);
  });

  it('converte as demandas da v0.2 em chamados sem perder o vínculo das atividades', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    migrate(db);
    // Volta o esquema de demandas para o da versão 2 e grava dados nele.
    db.exec(`
      PRAGMA foreign_keys = OFF;
      DROP TABLE demand_events; DROP TABLE demand_blockers; DROP TABLE demands;
      CREATE TABLE demands (
        id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
        target_minutes INTEGER NOT NULL CHECK (target_minutes > 0), start_date TEXT NOT NULL, due_date TEXT,
        status TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'concluida')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
      PRAGMA foreign_keys = ON;
      INSERT INTO demands (title, target_minutes, start_date, status) VALUES ('Aberta', 600, '2026-10-01', 'ativa');
      INSERT INTO demands (title, target_minutes, start_date, status) VALUES ('Fechada', 300, '2026-10-01', 'concluida');
      INSERT INTO activities (date, start_minute, end_minute, project, status, demand_id)
        VALUES ('2026-10-26', 480, 525, 'Vinculada', 'concluido', 1);
      PRAGMA user_version = 2;
    `);

    migrate(db);

    const repo = createRepo(db);
    const [open, closed] = repo.listDemands();
    assert.equal(open.status, 'em_andamento');
    assert.equal(open.targetMinutes, 600);
    assert.equal(open.kind, 'planejada');
    assert.equal(closed.status, 'concluido');
    assert.equal(closed.progressPercent, 100);
    const [act] = repo.listActivities('2026-10-26', '2026-10-26');
    assert.equal(act.demandId, 1); // o DROP da tabela antiga não apagou o vínculo
    const fk = db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number };
    assert.equal(fk.foreign_keys, 1);
  });
});
