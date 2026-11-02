import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBackupService } from './backup.ts';
import { createApp } from './app.ts';
import { openDb } from './db.ts';
import { createRepo } from './repo.ts';
import { allowedHostsFromEnv } from './security.ts';
import { todayISO } from '@acomp/shared';

const PORT = Number(process.env.PORT ?? 3001);
// Só a própria máquina por padrão. Para expor na rede, defina HOST (e ALLOWED_HOSTS): a API não tem login.
const HOST = process.env.HOST ?? '127.0.0.1';
const DB_PATH = process.env.DB_PATH ?? fileURLToPath(new URL('../data/acompanhamento.db', import.meta.url));
const STATIC_DIR = fileURLToPath(new URL('../../web/dist', import.meta.url));

// Backups ao lado do banco (BACKUP_DIR muda o lugar). Antes de uma migração, openDb guarda uma cópia.
const BACKUP_DIR = process.env.BACKUP_DIR ?? join(dirname(DB_PATH), 'backups');
const db = openDb(DB_PATH, { backupDir: BACKUP_DIR });
const repo = createRepo(db);

// Um backup por dia: um ao iniciar e outro quando o dia virar, enquanto o servidor roda.
const backups = createBackupService(db, BACKUP_DIR, () => todayISO());
const backupFailed = (err: unknown) => console.error('Falha ao fazer o backup diário:', err);
try {
  backups.ensureDaily();
} catch (err) {
  backupFailed(err);
}
backups.schedule(backupFailed);

const app = createApp({ repo, staticDir: STATIC_DIR, allowedHosts: allowedHostsFromEnv(process.env), backups });

app.listen(PORT, HOST, () => {
  console.log(`API pronta em http://${HOST}:${PORT}  (banco: ${DB_PATH}; backups: ${BACKUP_DIR})`);
  if (HOST !== '127.0.0.1' && HOST !== 'localhost' && HOST !== '::1') {
    console.warn(`ATENÇÃO: escutando em ${HOST}. A API não tem login: quem alcançar esta porta lê e altera os dados.`);
  }
});
