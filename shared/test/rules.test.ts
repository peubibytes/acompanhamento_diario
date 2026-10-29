import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildCycleSummary,
  dayMetrics,
  formatDiff,
  formatDuration,
  formatHM,
  getCycle,
  isValidISODate,
  isWorkday,
  parseHM,
  remainingWorkdays,
  unionMinutes,
  type Activity,
} from '../src/index.ts';

let nextId = 1;
function act(date: string, start: string, end: string, demandId: number | null = null): Activity {
  return {
    id: nextId++,
    date,
    startMinute: parseHM(start)!,
    endMinute: parseHM(end)!,
    project: 'Projeto',
    description: '',
    notes: '',
    demandId,
  };
}

describe('sobreposição de horários', () => {
  it('períodos sobrepostos contam uma única vez', () => {
    const d = dayMetrics(
      '2026-10-26',
      [act('2026-10-26', '08:00', '10:00'), act('2026-10-26', '09:00', '11:00')],
      330,
    );
    assert.equal(d.minutes, 180);
    assert.equal(d.overlapMinutes, 60);
    assert.equal(d.activityCount, 2);
  });

  it('atividade contida em outra não soma nada', () => {
    const d = dayMetrics(
      '2026-10-26',
      [act('2026-10-26', '08:00', '12:00'), act('2026-10-26', '09:00', '10:00')],
      330,
    );
    assert.equal(d.minutes, 240);
    assert.equal(d.overlapMinutes, 60);
  });

  it('intervalos que apenas se encostam somam normalmente', () => {
    assert.equal(
      unionMinutes([
        { startMinute: 480, endMinute: 540 },
        { startMinute: 540, endMinute: 600 },
      ]),
      120,
    );
  });

  it('une cadeias de sobreposições em qualquer ordem', () => {
    assert.equal(
      unionMinutes([
        { startMinute: 700, endMinute: 760 },
        { startMinute: 480, endMinute: 600 },
        { startMinute: 590, endMinute: 710 },
        { startMinute: 900, endMinute: 930 },
      ]),
      310,
    );
  });

  it('a sobreposição não torna o dia irregular por engano', () => {
    const d = dayMetrics(
      '2026-10-26',
      [act('2026-10-26', '08:00', '13:30'), act('2026-10-26', '12:00', '13:00')],
      330,
    );
    assert.equal(d.conformity, 'conforme');
    assert.equal(d.exceeded, false);
  });
});

describe('tempo', () => {
  it('converte hh:mm em minutos e volta', () => {
    assert.equal(parseHM('08:45'), 525);
    assert.equal(parseHM('8:48'), 528);
    assert.equal(parseHM('8h48'), null);
    assert.equal(parseHM('08:60'), null);
    assert.equal(formatHM(525), '08:45');
    assert.equal(formatHM(1650), '27:30');
  });

  it('formata duração curta e diferença', () => {
    assert.equal(formatDuration(330), '5h30');
    assert.equal(formatDuration(480), '8h');
    assert.equal(formatDuration(45), '45min');
    assert.equal(formatDiff(0), '00:00');
    assert.equal(formatDiff(15), '+00:15');
    assert.equal(formatDiff(-70), '-01:10');
  });
});

