import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildPeriodSummary,
  anchorDate,
  formatPeriodLabel,
  getCycle,
  getPeriod,
  previousPeriod,
  shiftPeriod,
  type Activity,
} from '../src/index.ts';

const activity = (id: number, date: string, startMinute: number, endMinute: number): Activity => ({
  id,
  date,
  startMinute,
  endMinute,
  project: 'Projeto fictício',
  description: '',
  notes: '',
  participants: '',
  subject: '',
  demandId: 1,
});

describe('período: semana', () => {
  it('reaproveita o ciclo sexta → quinta, e o fim de semana cai na sexta anterior', () => {
    const week = getPeriod('2026-11-01', 'week'); // domingo
    assert.equal(week.scale, 'week');
    assert.equal(week.start, '2026-10-30');
    assert.equal(week.end, '2026-11-05');
    assert.deepEqual(week.workdays, getCycle('2026-11-01').workdays);
    assert.equal(week.workdays.length, 5);
  });

  it('navega de 7 em 7 dias a partir da sexta, na virada de mês e de ano', () => {
    assert.equal(shiftPeriod('2026-11-03', 'week', 1), '2026-11-06');
    assert.equal(shiftPeriod('2026-11-03', 'week', -1), '2026-10-23');
    assert.equal(shiftPeriod('2026-12-31', 'week', 1), '2027-01-01'); // quinta → sexta seguinte
    assert.equal(shiftPeriod('2027-01-05', 'week', -1), '2026-12-25');
    assert.equal(shiftPeriod('2026-11-03', 'week', 0), '2026-10-30');
  });

  it('o período anterior é a semana anterior', () => {
    const prev = previousPeriod(getPeriod('2026-11-03', 'week'));
    assert.equal(prev.start, '2026-10-23');
    assert.equal(prev.end, '2026-10-29');
  });

  it('rótulo "Sex 30/10 → Qui 05/11"', () => {
    assert.equal(formatPeriodLabel(getPeriod('2026-11-01', 'week')), 'Sex 30/10 → Qui 05/11');
  });
});

describe('período: mês', () => {
  it('vai do dia 1º ao último, só com Seg–Sex', () => {
    const oct = getPeriod('2026-10-15', 'month');
    assert.equal(oct.start, '2026-10-01');
    assert.equal(oct.end, '2026-10-31');
    assert.equal(oct.workdays.length, 22);
    assert.equal(oct.workdays[0], '2026-10-01'); // quinta
    assert.equal(oct.workdays.at(-1), '2026-10-30'); // sexta; o dia 31 é sábado
  });

  it('mês que começa no fim de semana: o primeiro dia útil é a segunda', () => {
    const nov = getPeriod('2026-11-20', 'month'); // 01/11/2026 é domingo
    assert.equal(nov.workdays[0], '2026-11-02');
    assert.equal(nov.workdays.length, 21);
    const mar = getPeriod('2025-03-10', 'month'); // 01/03/2025 é sábado
    assert.equal(mar.workdays[0], '2025-03-03');
    assert.equal(mar.workdays.at(-1), '2025-03-31');
  });

  it('fevereiro bissexto tem 29 dias; o comum, 28', () => {
    const leap = getPeriod('2024-02-10', 'month');
    assert.equal(leap.end, '2024-02-29');
    assert.equal(leap.workdays.length, 21);
    assert.equal(getPeriod('2026-02-10', 'month').end, '2026-02-28');
    assert.equal(previousPeriod(getPeriod('2024-03-05', 'month')).end, '2024-02-29');
  });

  it('navega entre meses, ancorado no dia 1º, na virada de ano e sem pular meses curtos', () => {
    assert.equal(shiftPeriod('2026-12-15', 'month', 1), '2027-01-01');
    assert.equal(shiftPeriod('2026-01-31', 'month', -1), '2025-12-01');
    assert.equal(shiftPeriod('2026-03-31', 'month', -1), '2026-02-01');
    assert.equal(shiftPeriod('2026-01-31', 'month', 1), '2026-02-01');
    assert.equal(shiftPeriod('2026-06-10', 'month', 14), '2027-08-01');
    assert.equal(shiftPeriod('2026-06-10', 'month', -6), '2025-12-01');
  });

  it('o período anterior é o mês anterior inteiro', () => {
    const prev = previousPeriod(getPeriod('2027-01-20', 'month'));
    assert.equal(prev.start, '2026-12-01');
    assert.equal(prev.end, '2026-12-31');
    assert.equal(prev.scale, 'month');
  });

  it('rótulo "Outubro de 2026"', () => {
    assert.equal(formatPeriodLabel(getPeriod('2026-10-05', 'month')), 'Outubro de 2026');
    assert.equal(formatPeriodLabel(getPeriod('2027-03-05', 'month')), 'Março de 2027');
  });
});

