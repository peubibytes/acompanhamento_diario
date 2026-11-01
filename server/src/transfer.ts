// Exportação e importação dos dados em JSON: todas as tabelas, com a versão do esquema.
// Genérico de propósito (colunas lidas do próprio banco): uma coluna nova numa migração não exige
// mexer aqui. A validação de forma é do zod; a de conteúdo, dos CHECKs e das chaves estrangeiras do
// SQLite, dentro de uma transação que só confirma se tudo passar.

import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { SCHEMA_VERSION } from './db.ts';

export const EXPORT_APP = 'acompanhamento-diario';

/** Pais antes dos filhos: a ordem de gravação (a de apagar é a inversa). */
export const TABLES = [
  'settings',
  'cycle_goals',
  'demands',
  'activities',
  'demand_events',
  'demand_blockers',
  'demand_status_changes',
] as const;
type Table = (typeof TABLES)[number];

type Cell = string | number | null;
type Row = Record<string, Cell>;

export interface ExportFile {
  app: typeof EXPORT_APP;
  schemaVersion: number;
  exportedAt: string;
  tables: Record<Table, Row[]>;
}

const cell = z.union([z.string(), z.number().finite(), z.null()], { error: 'Os valores precisam ser texto, número ou nulo.' });
const rows = z.array(z.record(z.string(), cell, { error: 'Cada linha precisa ser um objeto de colunas.' }), { error: 'Falta uma tabela, ou ela não é uma lista de linhas.' });

const importSchema = z.object({
  app: z.literal(EXPORT_APP, 'O arquivo não é uma exportação do Acompanhamento Diário.'),
  schemaVersion: z.int('Versão do esquema inválida.'),
  exportedAt: z.string().optional(),
  tables: z.strictObject(
    {
      settings: rows,
      cycle_goals: rows,
      demands: rows,
      activities: rows,
      demand_events: rows,
      demand_blockers: rows,
      demand_status_changes: rows,
    },
    { error: 'O arquivo tem tabelas a mais, a menos ou em formato inválido.' },
  ),
});

/** Erro de dado do usuário (vira 400/409); qualquer outro é falha do servidor. */
export class ImportError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/** A mensagem do SQLite (em inglês) em palavras que o usuário entende. */
function explain(err: unknown): string {
  const text = (err as Error).message ?? String(err);
  if (/FOREIGN KEY/i.test(text)) return 'aponta para uma demanda que não existe.';
  if (/UNIQUE/i.test(text)) return 'valor repetido (por exemplo, um chamado já declarado).';
  if (/NOT NULL/i.test(text)) return 'falta um campo obrigatório.';
  if (/CHECK/i.test(text)) return 'viola uma regra dos dados (por exemplo, um horário de fim antes do início).';
  return 'valor não aceito pelo banco.';
}

export function exportDatabase(db: DatabaseSync, now = new Date()): ExportFile {
  const tables = {} as Record<Table, Row[]>;
  // Lido numa transação só: o arquivo é um retrato único, mesmo com o banco em uso.
  db.exec('BEGIN');
  try {
    for (const t of TABLES) tables[t] = db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all() as Row[];
  } finally {
    db.exec('COMMIT');
  }
  return { app: EXPORT_APP, schemaVersion: SCHEMA_VERSION, exportedAt: now.toISOString(), tables };
}

/** Banco "vazio" para a importação: sem demandas e sem apontamentos (as metas e preferências não contam). */
export function isEmptyDatabase(db: DatabaseSync): boolean {
  const count = (t: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n;
  return count('demands') === 0 && count('activities') === 0;
}

export interface ImportSummary {
  replaced: boolean;
  rows: Record<Table, number>;
}

/**
 * Importa uma exportação. Só em banco vazio, ou com `replace` (que apaga o que existe, depois de a
 * rota ter feito o backup). Tudo numa transação: qualquer problema desfaz e o banco fica como estava.
 */
export function importDatabase(db: DatabaseSync, payload: unknown, replace: boolean): ImportSummary {
  const parsed = importSchema.safeParse(payload);
  if (!parsed.success) throw new ImportError(parsed.error.issues[0]?.message ?? 'Arquivo de importação inválido.');
  const file = parsed.data;
  if (file.schemaVersion !== SCHEMA_VERSION) {
    throw new ImportError(
      `O arquivo é do esquema ${file.schemaVersion} e o aplicativo está no ${SCHEMA_VERSION}. Importe com a mesma versão do aplicativo que gerou o arquivo.`,
    );
  }
  // Só colunas que existem: o nome vai para o SQL, então precisa vir do banco, nunca do arquivo.
  const columns = new Map<Table, Set<string>>();
  for (const t of TABLES) {
    const info = db.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[];
    columns.set(t, new Set(info.map((c) => c.name)));
  }
  for (const t of TABLES) {
    file.tables[t].forEach((row, i) => {
      const keys = Object.keys(row);
      if (keys.length === 0) throw new ImportError(`${t}, linha ${i + 1}: sem colunas.`);
      const unknown = keys.find((k) => !columns.get(t)!.has(k));
      if (unknown) throw new ImportError(`${t}, linha ${i + 1}: coluna desconhecida "${unknown}".`);
    });
  }

  // Depois da forma do arquivo, antes de tocar no banco: dado existente só é substituído com confirmação.
  const empty = isEmptyDatabase(db);
  if (!empty && !replace) {
    throw new ImportError(
      'O banco já tem dados. Para substituí-los, repita com ?replace=true (um backup é feito antes).',
      409,
    );
  }

  const rowsIn = {} as Record<Table, number>;
  db.exec('BEGIN');
  try {
    // Filhos primeiro: apagar demandas antes dos apontamentos os desvincularia (ON DELETE SET NULL).
    for (const t of [...TABLES].reverse()) db.exec(`DELETE FROM ${t}`);
    for (const t of TABLES) {
      for (const [i, row] of file.tables[t].entries()) {
        const keys = Object.keys(row);
        const sql = `INSERT INTO ${t} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`;
        try {
          db.prepare(sql).run(...keys.map((k) => row[k]));
        } catch (err) {
          throw new ImportError(`${t}, linha ${i + 1}: ${explain(err)}`);
        }
      }
      rowsIn[t] = file.tables[t].length;
    }
    if (db.prepare('PRAGMA foreign_key_check').all().length > 0) {
      throw new ImportError('O arquivo tem referências quebradas (um item aponta para uma demanda que não existe).');
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return { replaced: !empty, rows: rowsIn };
}
