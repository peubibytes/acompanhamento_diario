import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { createApp } from '../src/app.ts';
import { createBackupService } from '../src/backup.ts';
import { openDb, SCHEMA_VERSION } from '../src/db.ts';
import { createRepo } from '../src/repo.ts';

const servers: Server[] = [];
const dirs: string[] = [];
after(() => {
  servers.forEach((s) => s.close());
  dirs.forEach((d) => rmSync(d, { recursive: true, force: true }));
});

/** Um app com banco em memória e, opcionalmente, backups numa pasta temporária. */
async function start(withBackups = false) {
  const db = openDb(':memory:');
  let backupDir = '';
  let backups;
  if (withBackups) {
    backupDir = mkdtempSync(join(tmpdir(), 'acomp-transfer-'));
    dirs.push(backupDir);
    backups = createBackupService(db, backupDir, () => '2026-11-01');
  }
  const server = createApp({ repo: createRepo(db), today: () => '2026-11-01', backups }).listen(0);
  servers.push(server);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://localhost:${(server.address() as AddressInfo).port}/api`;
  const api = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(base + path, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, headers: res.headers, data: text ? JSON.parse(text) : null };
  };
  return { api, backupDir };
}

type Api = Awaited<ReturnType<typeof start>>['api'];

/** Dados fictícios que passam por todas as tabelas. */
async function seed(api: Api) {
  const cycle = (await api('POST', '/demands', { category: 'ciclo', title: 'Projeto fictício', startDate: '2026-10-01', dueDate: '2026-11-20' })).data;
  const meeting = (await api('POST', '/demands', { category: 'reuniao', meetingType: 'Daily', participants: 'Equipe Exemplo', subject: 'Status' })).data;
  await api('POST', '/demands', { category: 'chamado', ticketNumber: 'INC0000007', description: 'Chamado fictício', status: 'iniciado' });
  await api('PUT', `/demands/${cycle.id}`, { ...cycle, status: 'em_andamento' });
  const event = (await api('POST', `/demands/${cycle.id}/events`, { date: '2026-10-20', kind: 'decisao', text: 'Escopo definido' })).data;
  await api('PUT', `/demands/${cycle.id}/events/${event.id}/flag`, { flagged: true });
  await api('POST', `/demands/${cycle.id}/blockers`, { owner: 'Equipe Exemplo', since: '2026-10-22', description: 'Aguardando acesso' });
  await api('POST', '/activities', { date: '2026-10-26', startMinute: 480, endMinute: 540, demandId: cycle.id, description: 'Trabalho fictício' });
  await api('POST', '/activities', { date: '2026-10-26', startMinute: 600, endMinute: 630, demandId: meeting.id });
  await api('PUT', '/cycles/2026-10-27/goal', { dailyGoalMinutes: 528 });
}

/** A exportação sem o carimbo de hora, para comparar dois bancos. */
const snapshot = async (api: Api) => {
  const { exportedAt: _ignored, ...rest } = (await api('GET', '/export')).data;
  return rest;
};

