import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  compareDemands,
  DEMAND_DEFAULTS,
  buildDemandSummary,
  demandMetrics,
  parseHM,
  matchesDemandFilter,
  parseExternalIds,
  waitingWorkdays,
  workdaysBetween,
  type Demand,
} from '../src/index.ts';

const DAILY_GOAL = 330;

function demand(overrides: Partial<Demand> = {}): Demand {
  return {
    id: 1,
    title: 'Migração de relatórios',
    description: '',
    targetMinutes: 20 * 60,
    startDate: '2026-10-23',
    dueDate: null,
    status: 'em_andamento',
    ...DEMAND_DEFAULTS,
    ...overrides,
  };
}

const log = (date: string, start: string, end: string, demandId: number | null = 1) => ({
  date,
  startMinute: parseHM(start)!,
  endMinute: parseHM(end)!,
  demandId,
});

describe('demandas: horas apontadas × meta', () => {
  it('soma só as atividades da própria demanda', () => {
    const m = demandMetrics(
      demand(),
      [log('2026-10-26', '08:00', '12:00'), log('2026-10-27', '08:00', '10:00'), log('2026-10-27', '13:00', '15:00', 2)],
      '2026-10-27',
      DAILY_GOAL,
    );
    assert.equal(m.logged, 360);
    assert.equal(m.remaining, 840);
    assert.equal(m.percent, 30);
    assert.equal(m.progress, 'em_andamento');
    assert.equal(m.diagnosis, 'Faltam 14h para a meta de 20h');
    assert.equal(m.activityCount, 2);
    assert.equal(m.lastActivityDate, '2026-10-27');
  });

  it('sobreposições dentro da demanda contam uma única vez', () => {
    const m = demandMetrics(
      demand(),
      [log('2026-10-26', '08:00', '10:00'), log('2026-10-26', '09:00', '11:00')],
      '2026-10-27',
      DAILY_GOAL,
    );
    assert.equal(m.logged, 180);
  });

  it('classifica não iniciada, atingida e excedida', () => {
    assert.equal(demandMetrics(demand(), [], '2026-10-27', DAILY_GOAL).progress, 'nao_iniciada');

    const exact = demandMetrics(demand({ targetMinutes: 240 }), [log('2026-10-26', '08:00', '12:00')], '2026-10-27', DAILY_GOAL);
    assert.equal(exact.progress, 'atingida');
    assert.equal(exact.diagnosis, 'Meta de 4h atingida');

    const over = demandMetrics(demand({ targetMinutes: 180 }), [log('2026-10-26', '08:00', '12:00')], '2026-10-27', DAILY_GOAL);
    assert.equal(over.progress, 'excedida');
    assert.equal(over.excess, 60);
    assert.equal(over.percent, 133);
    assert.equal(over.diagnosis, 'Excedeu a meta de 3h em 1h. Revise os apontamentos');
  });
});

