import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { createBackupService, DAILY_KEEP } from '../src/backup.ts';
import { migrate, openDb, SCHEMA_VERSION } from '../src/db.ts';

const dirs: string[] = [];
const tempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'acomp-backup-'));
  dirs.push(dir);
  return dir;
};
after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

const countRows = (path: string, table: string) => {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    return (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
  } finally {
    db.close();
  }
};

const addTraining = (db: DatabaseSync, title: string) =>
  db.prepare("INSERT INTO demands (category, title, status) VALUES ('treinamento', ?, 'nao_iniciado')").run(title);

describe('backup diário', () => {
  it('cria a cópia do dia, que é um banco válido, e não a sobrescreve no mesmo dia', () => {
    const dir = tempDir();
    const db = openDb(join(tempDir(), 'banco.db'));
    addTraining(db, 'Curso fictício A');
    const service = createBackupService(db, join(dir, 'backups'), () => '2026-11-01');

    const first = service.ensureDaily();
    assert.equal(first?.file, 'acompanhamento-2026-11-01.db');
    assert.equal(countRows(join(dir, 'backups', first!.file), 'demands'), 1);

    // O primeiro do dia vale: o que entra depois não sobrescreve (um banco estragado não apaga o bom).
    addTraining(db, 'Curso fictício B');
    service.ensureDaily();
    assert.equal(countRows(join(dir, 'backups', first!.file), 'demands'), 1);
    assert.deepEqual(readdirSync(join(dir, 'backups')), ['acompanhamento-2026-11-01.db']); // sem .tmp sobrando
    db.close();
  });

  it(`guarda só os ${DAILY_KEEP} mais recentes`, () => {
    const dir = tempDir();
    const db = openDb(':memory:');
    let day = 1;
    const service = createBackupService(db, dir, () => `2026-10-${String(day).padStart(2, '0')}`);
    for (day = 1; day <= 20; day++) service.ensureDaily();
    const files = readdirSync(dir).sort();
    assert.equal(files.length, DAILY_KEEP);
    assert.equal(files[0], 'acompanhamento-2026-10-07.db');
    assert.equal(files.at(-1), 'acompanhamento-2026-10-20.db');
    const status = service.status();
    assert.equal(status.count, DAILY_KEEP);
    assert.equal(status.last?.date, '2026-10-20');
    assert.equal(status.keep, DAILY_KEEP);
    db.close();
  });

  it('sem nenhum backup, o status vem vazio', () => {
    const service = createBackupService(openDb(':memory:'), tempDir(), () => '2026-11-01');
    assert.deepEqual(service.status(), { last: null, count: 0, keep: DAILY_KEEP });
  });

  it('cópias extras ganham nome próprio e só as 5 mais recentes ficam', () => {
    const dir = tempDir();
    const db = openDb(':memory:');
    let minute = 0;
    const service = createBackupService(db, dir, () => '2026-11-01', () => new Date(Date.UTC(2026, 10, 1, 12, minute++, 0)));
    const names = Array.from({ length: 7 }, () => service.createExtra('pre-importacao'));
    assert.match(names[0], /^pre-importacao-20261101-120000\.db$/);
    const left = readdirSync(dir).sort();
    assert.deepEqual(left, names.slice(2).sort());
    assert.equal(service.status().count, 0); // não contam como backup diário
    db.close();
  });

  it('o agendador faz o backup do dia novo e não segura o processo', async () => {
    const dir = tempDir();
    const db = openDb(':memory:');
    let today = '2026-11-01';
    const service = createBackupService(db, dir, () => today);
    service.ensureDaily();
    const errors: unknown[] = [];
    const timer = service.schedule((e) => errors.push(e), 10);
    assert.equal(timer.hasRef(), false);
    today = '2026-11-02';
    await new Promise((resolve) => setTimeout(resolve, 80));
    clearInterval(timer);
    assert.ok(existsSync(join(dir, 'acompanhamento-2026-11-02.db')));
    assert.deepEqual(errors, []);
    db.close();
  });
});

describe('backup antes da migração', () => {
  it('copia o banco na versão antiga antes de migrar', () => {
    const dir = tempDir();
    const path = join(tempDir(), 'banco.db');
    const old = new DatabaseSync(path);
    migrate(old, 3);
    old.exec("INSERT INTO demands (title, target_minutes, start_date) VALUES ('Projeto fictício', 60, '2026-10-01')");
    old.close();

    const backups = join(dir, 'backups');
    const db = openDb(path, { backupDir: backups });
    assert.equal((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version, SCHEMA_VERSION);
    assert.deepEqual(readdirSync(backups), ['pre-migracao-3.db']);
    const copy = new DatabaseSync(join(backups, 'pre-migracao-3.db'), { readOnly: true });
    assert.equal((copy.prepare('PRAGMA user_version').get() as { user_version: number }).user_version, 3);
    assert.equal((copy.prepare('SELECT COUNT(*) AS n FROM demands').get() as { n: number }).n, 1);
    copy.close();
    db.close();
  });

  it('não copia banco novo nem banco já atualizado', () => {
    const backups = join(tempDir(), 'backups');
    const path = join(tempDir(), 'banco.db');
    openDb(path, { backupDir: backups }).close(); // novo (versão 0)
    openDb(path, { backupDir: backups }).close(); // já na última versão
    assert.equal(existsSync(backups), false);
  });
});
