import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBackupService } from './backup.ts';
import { createApp } from './app.ts';
import { openDb } from './db.ts';
import { createRepo } from './repo.ts';
import { allowedHostsFromEnv } from './security.ts';
import { detectSyncedFolder } from './storage.ts';
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

// Banco ou backups numa pasta do OneDrive (ou outra sincronizada): a tela avisa em Lembretes.
const syncedFolder = detectSyncedFolder(resolve(DB_PATH)) ?? detectSyncedFolder(resolve(BACKUP_DIR));
if (syncedFolder) {
  console.warn(`ATENÇÃO: os dados estão numa pasta do ${syncedFolder}. A sincronização pode corromper o banco; mova o projeto para fora dela.`);
}

const app = createApp({ repo, staticDir: STATIC_DIR, allowedHosts: allowedHostsFromEnv(process.env), backups, syncedFolder });

// O iniciar.cmd / iniciar.sh pede OPEN_BROWSER=1: a tela abre sozinha quando o servidor fica pronto.
const OPEN_BROWSER = process.env.OPEN_BROWSER === '1';
const LOCAL_URL = `http://127.0.0.1:${PORT}`;

function openBrowser(url: string) {
  const [command, args] =
    process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '""', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
  const child = spawn(command, args, { stdio: 'ignore', detached: true, windowsVerbatimArguments: true });
  child.on('error', () => console.log(`Abra ${url} no navegador.`));
  child.unref();
}

// No Express 5 este callback também recebe o erro do listen (tratado no 'error' abaixo).
const server = app.listen(PORT, HOST, (err?: Error) => {
  if (err) return;
  console.log(`API pronta em http://${HOST}:${PORT}  (banco: ${DB_PATH}; backups: ${BACKUP_DIR})`);
  if (HOST !== '127.0.0.1' && HOST !== 'localhost' && HOST !== '::1') {
    console.warn(`ATENÇÃO: escutando em ${HOST}. A API não tem login: quem alcançar esta porta lê e altera os dados.`);
  }
  if (OPEN_BROWSER) {
    openBrowser(LOCAL_URL);
    console.log(`Aplicativo aberto em ${LOCAL_URL}. Feche esta janela para parar o servidor.`);
  }
});

/** A porta responde como este aplicativo (outra janela do iniciar.cmd, por exemplo)? */
async function isThisApp(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/api/backups`, { signal: AbortSignal.timeout(2000) });
    return res.ok && 'keep' in ((await res.json()) as object);
  } catch {
    return false;
  }
}

server.on('error', async (err: NodeJS.ErrnoException) => {
  if (err.code !== 'EADDRINUSE') throw err;
  // Quase sempre é o próprio aplicativo, aberto em outra janela: basta mostrá-lo, sem erro.
  if (await isThisApp(LOCAL_URL)) {
    console.log(`O aplicativo já está aberto em ${LOCAL_URL}.`);
    if (OPEN_BROWSER) openBrowser(LOCAL_URL);
    return;
  }
  console.error(`A porta ${PORT} está em uso por outro programa. Feche-o ou defina outra porta em PORT.`);
  process.exitCode = 1;
});
