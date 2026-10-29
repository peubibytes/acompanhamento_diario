import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildDemandSummary,
  compareDemands,
  demandLabel,
  demandMetrics,
  demandSubtitle,
  isOpenDemand,
  matchesStatusGroup,
  normalizeTicketNumber,
  parseHM,
  waitingWorkdays,
  workdaysBetween,
  type CycleDemand,
  type Demand,
} from '../src/index.ts';

const TODAY = '2026-10-27'; // terça

function cycle(overrides: Partial<CycleDemand> = {}): CycleDemand {
  return {
    id: 1,
    category: 'ciclo',
    title: 'Migração de relatórios',
    description: '',
    kind: 'planejada',
    status: 'em_andamento',
    priority: 'media',
    startDate: '2026-10-23',
    dueDate: null,
    branch: '',
    prUrl: '',
    environment: null,
    ...overrides,
  };
}

const ticket: Demand = {
  id: 2,
  category: 'chamado',
  ticketNumber: 'SCTASK0000001',
  description: 'Erro ao gerar o relatório mensal\nSolicitado pela área financeira',
  status: 'em_andamento',
};
const meeting: Demand = { id: 3, category: 'reuniao', meetingType: 'Daily', participants: 'Equipe Alfa', subject: 'Status do dia' };
const training: Demand = { id: 4, category: 'treinamento', title: 'Curso de SQL', description: '', status: 'nao_iniciado' };

const log = (date: string, start: string, end: string, demandId: number | null = 1) => ({
  date,
  startMinute: parseHM(start)!,
  endMinute: parseHM(end)!,
  demandId,
});

describe('demandas: declaração', () => {
  it('nome e complemento de cada tipo', () => {
    assert.equal(demandLabel(cycle()), 'Migração de relatórios');
    assert.equal(demandLabel(ticket), 'SCTASK0000001');
    assert.equal(demandSubtitle(ticket), 'Erro ao gerar o relatório mensal');
    assert.equal(demandLabel(meeting), 'Daily · Status do dia');
    assert.equal(demandSubtitle(meeting), 'com Equipe Alfa');
    assert.equal(demandLabel(training), 'Curso de SQL');
  });

  it('abertas e encerradas: reunião não tem status e fica sempre aberta', () => {
    assert.equal(isOpenDemand(meeting), true);
    assert.equal(isOpenDemand({ ...ticket, status: 'concluido' }), false);
    assert.equal(isOpenDemand(cycle({ status: 'aguardando_terceiro' })), true);
    assert.equal(isOpenDemand(cycle({ status: 'cancelado' })), false);
    assert.equal(matchesStatusGroup(cycle({ status: 'concluido' }), 'encerradas'), true);
    assert.equal(matchesStatusGroup(training, 'abertas'), true);
  });

  it('normaliza o número do chamado', () => {
    assert.equal(normalizeTicketNumber('  sctask0000001 '), 'SCTASK0000001');
  });
});

describe('demandas: métricas vindas dos apontamentos', () => {
  it('soma só os apontamentos da própria demanda, sem contar sobreposições duas vezes', () => {
    const m = demandMetrics(
      cycle(),
      [
        log('2026-10-26', '08:00', '10:00'),
        log('2026-10-26', '09:00', '11:00'),
        log('2026-10-27', '08:00', '09:00'),
        log('2026-10-27', '13:00', '15:00', 2),
      ],
      TODAY,
    );
    assert.equal(m.logged, 240);
    assert.equal(m.activityCount, 3);
    assert.equal(m.dayCount, 2);
    assert.equal(m.lastActivityDate, '2026-10-27');
  });

  it('a mesma reunião em vários dias soma as ocorrências', () => {
    const m = demandMetrics(
      meeting,
      [log('2026-10-23', '09:00', '09:15', 3), log('2026-10-26', '09:00', '09:15', 3), log('2026-10-27', '09:00', '09:20', 3)],
      TODAY,
    );
    assert.equal(m.logged, 50);
    assert.equal(m.dayCount, 3);
    assert.equal(m.deadline, 'sem_prazo');
    assert.equal(m.reminder, null);
  });
});