describe('dia de ancoragem', () => {
  it('hoje, se estiver no período; senão a ponta mais próxima', () => {
    const nov = getPeriod('2026-11-10', 'month');
    assert.equal(anchorDate(nov, '2026-11-01'), '2026-11-01'); // domingo dentro do mês
    assert.equal(anchorDate(nov, '2026-12-05'), '2026-11-30'); // mês passado: último dia útil
    assert.equal(anchorDate(nov, '2026-10-20'), '2026-11-02'); // mês futuro: primeiro dia útil
    const week = getPeriod('2026-10-23', 'week');
    assert.equal(anchorDate(week, '2026-11-02'), '2026-10-29');
  });
});

describe('resumo de período', () => {
  it('semana: igual ao resumo do ciclo (meta × 5, X/5 conformes)', () => {
    const week = getPeriod('2026-10-23', 'week');
    const activities = [activity(1, '2026-10-23', 480, 810), activity(2, '2026-10-26', 480, 700)]; // 5h30 e 3h40
    const s = buildPeriodSummary(week, activities, () => 330);
    assert.equal(s.days.length, 5);
    assert.equal(s.totals.goal, 1650);
    assert.equal(s.totals.total, 550);
    assert.equal(s.totals.conformDays, 1);
    assert.equal(s.totals.conformityLabel, '1/5 conformes');
    assert.equal(s.totals.fillPercent, 33); // 550 ÷ 1650 = 33,3%
  });

  it('mês: usa a meta do ciclo de apontamento de cada dia e soma as metas', () => {
    const nov = getPeriod('2026-11-10', 'month');
    // O ciclo que abre em 30/10 usa 5h30; o seguinte (a partir de 06/11) usa 9h.
    const goalForDay = (date: string) => (getCycle(date).start < '2026-11-06' ? 330 : 540);
    const s = buildPeriodSummary(nov, [activity(1, '2026-11-02', 480, 810), activity(2, '2026-11-09', 480, 1020)], goalForDay);
    const early = nov.workdays.filter((d) => d < '2026-11-06').length; // 02–05/11
    assert.equal(early, 4);
    assert.equal(s.days.length, 21);
    assert.equal(s.totals.goal, early * 330 + (21 - early) * 540);
    assert.equal(s.days[0].goal, 330);
    assert.equal(s.days.at(-1)!.goal, 540);
    assert.equal(s.totals.conformDays, 2); // 02/11 = 5h30 e 09/11 = 9h
    assert.equal(s.totals.conformityLabel, '2/21 conformes');
    assert.equal(s.totals.total, 330 + 540);
    assert.equal(s.totals.fillPercent, Math.floor((858 * 100) / s.totals.goal));
  });

  it('todos os dias conformes: "100% conforme"', () => {
    const week = getPeriod('2026-10-23', 'week');
    const activities = week.workdays.map((d, i) => activity(i, d, 480, 810));
    const s = buildPeriodSummary(week, activities, () => 330);
    assert.equal(s.totals.conformityLabel, '100% conforme');
    assert.equal(s.totals.diagnosis, 'Meta total atingida');
  });

  it('apontamentos fora dos dias úteis do período não entram', () => {
    const s = buildPeriodSummary(getPeriod('2026-10-23', 'week'), [activity(1, '2026-11-02', 480, 540)], () => 330);
    assert.equal(s.totals.total, 0);
  });
});
