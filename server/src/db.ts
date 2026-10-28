import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * Migrações em ordem. A posição no array é a versão do esquema, guardada em
 * `PRAGMA user_version`; cada uma roda uma única vez, dentro de uma transação.
 * Nunca altere uma migração já publicada: acrescente uma nova ao final.
 */
const MIGRATIONS = [
  // 1 — esquema inicial (IF NOT EXISTS: bancos anteriores ao versionamento já o têm)
  `
  CREATE TABLE IF NOT EXISTS activities (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    date         TEXT    NOT NULL,
    start_minute INTEGER NOT NULL,
    end_minute   INTEGER NOT NULL,
    project      TEXT    NOT NULL,
    description  TEXT    NOT NULL DEFAULT '',
    notes        TEXT    NOT NULL DEFAULT '',
    status       TEXT    NOT NULL CHECK (status IN
                 ('concluido', 'nao_concluido', 'pendente_aprovacao', 'nao_iniciado')),
    created_at   TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (end_minute > start_minute)
  );
  CREATE INDEX IF NOT EXISTS idx_activities_date ON activities(date);

  -- Meta diária congelada por ciclo, para que mudar a meta não reescreva o histórico.
  CREATE TABLE IF NOT EXISTS cycle_goals (
    cycle_start        TEXT PRIMARY KEY,
    daily_goal_minutes INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
  // 2 — demandas de ciclo e vínculo opcional das atividades
  `
  CREATE TABLE demands (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    title          TEXT    NOT NULL,
    description    TEXT    NOT NULL DEFAULT '',
    target_minutes INTEGER NOT NULL CHECK (target_minutes > 0),
    start_date     TEXT    NOT NULL,
    due_date       TEXT,
    status         TEXT    NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'concluida')),
    created_at     TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (due_date IS NULL OR due_date >= start_date)
  );

  ALTER TABLE activities ADD COLUMN demand_id INTEGER REFERENCES demands(id) ON DELETE SET NULL;
  CREATE INDEX idx_activities_demand ON activities(demand_id);
  `,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

export function migrate(db: DatabaseSync): void {
  const { user_version: current } = db.prepare('PRAGMA user_version').get() as { user_version: number };
  for (let version = current; version < MIGRATIONS.length; version++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[version]);
      db.exec(`PRAGMA user_version = ${version + 1}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}

export function openDb(path: string): DatabaseSync {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL;');
  // Necessário para o ON DELETE SET NULL de activities.demand_id.
  db.exec('PRAGMA foreign_keys = ON;');
  migrate(db);
  return db;
}
