import { fileURLToPath } from 'node:url';
import { createApp } from './app.ts';
import { openDb } from './db.ts';
import { createRepo } from './repo.ts';

const PORT = Number(process.env.PORT ?? 3001);
const DB_PATH = process.env.DB_PATH ?? fileURLToPath(new URL('../data/acompanhamento.db', import.meta.url));
const STATIC_DIR = fileURLToPath(new URL('../../web/dist', import.meta.url));

const repo = createRepo(openDb(DB_PATH));
const app = createApp({ repo, staticDir: STATIC_DIR });

app.listen(PORT, () => {
  console.log(`API pronta em http://localhost:${PORT}  (banco: ${DB_PATH})`);
});
