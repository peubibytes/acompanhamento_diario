import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  attentionCount,
  buildAgenda,
  buildCycleSummary,
  buildDemandSummary,
  buildNotifications,
  dataNotifications,
  daysBetween,
  parseHM,
  type Activity,
  type CycleDemand,
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
    participants: '',
    subject: '',
    demandId,
  };
}

function demand(id: number, o: Partial<CycleDemand>, acts: Activity[] = [], today = TODAY) {
  const d: CycleDemand = {
    id,
    category: 'ciclo',
    title: `Demanda ${id}`,
    description: '',
    kind: 'planejada',
    status: 'em_andamento',
    priority: 'media',
    startDate: '2026-10-20',
    dueDate: null,
    branch: '',
    prUrl: '',
    environment: null,
    ...o,
  };
  return buildDemandSummary(d, acts, today);
}

/** Atividades (rotina) não têm prazo nem início: nunca entram em lembretes ou agenda. */
const routine: Demand[] = [
  { id: 90, category: 'chamado', ticketNumber: 'INC0001', description: 'Teste', status: 'em_andamento' },
  { id: 91, category: 'reuniao', meetingType: 'Daily', participants: 'Equipe', subject: 'Status' },
];

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
    assert.deepEqual(items[1].target, { screen: 'apontamentos', date: '2026-10-26' });
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

  it('ciclos concluídos e atividades de rotina não notificam', () => {
    const items = buildNotifications(
      cycle,
      [demand(1, { dueDate: '2026-10-20', status: 'concluido' }), ...routine.map((d) => buildDemandSummary(d, [], TODAY))],
      TODAY,
    );
    assert.equal(items.filter((n) => n.kind === 'prazo_demanda').length, 0);
  });
});

describe('lembretes de Seus dados', () => {
  const base = { syncedFolder: null, hasData: true, lastExportAt: null };
  // Meio-dia em UTC: a mesma data em qualquer fuso do Brasil.
  const exportedOn = (date: string) => `${date}T12:00:00.000Z`;

  it('avisa quando o banco está numa pasta sincronizada', () => {
    const [n] = dataNotifications({ ...base, hasData: false, syncedFolder: 'OneDrive' }, TODAY);
    assert.equal(n.kind, 'pasta_sincronizada');
    assert.equal(n.severity, 'warning');
    assert.equal(n.title, 'Seus dados estão numa pasta do OneDrive');
    assert.deepEqual(n.target, { screen: 'dados' });
  });

  it('pede a exportação: nunca exportado pede atenção; de 7 a 13 dias informa; 14 ou mais pede atenção', () => {
    const exportReminder = (lastExportAt: string | null) =>
      dataNotifications({ ...base, lastExportAt }, TODAY).map((n) => [n.severity, n.detail]);
    assert.deepEqual(exportReminder(null), [
      ['warning', 'Você ainda não exportou. Os backups ficam no mesmo disco do banco: guarde uma cópia em outro lugar.'],
    ]);
    assert.deepEqual(exportReminder(exportedOn('2026-10-21')), []);
    assert.deepEqual(exportReminder(exportedOn('2026-10-20')), [
      ['info', 'A última exportação foi há 7 dias (20/10). Guarde uma cópia nova fora desta máquina.'],
    ]);
    assert.equal(exportReminder(exportedOn('2026-10-13'))[0][0], 'warning');
  });

  it('sem dados não há o que exportar', () => {
    assert.deepEqual(dataNotifications({ ...base, hasData: false }, TODAY), []);
  });

  it('entram no sino com os demais lembretes, por gravidade', () => {
    const cycle = buildCycleSummary(TODAY, [], GOAL);
    const items = buildNotifications(cycle, [], TODAY, { ...base, syncedFolder: 'Dropbox' });
    assert.deepEqual(items.map((n) => n.kind), ['pasta_sincronizada', 'exportacao', 'apontamento']);
    assert.equal(attentionCount(items), 2);
  });
});

describe('agenda', () => {
  it('ordena prazos, inícios e os dois próximos dias de apontamento', () => {
    const items = buildAgenda(
      [
        demand(1, { title: 'Relatórios', dueDate: '2026-10-29' }, [act('2026-10-26', '08:00', '11:00', 1)]),
        demand(2, { title: 'Futura', startDate: '2026-11-02', dueDate: '2026-11-20' }),
        demand(3, { title: 'Concluída', dueDate: '2026-10-28', status: 'concluido' }),
        ...routine.map((d) => buildDemandSummary(d, [], TODAY)),
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
    assert.equal(items[0].detail, 'Prazo do ciclo · 3h apontadas · Prazo próximo');
    assert.equal(items[2].detail, 'Início do ciclo');
    assert.equal(items[1].detail, 'Fechamento do período Sex 23/10 → Qui 29/10');
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
