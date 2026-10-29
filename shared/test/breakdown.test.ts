import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dayBreakdown, foldSlices, parseHM } from '../src/index.ts';

const demands = [
  { id: 1, label: 'Migração dos relatórios' },
  { id: 2, label: 'Documentação da API' },
];

const act = (start: string, end: string, demandId: number | null, project = 'Projeto') => ({
  date: '2026-10-26',
  startMinute: parseHM(start)!,
  endMinute: parseHM(end)!,
  project,
  demandId,
});

describe('distribuição do dia por demanda', () => {
  it('agrupa por demanda e, sem vínculo, pelo projeto', () => {
    const b = dayBreakdown(
      [
        act('08:00', '10:00', 1),
        act('10:00', '11:00', 1),
        act('11:00', '12:00', 2),
        act('13:00', '14:30', null, 'Suporte'),
        act('14:30', '15:00', null, ' suporte '),
      ],
      demands,
    );
    assert.equal(b.total, 360);
    assert.deepEqual(
      b.slices.map((s) => [s.label, s.kind, s.minutes, s.activityCount]),
      [
        ['Migração dos relatórios', 'demanda', 180, 2],
        ['Suporte', 'projeto', 120, 2],
        ['Documentação da API', 'demanda', 60, 1],
      ],
    );
    assert.equal(b.slices[0].share, 50);
    assert.equal(b.overlapSplit, false);
  });

  it('divide o trecho sobreposto e mantém a soma igual ao total do dia', () => {
    // 08–12 (demanda 1) e 11–13 (demanda 2): 11–12 é dividido meio a meio.
    const b = dayBreakdown([act('08:00', '12:00', 1), act('11:00', '13:00', 2)], demands);
    assert.equal(b.total, 300);
    assert.deepEqual(
      b.slices.map((s) => s.minutes),
      [210, 90],
    );
    assert.equal(b.overlapSplit, true);
  });

  it('arredonda para minutos inteiros sem perder nem sobrar minutos', () => {
    // Três atividades simultâneas em 10 min: 3,33 min para cada.
    const b = dayBreakdown(
      [act('08:00', '08:10', 1), act('08:00', '08:10', 2), act('08:00', '08:10', null, 'Suporte')],
      demands,
    );
    assert.equal(b.total, 10);
    assert.equal(
      b.slices.reduce((s, x) => s + x.minutes, 0),
      10,
    );
  });

  it('demanda excluída cai no agrupamento por projeto', () => {
    const b = dayBreakdown([act('08:00', '09:00', 99, 'Legado')], demands);
    assert.equal(b.slices[0].kind, 'projeto');
    assert.equal(b.slices[0].label, 'Legado');
  });

  it('dia sem atividades', () => {
    assert.deepEqual(dayBreakdown([], demands), { total: 0, slices: [], overlapSplit: false });
  });

  it('junta o excedente em "Outros" a partir da 6ª fatia', () => {
    const many = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((p, i) =>
      act(`${String(8 + i).padStart(2, '0')}:00`, `${String(8 + i).padStart(2, '0')}:${String(50 - i * 5)}`, null, p),
    );
    const folded = foldSlices(dayBreakdown(many, demands).slices);
    assert.equal(folded.length, 6);
    assert.equal(folded[5].label, 'Outros (2)');
    assert.equal(folded[5].kind, 'outros');
    assert.equal(folded[5].minutes, 25 + 20); // F e G, as duas menores
    assert.equal(foldSlices(folded.slice(0, 3)).length, 3);
  });
});
