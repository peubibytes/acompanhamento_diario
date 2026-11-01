// Backups do banco: uma cópia consistente por dia (VACUUM INTO) e cópias extras antes de uma
// migração e antes de substituir os dados numa importação. Ver PLANO, seção "Dados e backup".

import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

/** Quantos backups diários ficam; os mais antigos saem. */
export const DAILY_KEEP = 14;
/** Quantas cópias de segurança de importação ficam. As de migração são poucas e ficam todas. */
const IMPORT_KEEP = 5;

const DAILY = /^acompanhamento-(\d{4}-\d{2}-\d{2})\.db$/;

export interface BackupInfo {
  file: string;
  /** Dia do backup (AAAA-MM-DD, o do nome do arquivo). */
  date: string;
  /** Momento em que o arquivo foi gravado (ISO). */
  at: string;
  sizeBytes: number;
}

export interface BackupStatus {
  last: BackupInfo | null;
  count: number;
  keep: number;
}

/**
 * Copia o banco para `path` com `VACUUM INTO` (cópia consistente, mesmo com o banco em uso e em WAL).
 * Grava num arquivo temporário e renomeia no fim: uma queda no meio não deixa um backup pela metade.
 */
export function copyDatabase(db: DatabaseSync, path: string): void {
  const temp = `${path}.tmp`;
  rmSync(temp, { force: true });
  db.prepare('VACUUM INTO ?').run(temp);
  renameSync(temp, path);
}

export function createBackupService(db: DatabaseSync, dir: string, today: () => string, now = () => new Date()) {
  mkdirSync(dir, { recursive: true });

  const daily = (): BackupInfo[] =>
    readdirSync(dir)
      .flatMap((file) => {
        const match = DAILY.exec(file);
        if (!match) return [];
        const stat = statSync(join(dir, file));
        return [{ file, date: match[1], at: stat.mtime.toISOString(), sizeBytes: stat.size }];
      })
      .sort((a, b) => b.date.localeCompare(a.date));

  /** Apaga os mais antigos de uma família de arquivos (o carimbo no nome ordena por data). */
  const prune = (prefix: string, keep: number) => {
    const files = readdirSync(dir)
      .filter((f) => f.startsWith(`${prefix}-`) && f.endsWith('.db'))
      .sort()
      .reverse();
    for (const f of files.slice(keep)) rmSync(join(dir, f), { force: true });
  };

  return {
    dir,

    /** Cria o backup de hoje se ainda não existir (o primeiro do dia vale: não se sobrescreve) e rotaciona. */
    ensureDaily(): BackupInfo | null {
      const file = `acompanhamento-${today()}.db`;
      if (!existsSync(join(dir, file))) copyDatabase(db, join(dir, file));
      const all = daily();
      for (const old of all.slice(DAILY_KEEP)) rmSync(join(dir, old.file), { force: true });
      return all.find((b) => b.file === file) ?? null;
    },

    /** Cópia extra com nome próprio (`pre-importacao-…`); devolve o nome do arquivo. */
    createExtra(prefix: string): string {
      const stamp = now().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
      const file = `${prefix}-${stamp}.db`;
      copyDatabase(db, join(dir, file));
      prune(prefix, IMPORT_KEEP);
      return file;
    },

    status(): BackupStatus {
      const all = daily();
      return { last: all[0] ?? null, count: all.length, keep: DAILY_KEEP };
    },

    /** Agenda a verificação a cada hora: ao virar o dia, sai o backup do dia novo. Não segura o processo. */
    schedule(onError: (err: unknown) => void, everyMs = 60 * 60 * 1000): NodeJS.Timeout {
      const timer = setInterval(() => {
        try {
          this.ensureDaily();
        } catch (err) {
          onError(err);
        }
      }, everyMs);
      timer.unref();
      return timer;
    },
  };
}

export type BackupService = ReturnType<typeof createBackupService>;

/** Antes de uma migração: guarda o banco como estava (`pre-migracao-N`, com N a versão de origem). */
export function backupBeforeMigration(db: DatabaseSync, dir: string, fromVersion: number): void {
  mkdirSync(dir, { recursive: true });
  const target = join(dir, `pre-migracao-${fromVersion}.db`);
  // Se já existe, é de uma tentativa anterior: o estado original é o que importa guardar.
  if (!existsSync(target)) copyDatabase(db, target);
}