describe('exportar e importar', () => {
  it('a exportação traz a versão do esquema, todas as tabelas e vem como arquivo', async () => {
    const { api } = await start();
    await seed(api);
    const res = await api('GET', '/export');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-disposition') ?? '', /attachment; filename="acompanhamento-2026-11-01\.json"/);
    assert.equal(res.data.app, 'acompanhamento-diario');
    assert.equal(res.data.schemaVersion, SCHEMA_VERSION);
    assert.deepEqual(Object.keys(res.data.tables), [
      'settings', 'cycle_goals', 'demands', 'activities', 'demand_events', 'demand_blockers', 'demand_status_changes',
    ]);
    assert.equal(res.data.tables.demands.length, 3);
    assert.equal(res.data.tables.activities.length, 2);
    assert.equal(res.data.tables.demand_events[0].flagged, 1);
    assert.ok(res.data.tables.demand_status_changes.length >= 3);
  });

  it('exportar e importar num banco vazio reproduz o banco, inclusive o que a API deriva', async () => {
    const from = await start();
    await seed(from.api);
    const file = (await from.api('GET', '/export')).data;

    const to = await start();
    const res = await to.api('POST', '/import', file);
    assert.equal(res.status, 200);
    assert.equal(res.data.replaced, false);
    assert.equal(res.data.rows.demands, 3);
    assert.deepEqual(await snapshot(to.api), await snapshot(from.api));
    // O que a API monta em cima dos dados também bate (horas, metas, linha do tempo).
    for (const path of ['/demands', '/cycles/2026-10-27', '/timeline', '/periods/2026-10-27?scale=month', '/metrics?date=2026-10-27']) {
      assert.deepEqual((await to.api('GET', path)).data, (await from.api('GET', path)).data, path);
    }
    // Os próximos ids continuam de onde pararam.
    const next = await to.api('POST', '/demands', { category: 'treinamento', title: 'Curso fictício' });
    assert.equal(next.data.id, 4);
  });

  it('banco com dados: 409 sem confirmação e nada muda', async () => {
    const from = await start();
    await seed(from.api);
    const file = (await from.api('GET', '/export')).data;
    const target = await start();
    await target.api('POST', '/demands', { category: 'treinamento', title: 'Curso que já estava aqui' });
    const before = await snapshot(target.api);

    const res = await target.api('POST', '/import', file);
    assert.equal(res.status, 409);
    assert.match(res.data.error, /replace=true/);
    assert.deepEqual(await snapshot(target.api), before);
  });

  it('com replace=true substitui os dados, depois de guardar um backup do que havia', async () => {
    const from = await start();
    await seed(from.api);
    const file = (await from.api('GET', '/export')).data;

    const target = await start(true);
    await target.api('POST', '/demands', { category: 'treinamento', title: 'Curso que já estava aqui' });
    const res = await target.api('POST', '/import?replace=true', file);
    assert.equal(res.status, 200);
    assert.equal(res.data.replaced, true);
    assert.deepEqual(await snapshot(target.api), await snapshot(from.api));
    const extras = readdirSync(target.backupDir).filter((f) => f.startsWith('pre-importacao-'));
    assert.equal(extras.length, 1);
  });

  it('importação inválida: 400 e o banco fica exatamente como estava (mesmo com replace=true)', async () => {
    const from = await start();
    await seed(from.api);
    const good = (await from.api('GET', '/export')).data;
    const clone = () => structuredClone(good);

    // `content`: só o conteúdo (CHECK, chave estrangeira, duplicidade) é visto depois da checagem de "banco já tem dados".
    const broken: [string, (f: any) => void, RegExp, boolean?][] = [
      ['de outro aplicativo', (f) => (f.app = 'outro'), /não é uma exportação/],
      ['de outro esquema', (f) => (f.schemaVersion = SCHEMA_VERSION - 1), /esquema/],
      ['sem tabela', (f) => delete f.tables.activities, /tabela/],
      ['com tabela desconhecida', (f) => (f.tables.segredos = []), /tabelas/],
      ['com linhas que não são objetos', (f) => (f.tables.demands = [1, 2]), /linha precisa ser um objeto/],
      ['com coluna desconhecida', (f) => (f.tables.demands[0].inventada = 1), /coluna desconhecida "inventada"/],
      ['com nome de coluna malicioso', (f) => (f.tables.demands[0]['id) VALUES (1); DROP TABLE demands; --'] = 1), /coluna desconhecida/],
      ['que viola um CHECK (fim antes do início)', (f) => ((f.tables.activities[1].start_minute = 700), (f.tables.activities[1].end_minute = 600)), /activities, linha 2: viola uma regra/, true],
      ['com apontamento de demanda que não existe', (f) => (f.tables.activities[0].demand_id = 999), /activities, linha 1: aponta para uma demanda/, true],
      ['com chamado repetido', (f) => f.tables.demands.push({ ...f.tables.demands.find((d: any) => d.category === 'chamado'), id: 50 }), /demands, linha 4: valor repetido/, true],
    ];

    const target = await start(true);
    await target.api('POST', '/demands', { category: 'treinamento', title: 'Curso que já estava aqui' });
    const before = await snapshot(target.api);

    for (const [name, mutate, message, content] of broken) {
      const file = clone();
      mutate(file);
      for (const query of ['', '?replace=true']) {
        const res = await target.api('POST', `/import${query}`, file);
        // Sem confirmação, um banco com dados responde 409 antes de olhar o conteúdo das linhas.
        assert.equal(res.status, content && query === '' ? 409 : 400, `${name} ${query}`);
        if (res.status === 400) assert.match(res.data.error, message, `${name} ${query}`);
        assert.deepEqual(await snapshot(target.api), before, `${name} ${query}`);
      }
    }
    // JSON que nem objeto é.
    assert.equal((await target.api('POST', '/import?replace=true', [])).status, 400);
    assert.deepEqual(await snapshot(target.api), before);
  });

  it('a importação aceita arquivos grandes, que as outras rotas recusam', async () => {
    const { api } = await start();
    const file = (await api('GET', '/export')).data;
    const demand = (n: number) => ({
      id: n, category: 'treinamento', title: `Curso fictício ${n}`, description: 'x'.repeat(3000), ticket_number: null,
      meeting_type: null, participants: null, kind: null, priority: null, status: 'nao_iniciado', start_date: null, due_date: null,
      branch: '', pr_url: '', environment: null, created_at: '2026-10-01 10:00:00', updated_at: '2026-10-01 10:00:00',
    });
    file.tables.demands = Array.from({ length: 100 }, (_, i) => demand(i + 1)); // ~300 kb
    file.tables.demand_status_changes = [];
    assert.ok(JSON.stringify(file).length > 200_000);

    assert.equal((await api('POST', '/demands', { category: 'treinamento', title: 'x', description: 'y'.repeat(200_000) })).status, 413);
    const res = await api('POST', '/import', file);
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.equal(res.data.rows.demands, 100);
  });
});

describe('status dos backups', () => {
  it('sem serviço de backup, vem vazio', async () => {
    const { api } = await start();
    assert.deepEqual((await api('GET', '/backups')).data, { last: null, count: 0, keep: 0 });
  });

  it('com o serviço, mostra o último backup diário', async () => {
    const { api, backupDir } = await start(true);
    assert.equal((await api('GET', '/backups')).data.last, null);
    const db = openDb(':memory:');
    createBackupService(db, backupDir, () => '2026-11-01').ensureDaily();
    db.close();
    const status = (await api('GET', '/backups')).data;
    assert.equal(status.count, 1);
    assert.equal(status.last.date, '2026-11-01');
    assert.equal(status.last.file, 'acompanhamento-2026-11-01.db');
    assert.ok(existsSync(join(backupDir, status.last.file)));
  });
});