describe('demandas: prazo e lembretes', () => {
  it('conta dias úteis ignorando o fim de semana', () => {
    assert.equal(workdaysBetween('2026-10-23', '2026-10-26'), 1); // sex → seg
    assert.equal(workdaysBetween('2026-10-26', '2026-10-30'), 4);
    assert.equal(workdaysBetween('2026-10-30', '2026-10-26'), 0);
  });

  it('sem prazo não gera lembrete', () => {
    const m = demandMetrics(demand(), [], '2026-10-27', DAILY_GOAL);
    assert.equal(m.deadline, 'sem_prazo');
    assert.equal(m.reminder, null);
    assert.equal(m.requiredPerDay, null);
  });

  it('longe do prazo fica "no prazo" e calcula o ritmo necessário', () => {
    // ter 27/10 → sex 06/11: hoje + 8 dias úteis = 9 dias disponíveis
    const m = demandMetrics(demand({ dueDate: '2026-11-06' }), [], '2026-10-27', DAILY_GOAL);
    assert.equal(m.deadline, 'no_prazo');
    assert.equal(m.workdaysLeft, 9);
    assert.equal(m.requiredPerDay, Math.ceil(1200 / 9));
    assert.equal(m.atRisk, false);
    assert.equal(m.reminder, null);
  });

  it(`a até 2 dias úteis do prazo lembra o usuário`, () => {
    const m = demandMetrics(demand({ dueDate: '2026-10-29' }), [log('2026-10-26', '08:00', '18:00')], '2026-10-27', DAILY_GOAL);
    assert.equal(m.deadline, 'proxima');
    assert.equal(m.workdaysLeft, 3);
    assert.equal(m.reminder, 'Vence em 2 dias úteis (29/10). Faltam 10h, cerca de 3h20 por dia útil.');
  });

  it('no dia do prazo e depois dele', () => {
    const today = demandMetrics(demand({ dueDate: '2026-10-27' }), [], '2026-10-27', DAILY_GOAL);
    assert.equal(today.deadline, 'vence_hoje');
    assert.equal(today.reminder, 'Vence hoje. Faltam 20h.');
    assert.equal(today.atRisk, true);

    const late = demandMetrics(demand({ dueDate: '2026-10-23' }), [], '2026-10-27', DAILY_GOAL);
    assert.equal(late.deadline, 'atrasada');
    assert.equal(late.atRisk, true);
    assert.equal(late.reminder, 'Prazo venceu em 23/10. Faltam 20h.');
  });

  it('meta atingida perto do prazo pede para concluir a demanda', () => {
    const m = demandMetrics(
      demand({ targetMinutes: 240, dueDate: '2026-10-28' }),
      [log('2026-10-26', '08:00', '12:00')],
      '2026-10-27',
      DAILY_GOAL,
    );
    assert.equal(m.reminder, 'Vence em 1 dia útil (28/10). Meta de horas atingida: marque a demanda como concluída.');
  });

  it('meta excedida perto do prazo pede revisão dos apontamentos', () => {
    const m = demandMetrics(
      demand({ targetMinutes: 360, dueDate: '2026-10-23' }),
      [log('2026-10-22', '08:00', '14:30')],
      '2026-10-27',
      DAILY_GOAL,
    );
    assert.equal(
      m.reminder,
      'Prazo venceu em 23/10. Meta de horas excedida em 30min: revise os apontamentos e conclua a demanda.',
    );
    assert.equal(m.atRisk, false);
  });

  it('em risco quando o que falta não cabe nos dias restantes', () => {
    // 40h restantes, 4 dias úteis × 5h30 = 22h disponíveis
    const m = demandMetrics(demand({ targetMinutes: 40 * 60, dueDate: '2026-11-02' }), [], '2026-10-28', DAILY_GOAL);
    assert.equal(m.deadline, 'no_prazo');
    assert.equal(m.atRisk, true);
    assert.equal(m.reminder, 'Faltam 40h em 4 dias úteis: não cabe nem com a meta diária inteira.');
  });

  it('demanda concluída não gera alertas', () => {
    const m = demandMetrics(demand({ status: 'concluido', dueDate: '2026-10-20' }), [], '2026-10-27', DAILY_GOAL);
    assert.equal(m.deadline, 'concluida');
    assert.equal(m.atRisk, false);
    assert.equal(m.reminder, null);
  });

  it('ordena por urgência', () => {
    const s = (id: number, o: Partial<Demand>) => buildDemandSummary(demand({ id, ...o }), [], '2026-10-27', DAILY_GOAL);
    const sorted = [
      s(1, { title: 'Sem prazo' }),
      s(2, { title: 'Concluída', status: 'concluido' }),
      s(3, { title: 'Longe', dueDate: '2026-11-20' }),
      s(4, { title: 'Atrasada', dueDate: '2026-10-20' }),
      s(5, { title: 'Próxima', dueDate: '2026-10-28' }),
    ].sort(compareDemands);
    assert.deepEqual(
      sorted.map((d) => d.title),
      ['Atrasada', 'Próxima', 'Longe', 'Sem prazo', 'Concluída'],
    );
  });
});