describe('ciclo: prazo e lembretes', () => {
  it('conta dias úteis ignorando o fim de semana', () => {
    assert.equal(workdaysBetween('2026-10-23', '2026-10-26'), 1); // sex → seg
    assert.equal(workdaysBetween('2026-10-26', '2026-10-30'), 4);
    assert.equal(workdaysBetween('2026-10-30', '2026-10-26'), 0);
  });

  it('sem prazo não gera lembrete', () => {
    const m = demandMetrics(cycle(), [], TODAY);
    assert.equal(m.deadline, 'sem_prazo');
    assert.equal(m.reminder, null);
  });

  it('longe do prazo fica "no prazo"', () => {
    // ter 27/10 → sex 06/11: hoje + 8 dias úteis = 9 dias disponíveis
    const m = demandMetrics(cycle({ dueDate: '2026-11-06' }), [], TODAY);
    assert.equal(m.deadline, 'no_prazo');
    assert.equal(m.workdaysLeft, 9);
    assert.equal(m.reminder, null);
  });

  it('a até 2 dias úteis do prazo lembra o usuário, com as horas apontadas', () => {
    const m = demandMetrics(cycle({ dueDate: '2026-10-29' }), [log('2026-10-26', '08:00', '12:30')], TODAY);
    assert.equal(m.deadline, 'proxima');
    assert.equal(m.workdaysLeft, 3);
    assert.equal(m.reminder, 'Vence em 2 dias úteis (29/10). 4h30 apontadas até agora.');
  });

  it('no dia do prazo e depois dele', () => {
    const today = demandMetrics(cycle({ dueDate: TODAY }), [], TODAY);
    assert.equal(today.deadline, 'vence_hoje');
    assert.equal(today.reminder, 'Vence hoje. Nenhum apontamento ainda.');

    const late = demandMetrics(cycle({ dueDate: '2026-10-23' }), [], TODAY);
    assert.equal(late.deadline, 'atrasada');
    assert.equal(late.reminder, 'Prazo venceu em 23/10. Conclua o ciclo ou ajuste o prazo.');
  });

  it('concluído ou cancelado encerra o prazo sem alertas', () => {
    assert.equal(demandMetrics(cycle({ status: 'concluido', dueDate: '2026-10-20' }), [], TODAY).deadline, 'concluida');
    const cancelled = demandMetrics(cycle({ status: 'cancelado', dueDate: '2026-10-20' }), [], TODAY);
    assert.equal(cancelled.deadline, 'cancelada');
    assert.equal(cancelled.reminder, null);
  });
});

describe('ciclo: impedimentos e linha do tempo', () => {
  it('conta dias úteis de espera sem duplicar impedimentos simultâneos', () => {
    const today = '2026-10-29'; // qui
    assert.equal(waitingWorkdays([], today), 0);
    // sex 23 → ter 27, resolvido: sex, seg, ter = 3 dias úteis
    assert.equal(waitingWorkdays([{ since: '2026-10-23', resolvedAt: '2026-10-27' }], today), 3);
    // + aberto desde seg 26 até hoje: une os dois (sex, seg, ter, qua, qui)
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

  it('resume a linha do tempo e os impedimentos de cada ciclo', () => {
    const s = buildDemandSummary(cycle(), [], TODAY, {
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
    assert.equal(s.label, 'Migração de relatórios');
    assert.deepEqual(s.tracking, { eventCount: 2, lastEventDate: '2026-10-26', openBlockers: 1, waitingWorkdays: 2, lastUpdate: { date: '2026-10-26', kind: 'evento', text: '' } });
  });
});

describe('ordenação', () => {
  const s = (d: Demand) => buildDemandSummary(d, [], TODAY);

  it('agrupa por categoria; ciclos por urgência e prioridade, encerrados por último', () => {
    const sorted = [
      s(training),
      s(cycle({ id: 10, title: 'Concluído', status: 'concluido' })),
      s(cycle({ id: 11, title: 'Sem prazo' })),
      s(cycle({ id: 12, title: 'Atrasado', dueDate: '2026-10-20' })),
      s(cycle({ id: 13, title: 'Longe, baixa', dueDate: '2026-11-20', priority: 'baixa' })),
      s(cycle({ id: 14, title: 'Longe, urgente', dueDate: '2026-11-20', priority: 'urgente' })),
      s(meeting),
      s(ticket),
    ].sort(compareDemands);
    assert.deepEqual(
      sorted.map((d) => d.label),
      [
        'Atrasado',
        'Longe, urgente',
        'Longe, baixa',
        'Sem prazo',
        'Concluído',
        'SCTASK0000001',
        'Daily · Status do dia',
        'Curso de SQL',
      ],
    );
  });

  it('atividades: as declaradas por último primeiro, concluídas no fim', () => {
    const t = (id: number, status: 'em_andamento' | 'concluido') =>
      s({ ...ticket, id, ticketNumber: `INC${id}`, status } as Demand);
    const sorted = [t(1, 'em_andamento'), t(2, 'concluido'), t(3, 'em_andamento')].sort(compareDemands);
    assert.deepEqual(
      sorted.map((d) => d.label),
      ['INC3', 'INC1', 'INC2'],
    );
  });
});
