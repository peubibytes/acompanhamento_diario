import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
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
`;

export function openDb(path: string): DatabaseSync {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  return db;
}