describe('ciclo sexta → quinta', () => {
  const expected = {
    start: '2026-10-23',
    end: '2026-10-29',
    workdays: ['2026-10-23', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29'],
  };

  it('qualquer dia do ciclo resolve para a mesma sexta', () => {
    for (const ref of ['2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26', '2026-10-29']) {
      assert.deepEqual(getCycle(ref), expected, ref);
    }
  });

  it('sexta-feira abre um novo ciclo', () => {
    assert.equal(getCycle('2026-10-30').start, '2026-10-30');
  });

  it('atravessa virada de mês e de ano', () => {
    assert.deepEqual(getCycle('2027-01-04').workdays, [
      '2027-01-01',
      '2027-01-04',
      '2027-01-05',
      '2027-01-06',
      '2027-01-07',
    ]);
  });

  it('identifica dias úteis, datas válidas e dias restantes', () => {
    assert.equal(isWorkday('2026-10-24'), false);
    assert.equal(isWorkday('2026-10-26'), true);
    assert.equal(isValidISODate('2026-02-30'), false);
    assert.equal(isValidISODate('2026-10-26'), true);
    assert.equal(remainingWorkdays(getCycle('2026-10-26'), '2026-10-26'), 3);
    assert.equal(remainingWorkdays(getCycle('2026-10-29'), '2026-10-29'), 0);
  });
});

describe('métricas do dia (fórmulas da planilha)', () => {
  it('exemplo da planilha: 08:00–08:45 com meta 5h30', () => {
    const d = dayMetrics('2026-10-26', [act('2026-10-26', '08:00', '08:45')], 330);
    assert.equal(d.minutes, 45);
    assert.equal(d.diffLabel, '-04:45');
    assert.equal(d.activityCount, 1);
    assert.equal(d.conformity, 'nao_conforme');
    assert.equal(d.diagnosis, 'Faltam 04:45');
    assert.equal(d.weekdayLong, 'Segunda-feira');
  });

  it('sem apontamento fica pendente e sem diferença', () => {
    const d = dayMetrics('2026-10-26', [], 330);
    assert.equal(d.conformity, 'pendente');
    assert.equal(d.diffLabel, '');
    assert.equal(d.diagnosis, 'Sem apontamento');
  });

  it('exatamente a meta é conforme', () => {
    const d = dayMetrics(
      '2026-10-26',
      [act('2026-10-26', '08:00', '12:00'), act('2026-10-26', '13:00', '14:30')],
      330,
    );
    assert.equal(d.conformity, 'conforme');
    assert.equal(d.diffLabel, '00:00');
    assert.equal(d.diagnosis, 'Meta 5h30 atingida');
  });

  it('acima da meta é irregular e pede reajuste (meta 8h48)', () => {
    const d = dayMetrics('2026-10-26', [act('2026-10-26', '08:00', '17:00')], 528);
    assert.equal(d.conformity, 'nao_conforme');
    assert.equal(d.exceeded, true);
    assert.equal(d.diffLabel, '+00:12');
    assert.equal(d.diagnosis, 'Excedeu a meta de 8h48 em 00:12. Reajuste o apontamento');
  });

  it('acima de uma meta personalizada também é irregular', () => {
    const d = dayMetrics('2026-10-26', [act('2026-10-26', '08:00', '16:00')], 450);
    assert.equal(d.exceeded, true);
    assert.equal(d.diagnosis, 'Excedeu a meta de 7h30 em 00:30. Reajuste o apontamento');
  });

  it('abaixo da meta não é marcado como excedido', () => {
    const d = dayMetrics('2026-10-26', [act('2026-10-26', '08:00', '09:00')], 330);
    assert.equal(d.exceeded, false);
    assert.equal(dayMetrics('2026-10-26', [], 330).exceeded, false);
  });

  it('só conta atividades do próprio dia', () => {
    const d = dayMetrics('2026-10-27', [act('2026-10-26', '08:00', '12:00')], 330);
    assert.equal(d.minutes, 0);
    assert.equal(d.activityCount, 0);
  });
});

describe('métricas da semana', () => {
  it('meta semanal, total, % preenchido e dias conformes', () => {
    const s = buildCycleSummary(
      '2026-10-27',
      [act('2026-10-23', '08:00', '13:30'), act('2026-10-26', '08:00', '08:45')],
      330,
    );
    assert.equal(s.week.goal, 1650);
    assert.equal(s.week.total, 375);
    assert.equal(s.week.fillPercent, 22);
    assert.equal(s.week.conformDays, 1);
    assert.equal(s.week.exceededDays, 0);
    assert.equal(s.week.conformityLabel, '1/5 conformes');
    assert.equal(s.week.diagnosis, 'Ajustes pendentes');
    assert.equal(s.week.diffLabel, '-21:15');
  });

  it('% preenchido arredonda para baixo: 100 só quando completo', () => {
    const days = ['2026-10-23', '2026-10-26', '2026-10-27', '2026-10-28'];
    const acts = days.map((d) => act(d, '08:00', '13:30'));
    acts.push(act('2026-10-29', '08:00', '13:29'));
    assert.equal(buildCycleSummary('2026-10-29', acts, 330).week.fillPercent, 99);
  });

  it('semana completa fica 100% conforme', () => {
    const cycle = getCycle('2026-10-26');
    const acts = cycle.workdays.map((d) => act(d, '09:00', '17:48'));
    const s = buildCycleSummary('2026-10-26', acts, 528);
    assert.equal(s.week.fillPercent, 100);
    assert.equal(s.week.conformityLabel, '100% conforme');
    assert.equal(s.week.diagnosis, 'Meta total atingida');
  });
});
