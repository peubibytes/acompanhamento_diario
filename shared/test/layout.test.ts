import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { snakeColumns, snakeLayout } from '../src/index.ts';

const place = (count: number, columns: number) => snakeLayout(count, columns).map((c) => [c.row, c.col]);

describe('serpentina', () => {
  it('vai para a direita, desce e volta para a esquerda', () => {
    assert.deepEqual(place(7, 3), [
      [0, 0], [0, 1], [0, 2], // esquerda → direita
      [1, 2], [1, 1], [1, 0], // desceu e volta: direita → esquerda
      [2, 0], // desceu e vai para a direita de novo
    ]);
  });

  it('as curvas ficam no fim de cada linha, do lado em que ela termina', () => {
    const cells = snakeLayout(7, 3);
    assert.deepEqual(
      cells.map((c) => c.turn),
      [null, null, 'right', null, null, 'left', null],
    );
    assert.deepEqual(cells.map((c) => c.direction), ['ltr', 'ltr', 'ltr', 'rtl', 'rtl', 'rtl', 'ltr']);
  });

  it('linhas de ligação: o primeiro da linha não recebe, o último da linha ou da sequência não envia', () => {
    const cells = snakeLayout(5, 3);
    assert.deepEqual(cells.map((c) => [c.hasIncoming, c.hasOutgoing]), [
      [false, true], // abre a linha
      [true, true],
      [true, false], // fecha a linha: dali a curva desce
      [false, true], // abre a linha de volta (a curva já o ligou ao anterior)
      [true, false], // fim da sequência
    ]);
  });

  it('um nó, uma linha exata, uma coluna', () => {
    assert.deepEqual(place(1, 4), [[0, 0]]);
    assert.equal(snakeLayout(1, 4)[0].hasOutgoing, false);
    assert.deepEqual(place(3, 3), [[0, 0], [0, 1], [0, 2]]);
    assert.equal(snakeLayout(3, 3)[2].turn, null); // fim da sequência: sem curva
    assert.deepEqual(place(3, 1), [[0, 0], [1, 0], [2, 0]]);
    assert.deepEqual(snakeLayout(0, 3), []);
  });

  it('colunas pela largura, entre 2 e 8', () => {
    assert.equal(snakeColumns(0), 2);
    assert.equal(snakeColumns(288), 2); // celular de 320 px
    assert.equal(snakeColumns(448), 4);
    assert.equal(snakeColumns(5000), 8);
    assert.equal(snakeColumns(300, 100, 1, 8), 3);
    assert.equal(snakeColumns(10, 100, 1, 8), 1);
  });
});
