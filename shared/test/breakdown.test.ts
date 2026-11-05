import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dayBreakdown, loggableMinutes, parseHM, unionMinutes } from '../src/index.ts';

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

  it('não agrupa: cada demanda ou projeto tem a sua fatia, por menor que seja', () => {
    const many = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((p, i) =>
      act(`${String(8 + i).padStart(2, '0')}:00`, `${String(8 + i).padStart(2, '0')}:${String(50 - i * 5).padStart(2, '0')}`, null, p),
    );
    const b = dayBreakdown(many, demands);
    assert.equal(b.slices.length, 8);
    assert.equal(b.slices.reduce((s, x) => s + x.minutes, 0), b.total);
    assert.ok(b.slices.every((s) => s.kind === 'projeto'));
  });
});

describe('quanto apontar em cada apontamento', () => {
  let id = 1;
  const at = (start: string, end: string, date = '2026-10-26') => ({
    id: id++,
    date,
    startMinute: parseHM(start)!,
    endMinute: parseHM(end)!,
  });
  const sum = (m: Map<number, number>) => [...m.values()].reduce((s, x) => s + x, 0);

  it('sem sobreposição, é a própria duração', () => {
    const [a, b] = [at('08:00', '09:00'), at('10:00', '10:45')];
    const m = loggableMinutes([a, b]);
    assert.deepEqual([m.get(a.id), m.get(b.id)], [60, 45]);
  });

  it('o trecho em comum é dividido ao meio e a soma é o total do dia', () => {
    const [chamado, reuniao] = [at('08:00', '10:00'), at('09:00', '10:00')];
    const m = loggableMinutes([chamado, reuniao]);
    assert.deepEqual([m.get(chamado.id), m.get(reuniao.id)], [90, 30]);
    assert.equal(sum(m), 120);
  });

  it('um apontamento dentro do outro e três ao mesmo tempo', () => {
    const [outer, inner] = [at('08:00', '12:00'), at('09:00', '10:00')];
    const m1 = loggableMinutes([outer, inner]);
    assert.deepEqual([m1.get(outer.id), m1.get(inner.id)], [210, 30]);

    const three = [at('08:00', '09:00'), at('08:00', '09:00'), at('08:00', '09:00')];
    const m2 = loggableMinutes(three);
    assert.deepEqual([...m2.values()], [20, 20, 20]);
  });

  it('divisão ímpar fica em minutos inteiros e a soma bate com a união', () => {
    const items = [at('08:00', '08:45'), at('08:00', '08:45')];
    const m = loggableMinutes(items);
    assert.deepEqual([...m.values()].sort(), [22, 23]);
    assert.equal(sum(m), unionMinutes(items));
  });

  it('cada dia é calculado separado; intervalo inválido é ignorado', () => {
    const [mon, tue, bad] = [at('08:00', '09:00'), at('08:00', '09:00', '2026-10-27'), at('09:00', '09:00')];
    const m = loggableMinutes([mon, tue, bad]);
    assert.deepEqual([m.get(mon.id), m.get(tue.id), m.has(bad.id)], [60, 60, false]);
  });
});
