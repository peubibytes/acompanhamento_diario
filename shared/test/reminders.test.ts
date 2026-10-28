import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  attentionCount,
  buildAgenda,
  buildCycleSummary,
  buildDemandSummary,
  buildNotifications,
  DEMAND_DEFAULTS,
  daysBetween,
  parseHM,
  type Activity,
  type Demand,
} from '../src/index.ts';

const GOAL = 330;
const TODAY = '2026-10-27'; // terça, ciclo 23/10 → 29/10

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
    status: 'concluido',
    demandId,
  };
}

function demand(id: number, o: Partial<Demand>, acts: Activity[] = [], today = TODAY) {
  const d: Demand = {
    id,
    title: `Demanda ${id}`,
    description: '',
    targetMinutes: 600,
    startDate: '2026-10-20',
    dueDate: null,
    status: 'em_andamento',
    ...DEMAND_DEFAULTS,
    ...o,
  };
  return buildDemandSummary(d, acts, today, GOAL);
}

describe('notificações do sino', () => {
  const acts = [act('2026-10-23', '08:00', '13:30'), act('2026-10-26', '08:00', '14:00')];
  const cycle = buildCycleSummary(TODAY, acts, GOAL);

  it('reúne dia irregular, prazos de demanda e o dia de apontamento, por gravidade', () => {
    const demands = [
      demand(1, { title: 'Próxima', dueDate: '2026-10-29' }),
      demand(2, { title: 'Atrasada', dueDate: '2026-10-20' }),
      demand(3, { title: 'Sem prazo' }),
    ];
    const items = buildNotifications(cycle, demands, TODAY);
    assert.deepEqual(
      items.map((n) => [n.kind, n.severity, n.title]),
      [
        ['prazo_demanda', 'critical', 'Atrasada'],
        ['dia_irregular', 'critical', 'Apontamento irregular em Seg 26/10'],
        ['prazo_demanda', 'warning', 'Próxima'],
        ['apontamento', 'info', 'Apontamento na quinta, 29/10'],
      ],
    );
    assert.equal(items[1].detail, 'Excedeu a meta de 5h30 em 00:30. Reajuste o apontamento.');
    assert.deepEqual(items[1].target, { screen: 'atividades', date: '2026-10-26' });
    assert.equal(items[3].detail, 'Semana 41% preenchida, faltam 16h.');
    assert.equal(attentionCount(items), 3);
  });

  it('na quinta, o dia de apontamento vira aviso se a semana não estiver pronta', () => {
    const thursday = buildCycleSummary('2026-10-29', acts, GOAL);
    const [n] = buildNotifications(thursday, [], '2026-10-29').filter((x) => x.kind === 'apontamento');
    assert.equal(n.title, 'Hoje é dia de apontamento');
    assert.equal(n.severity, 'warning');
  });

  it('semana pronta na quinta é só informativa', () => {
    const full = ['2026-10-23', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29'].map((d) => act(d, '08:00', '13:30'));
    const summary = buildCycleSummary('2026-10-29', full, GOAL);
    const items = buildNotifications(summary, [], '2026-10-29');
    assert.equal(items.length, 1);
    assert.equal(items[0].severity, 'info');
    assert.equal(items[0].detail, 'Semana 100% preenchida, tudo pronto para apontar.');
    assert.equal(attentionCount(items), 0);
  });

  it('demandas concluídas não notificam', () => {
    const items = buildNotifications(cycle, [demand(1, { dueDate: '2026-10-20', status: 'concluido' })], TODAY);
    assert.equal(items.filter((n) => n.kind === 'prazo_demanda').length, 0);
  });
});

describe('agenda', () => {
  it('ordena prazos, inícios e os dois próximos dias de apontamento', () => {
    const items = buildAgenda(
      [
        demand(1, { title: 'Relatórios', dueDate: '2026-10-29' }, [act('2026-10-26', '08:00', '11:00', 1)]),
        demand(2, { title: 'Futura', startDate: '2026-11-02', dueDate: '2026-11-20' }),
        demand(3, { title: 'Concluída', dueDate: '2026-10-28', status: 'concluido' }),
      ],
      TODAY,
    );
    assert.deepEqual(
      items.map((i) => [i.date, i.kind, i.title]),
      [
        ['2026-10-29', 'prazo_demanda', 'Relatórios'],
        ['2026-10-29', 'apontamento', 'Dia de apontamento'],
        ['2026-11-02', 'inicio_demanda', 'Futura'],
        ['2026-11-05', 'apontamento', 'Dia de apontamento'],
        ['2026-11-20', 'prazo_demanda', 'Futura'],
      ],
    );
    assert.equal(items[0].detail, 'Prazo da demanda · 3h de 10h · Prazo próximo');
    assert.equal(items[1].detail, 'Fechamento do ciclo Sex 23/10 → Qui 29/10');
  });

  it('mantém prazos vencidos (aparecem antes de hoje)', () => {
    const [first] = buildAgenda([demand(1, { dueDate: '2026-10-20' })], TODAY);
    assert.equal(first.date, '2026-10-20');
    assert.equal(first.deadline, 'atrasada');
  });

  it('conta dias corridos entre datas', () => {
    assert.equal(daysBetween('2026-10-27', '2026-10-29'), 2);
    assert.equal(daysBetween('2026-10-27', '2026-10-20'), -7);
    assert.equal(daysBetween('2026-12-31', '2027-01-01'), 1);
  });
});
