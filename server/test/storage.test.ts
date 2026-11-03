import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { detectSyncedFolder } from '../src/storage.ts';

describe('pasta sincronizada', () => {
  it('reconhece as pastas do OneDrive, Dropbox, Google Drive e iCloud pelo nome', () => {
    const cases: [string, string | null][] = [
      ['C:\\Users\\exemplo\\OneDrive\\Projetos\\app\\server\\data\\acompanhamento.db', 'OneDrive'],
      ['C:\\Users\\exemplo\\OneDrive - Empresa Exemplo\\app\\server\\data\\acompanhamento.db', 'OneDrive'],
      ['/Users/exemplo/Dropbox/app/server/data/acompanhamento.db', 'Dropbox'],
      ['G:\\My Drive\\app\\server\\data\\acompanhamento.db', 'Google Drive'],
      ['/Users/exemplo/Library/Mobile Documents/com~apple~CloudDocs/app/acompanhamento.db', 'iCloud Drive'],
      ['C:\\Users\\exemplo\\Repos\\app\\server\\data\\acompanhamento.db', null],
      ['/home/exemplo/onedrive-notas/app/acompanhamento.db', null],
    ];
    for (const [path, expected] of cases) assert.equal(detectSyncedFolder(path, {}), expected, path);
  });

  it('usa a pasta que o OneDrive informa, mesmo com outro nome', () => {
    const env = { OneDriveCommercial: 'D:\\Sincronizado\\' };
    assert.equal(detectSyncedFolder('d:\\sincronizado\\app\\server\\data\\acompanhamento.db', env), 'OneDrive');
    assert.equal(detectSyncedFolder('D:\\Sincronizado-antigo\\app\\acompanhamento.db', env), null);
  });
});
