import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { isSupported, minimumNode, needsInstall } from './start-local.mjs';

const dir = mkdtempSync(join(tmpdir(), 'acomp-iniciar-'));
after(() => rmSync(dir, { recursive: true, force: true }));

describe('início com dois cliques', () => {
  it('lê a versão mínima do engines e compara com a do Node', () => {
    assert.deepEqual(minimumNode('>=23.6'), [23, 6]);
    assert.deepEqual(minimumNode('>=26'), [26, 0]);
    assert.equal(isSupported('v23.6.0', [23, 6]), true);
    assert.equal(isSupported('v26.1.0', [23, 6]), true);
    assert.equal(isSupported('v23.5.9', [23, 6]), false);
    assert.equal(isSupported('v22.12.0', [23, 6]), false);
  });

  it('instala sem node_modules ou com o package-lock.json mais novo que a instalação', () => {
    writeFileSync(join(dir, 'package-lock.json'), '{}');
    assert.equal(needsInstall(dir), true);

    mkdirSync(join(dir, 'node_modules'));
    const installed = join(dir, 'node_modules', '.package-lock.json');
    writeFileSync(installed, '{}');
    utimesSync(join(dir, 'package-lock.json'), new Date('2026-10-01'), new Date('2026-10-01'));
    utimesSync(installed, new Date('2026-10-02'), new Date('2026-10-02'));
    assert.equal(needsInstall(dir), false);

    utimesSync(join(dir, 'package-lock.json'), new Date('2026-10-03'), new Date('2026-10-03'));
    assert.equal(needsInstall(dir), true);
  });
});