describe('demandas como chamados', () => {
  it('sem meta de horas: mostra o apontado e não calcula risco', () => {
    const m = demandMetrics(
      demand({ targetMinutes: null, dueDate: '2026-10-28', progressPercent: 60 }),
      [log('2026-10-26', '08:00', '10:30')],
      '2026-10-27',
      DAILY_GOAL,
    );
    assert.equal(m.target, null);
    assert.equal(m.percent, null);
    assert.equal(m.progress, 'em_andamento');
    assert.equal(m.diagnosis, '2h30 apontadas, sem meta de horas');
    assert.equal(m.atRisk, false);
    assert.equal(m.requiredPerDay, null);
    assert.equal(m.reminder, 'Vence em 1 dia útil (28/10). Progresso informado: 60%.');
  });

  it('cancelada encerra o prazo sem alertas', () => {
    const m = demandMetrics(demand({ status: 'cancelado', dueDate: '2026-10-20' }), [], '2026-10-27', DAILY_GOAL);
    assert.equal(m.deadline, 'cancelada');
    assert.equal(m.reminder, null);
  });

  it('aguardando terceiro e em homologação continuam abertas', () => {
    for (const status of ['novo', 'em_andamento', 'aguardando_terceiro', 'em_homologacao'] as const) {
      assert.equal(matchesDemandFilter({ status }, 'abertas'), true, status);
      assert.equal(matchesDemandFilter({ status }, 'encerradas'), false, status);
    }
    assert.equal(matchesDemandFilter({ status: 'cancelado' }, 'encerradas'), true);
    assert.equal(matchesDemandFilter({ status: 'concluido' }, 'concluido'), true);
    assert.equal(matchesDemandFilter({ status: 'concluido' }, 'novo'), false);
  });

  it('lê identificadores externos em maiúsculas e sem repetir', () => {
    assert.deepEqual(parseExternalIds(' sctask0001, RITM0002;sctask0001  us-12 '), ['SCTASK0001', 'RITM0002', 'US-12']);
    assert.deepEqual(parseExternalIds('  '), []);
  });

  it('conta dias úteis de espera sem duplicar impedimentos simultâneos', () => {
    const today = '2026-10-29'; // qui
    assert.equal(waitingWorkdays([], today), 0);
    // sex 23 → ter 27, resolvido: sex, seg, ter = 3 dias úteis
    assert.equal(waitingWorkdays([{ since: '2026-10-23', resolvedAt: '2026-10-27' }], today), 3);
    // aberto desde seg 26 até hoje (qui): 4 dias, sobrepondo o anterior em seg e ter
    assert.equal(
      waitingWorkdays(
        [
          { since: '2026-10-23', resolvedAt: '2026-10-27' },
          { since: '2026-10-26', resolvedAt: null },
        ],
        today,
      ),
      5,
    );
  });

  it('resume linha do tempo e impedimentos de cada demanda', () => {
    const s = buildDemandSummary(demand(), [], '2026-10-27', DAILY_GOAL, {
      events: [
        { demandId: 1, date: '2026-10-23' },
        { demandId: 1, date: '2026-10-26' },
        { demandId: 2, date: '2026-10-27' },
      ],
      blockers: [
        { demandId: 1, since: '2026-10-26', resolvedAt: null },
        { demandId: 2, since: '2026-10-20', resolvedAt: null },
      ],
    });
    assert.deepEqual(s.tracking, { eventCount: 2, lastEventDate: '2026-10-26', openBlockers: 1, waitingWorkdays: 2 });
  });

  it('no mesmo prazo, a prioridade mais alta vem primeiro', () => {
    const s = (id: number, o: Partial<Demand>) =>
      buildDemandSummary(demand({ id, dueDate: '2026-11-20', ...o }), [], '2026-10-27', DAILY_GOAL);
    const sorted = [s(1, { title: 'Baixa', priority: 'baixa' }), s(2, { title: 'Urgente', priority: 'urgente' })].sort(
      compareDemands,
    );
    assert.deepEqual(
      sorted.map((d) => d.title),
      ['Urgente', 'Baixa'],
    );
  });
});
