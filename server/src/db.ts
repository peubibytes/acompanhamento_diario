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
  // 3 — demandas viram chamados (docs/decisions/0001): campos novos, meta de horas opcional,
  // status em 6 estados, linha do tempo e impedimentos. O SQLite não altera CHECK/NOT NULL,
  // então a tabela é recriada com o mesmo nome (chaves estrangeiras desligadas em migrate()).
  `
  CREATE TABLE demands_v3 (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    title            TEXT    NOT NULL,
    description      TEXT    NOT NULL DEFAULT '',
    external_ids     TEXT    NOT NULL DEFAULT '[]',
    system           TEXT    NOT NULL DEFAULT '',
    kind             TEXT    NOT NULL DEFAULT 'planejada'
                     CHECK (kind IN ('planejada', 'intempestiva', 'preventiva')),
    priority         TEXT    NOT NULL DEFAULT 'media' CHECK (priority IN ('baixa', 'media', 'alta', 'urgente')),
    progress_percent INTEGER NOT NULL DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
    target_minutes   INTEGER CHECK (target_minutes IS NULL OR target_minutes > 0),
    start_date       TEXT    NOT NULL,
    due_date         TEXT,
    status           TEXT    NOT NULL DEFAULT 'novo' CHECK (status IN
                     ('novo', 'em_andamento', 'aguardando_terceiro', 'em_homologacao', 'concluido', 'cancelado')),
    branch           TEXT    NOT NULL DEFAULT '',
    pr_url           TEXT    NOT NULL DEFAULT '',
    environment      TEXT    CHECK (environment IS NULL OR environment IN ('desenvolvimento', 'staging', 'producao')),
    created_at       TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (due_date IS NULL OR due_date >= start_date)
  );

  INSERT INTO demands_v3 (id, title, description, target_minutes, start_date, due_date, status,
                          progress_percent, created_at, updated_at)
  SELECT id, title, description, target_minutes, start_date, due_date,
         CASE status WHEN 'concluida' THEN 'concluido' ELSE 'em_andamento' END,
         CASE status WHEN 'concluida' THEN 100 ELSE 0 END,
         created_at, updated_at
  FROM demands;

  DROP TABLE demands;
  ALTER TABLE demands_v3 RENAME TO demands;

  CREATE TABLE demand_events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    demand_id  INTEGER NOT NULL REFERENCES demands(id) ON DELETE CASCADE,
    date       TEXT    NOT NULL,
    kind       TEXT    NOT NULL CHECK (kind IN ('acao', 'decisao', 'impedimento', 'validacao', 'deploy')),
    text       TEXT    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX idx_demand_events_demand ON demand_events(demand_id, date);

  CREATE TABLE demand_blockers (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    demand_id   INTEGER NOT NULL REFERENCES demands(id) ON DELETE CASCADE,
    owner       TEXT    NOT NULL,
    description TEXT    NOT NULL DEFAULT '',
    since       TEXT    NOT NULL,
    resolved_at TEXT,
    created_at  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (resolved_at IS NULL OR resolved_at >= since)
  );
  CREATE INDEX idx_demand_blockers_demand ON demand_blockers(demand_id);
  `,
  // 4 — demandas declaradas (docs/decisions/0002): quatro tipos (ciclo, chamado, reunião,
  // treinamento) e nenhuma declaração de horas. As demandas existentes viram ciclos; a meta de
  // horas, o progresso, os identificadores e o sistema da v0.4, quando preenchidos, são
  // preservados no fim da descrição. A tabela é recriada com o mesmo nome.
  `
  CREATE TABLE demands_v4 (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    category      TEXT    NOT NULL CHECK (category IN ('ciclo', 'chamado', 'reuniao', 'treinamento')),
    title         TEXT    NOT NULL DEFAULT '', -- ciclo: nome do projeto · treinamento: nome · reunião: assunto
    description   TEXT    NOT NULL DEFAULT '',
    ticket_number TEXT,                        -- chamado
    meeting_type  TEXT,                        -- reunião
    participants  TEXT,                        -- reunião: com quem
    kind          TEXT    CHECK (kind IS NULL OR kind IN ('planejada', 'intempestiva', 'preventiva')),
    priority      TEXT    CHECK (priority IS NULL OR priority IN ('baixa', 'media', 'alta', 'urgente')),
    status        TEXT,
    start_date    TEXT,
    due_date      TEXT,
    branch        TEXT    NOT NULL DEFAULT '',
    pr_url        TEXT    NOT NULL DEFAULT '',
    environment   TEXT    CHECK (environment IS NULL OR environment IN ('desenvolvimento', 'staging', 'producao')),
    created_at    TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (due_date IS NULL OR start_date IS NULL OR due_date >= start_date),
    CHECK (category <> 'ciclo' OR (
      title <> '' AND kind IS NOT NULL AND priority IS NOT NULL AND start_date IS NOT NULL AND status IN
      ('novo', 'em_andamento', 'aguardando_terceiro', 'em_homologacao', 'concluido', 'cancelado'))),
    CHECK (category <> 'chamado' OR (
      ticket_number IS NOT NULL AND status IN ('nao_iniciado', 'iniciado', 'em_andamento', 'concluido'))),
    CHECK (category <> 'reuniao' OR (meeting_type IS NOT NULL AND participants IS NOT NULL AND title <> '')),
    CHECK (category <> 'treinamento' OR (
      title <> '' AND status IN ('nao_iniciado', 'iniciado', 'em_andamento', 'concluido')))
  );

  INSERT INTO demands_v4 (id, category, title, description, kind, priority, status, start_date, due_date,
                          branch, pr_url, environment, created_at, updated_at)
  SELECT id, 'ciclo', title,
         CASE WHEN legacy = '' THEN description
              WHEN description = '' THEN 'Versão anterior: ' || legacy || '.'
              ELSE description || char(10) || char(10) || 'Versão anterior: ' || legacy || '.' END,
         kind, priority, status, start_date, due_date, branch, pr_url, environment, created_at, updated_at
  FROM (
    SELECT d.*, rtrim(
             CASE WHEN d.target_minutes IS NULL THEN ''
                  ELSE 'meta de ' || (d.target_minutes / 60) || 'h'
                       || CASE WHEN d.target_minutes % 60 > 0 THEN printf('%02d', d.target_minutes % 60) ELSE '' END
                       || '; ' END
             || CASE WHEN d.progress_percent BETWEEN 1 AND 99 THEN 'progresso de ' || d.progress_percent || '%; ' ELSE '' END
             || CASE WHEN d.external_ids = '[]' THEN ''
                     ELSE 'identificadores ' || (SELECT group_concat(value, ', ') FROM json_each(d.external_ids)) || '; ' END
             || CASE WHEN d.system = '' THEN '' ELSE 'sistema ' || d.system || '; ' END,
           '; ') AS legacy
    FROM demands d
  );

  DROP TABLE demands;
  ALTER TABLE demands_v4 RENAME TO demands;
  CREATE UNIQUE INDEX idx_demands_ticket ON demands(ticket_number) WHERE category = 'chamado';
  `,
  // 5 — o status passa a existir só na demanda (docs/decisions/0003). Os status do apontamento
  // diferentes de 'Concluído' (o padrão do formulário) são preservados no fim das observações.
  `
  UPDATE activities
  SET notes = CASE WHEN notes = '' THEN '' ELSE notes || char(10) END
              || 'Status anterior: ' || CASE status
                   WHEN 'nao_concluido' THEN 'Não concluído'
                   WHEN 'pendente_aprovacao' THEN 'Pendente de aprovação'
                   ELSE 'Não iniciado' END || '.'
  WHERE status <> 'concluido';

  ALTER TABLE activities DROP COLUMN status;
  `,
  // 6 — histórico de status das demandas (docs/decisions/0003): uma linha por troca, com a data.
  // Cada demanda existente ganha a linha do status atual, datada pelo último update (aproximação,
  // em UTC): é o melhor que se sabe de quando ela chegou até aqui.
  `
  CREATE TABLE demand_status_changes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    demand_id   INTEGER NOT NULL REFERENCES demands(id) ON DELETE CASCADE,
    from_status TEXT,
    to_status   TEXT    NOT NULL,
    changed_at  TEXT    NOT NULL,
    created_at  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX idx_demand_status_changes_demand ON demand_status_changes(demand_id, changed_at);

  INSERT INTO demand_status_changes (demand_id, from_status, to_status, changed_at)
  SELECT id, NULL, status, substr(updated_at, 1, 10) FROM demands WHERE status IS NOT NULL;
  `,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

/** Aplica as migrações pendentes até `target` (padrão: a última; os testes usam versões intermediárias). */
export function migrate(db: DatabaseSync, target = MIGRATIONS.length): void {
  const { user_version: current } = db.prepare('PRAGMA user_version').get() as { user_version: number };
  if (current >= target) return;

  // Recriar uma tabela (DROP + RENAME) com as chaves estrangeiras ligadas dispararia o
  // ON DELETE das tabelas filhas. Elas ficam desligadas durante as migrações (o PRAGMA não
  // tem efeito dentro de transação) e a integridade é conferida antes de cada COMMIT.
  const { foreign_keys: fkOn } = db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number };
  db.exec('PRAGMA foreign_keys = OFF');
  try {
    for (let version = current; version < target; version++) {
      db.exec('BEGIN');
      try {
        db.exec(MIGRATIONS[version]);
        if (db.prepare('PRAGMA foreign_key_check').all().length > 0) {
          throw new Error(`Migração ${version + 1} deixou referências inválidas.`);
        }
        db.exec(`PRAGMA user_version = ${version + 1}`);
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    }
  } finally {
    if (fkOn) db.exec('PRAGMA foreign_keys = ON');
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
