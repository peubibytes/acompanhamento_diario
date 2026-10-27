import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { CycleSummary } from '@acomp/shared';
import { createApp } from '../src/app.ts';
import { openDb } from '../src/db.ts';
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
