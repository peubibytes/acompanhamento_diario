import { fileURLToPath } from 'node:url';
import { createApp } from './app.ts';
import { openDb } from './db.ts';
import { createRepo } from './repo.ts';
import { allowedHostsFromEnv } from './security.ts';

const PORT = Number(process.env.PORT ?? 3001);
// Só a própria máquina por padrão. Para expor na rede, defina HOST (e ALLOWED_HOSTS): a API não tem login.
const HOST = process.env.HOST ?? '127.0.0.1';
const DB_PATH = process.env.DB_PATH ?? fileURLToPath(new URL('../data/acompanhamento.db', import.meta.url));
const STATIC_DIR = fileURLToPath(new URL('../../web/dist', import.meta.url));

const repo = createRepo(openDb(DB_PATH));
const app = createApp({ repo, staticDir: STATIC_DIR, allowedHosts: allowedHostsFromEnv(process.env) });

app.listen(PORT, HOST, () => {
  console.log(`API pronta em http://${HOST}:${PORT}  (banco: ${DB_PATH})`);
  if (HOST !== '127.0.0.1' && HOST !== 'localhost' && HOST !== '::1') {
    console.warn(`ATENÇÃO: escutando em ${HOST}. A API não tem login: quem alcançar esta porta lê e altera os dados.`);
  }
});
