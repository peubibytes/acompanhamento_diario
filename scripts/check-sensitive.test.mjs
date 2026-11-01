import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { findProblems } from './check-sensitive.mjs';

const check = (path, content = '') => findProblems([{ path, content }]);

// Os valores "reais" são montados na hora: o próprio arquivo de teste não pode acender a varredura.
const REAL = 'SCTASK' + '0123456';
const EMAIL = 'alguem' + '@gmail.com';

describe('varredura anti-vazamento', () => {
  it('barra planilhas, bancos e a pasta de dados', () => {
    for (const path of ['Acompanhamento diário.xlsx', 'dados.xls', 'server/data/acompanhamento.db', 'backup.sqlite', 'x.db-wal', 'export.csv']) {
      assert.equal(check(path).length, 1, path);
    }
    assert.equal(check('server/src/db.ts', 'const x = 1;').length, 0);
  });

  it('aceita os números fictícios do projeto', () => {
    const fake = 'SCTASK0000001 INC0000002 RITM0000002 INC0001 INC9 SCTASK0012345 INC-42';
    assert.deepEqual(check('shared/test/demands.test.ts', fake), []);
  });

  it('barra número de chamado com cara de real, sem imprimir o valor', () => {
    const [problem, ...rest] = check('docs/nota.md', `texto\nchamado ${REAL} aberto`);
    assert.equal(rest.length, 0);
    assert.match(problem, /docs\/nota\.md:2: número de chamado com cara de real/);
    assert.doesNotMatch(problem, /123456/);
    assert.equal(check('x.ts', 'ritm' + '1234567').length, 1);
    assert.equal(check('x.ts', 'REQ' + '9999999').length, 1);
  });

  it('barra e-mails, menos os de exemplo e os de autoria', () => {
    assert.equal(check('README.md', `fale com ${EMAIL}`).length, 1);
    assert.deepEqual(check('README.md', 'ex.: nome@example.com e Claude <noreply@anthropic.com>'), []);
  });

  it('ignora arquivos binários', () => {
    const pdf = Buffer.concat([Buffer.from(`%PDF ${REAL} `), Buffer.from([0, 1, 2])]);
    assert.deepEqual(check('docs/Documentacao-Tecnica.pdf', pdf), []);
  });
});
