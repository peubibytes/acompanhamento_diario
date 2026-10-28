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
    assert.equal(d.status, 'ativa');
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

    const done = await api('PUT', `/demands/${late.id}`, { ...lateBody, status: 'concluida' });
    assert.equal(done.data.metrics.deadline, 'concluida');
    assert.equal(done.data.metrics.reminder, null);

    const titles = async (query: string) =>
      ((await api('GET', `/demands${query}`)).data as DemandSummary[]).map((d) => d.title);
    assert.deepEqual(await titles('?status=ativa'), ['Sem prazo']);
    assert.deepEqual(await titles('?status=concluida'), ['Atrasada']);
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
});
