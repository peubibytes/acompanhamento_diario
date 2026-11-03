// Onde o banco está gravado. Uma pasta sincronizada (OneDrive, Dropbox…) pode corromper o SQLite, que grava
// em mais de um arquivo ao mesmo tempo (.db, -wal e -shm): a tela avisa em Lembretes. Ver PLANO, seção
// "Dados e backup".

import type { SyncedFolder } from '@acomp/shared';

/** Nome de uma pasta no caminho → serviço que a sincroniza. */
const BY_NAME: [RegExp, SyncedFolder][] = [
  [/^onedrive( - .+)?$/i, 'OneDrive'],
  [/^dropbox( \(.+\))?$/i, 'Dropbox'],
  [/^(google ?drive|my drive|meu drive)$/i, 'Google Drive'],
  [/^(icloud ?drive|mobile documents)$/i, 'iCloud Drive'],
];

/** Variáveis que o OneDrive define no Windows com a pasta que ele sincroniza (útil quando ela foi renomeada). */
const ONEDRIVE_ENV = ['OneDrive', 'OneDriveCommercial', 'OneDriveConsumer'];

const normalize = (path: string) => path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();

/** O serviço que sincroniza a pasta de `path` (um caminho absoluto), ou nulo. */
export function detectSyncedFolder(path: string, env: Record<string, string | undefined> = process.env): SyncedFolder | null {
  const target = normalize(path);
  for (const name of ONEDRIVE_ENV) {
    const root = env[name] && normalize(env[name]);
    if (root && (target === root || target.startsWith(`${root}/`))) return 'OneDrive';
  }
  for (const segment of path.split(/[\\/]/)) {
    const match = BY_NAME.find(([pattern]) => pattern.test(segment));
    if (match) return match[1];
  }
  return null;
}
