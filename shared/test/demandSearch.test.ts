import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildDemandSummary, highlightRanges, normalizeSearch, searchDemands, type CycleDemand, type Demand, type DemandSummary } from '../src/index.ts';

const TODAY = '2026-11-06';

/** Demandas fictícias; `last` = data do último apontamento (um apontamento de 1h nesse dia). */
function summary(demand: Demand, last?: string): DemandSummary {
  const activities = last
    ? [{ demandId: demand.id, date: last, startMinute: 540, endMinute: 600 }]
    : [];
  return buildDemandSummary(demand, activities, TODAY);
}

const cycle = (id: number, title: string, status: 'em_andamento' | 'concluido' = 'em_andamento'): CycleDemand => ({
  id, category: 'ciclo', title, description: '', kind: 'planejada', status, priority: 'media',
  startDate: '2026-10-01', dueDate: null, branch: '', prUrl: '', environment: null,
});
const ticket = (id: number, ticketNumber: string, description: string, status: 'nao_iniciado' | 'concluido' = 'nao_iniciado'): Demand => ({
  id, category: 'chamado', ticketNumber, description, status,
});
const meeting = (id: number, meetingType: string, subject = '', participants = ''): Demand => ({
  id, category: 'reuniao', meetingType, subject, participants,
});

const portal = summary(cycle(1, 'Portal — ajuste no deploy'), '2026-11-03');
const relatorio = summary(cycle(2, 'Relatório mensal'), '2026-11-05');
const old = summary(cycle(3, 'Projeto antigo', 'concluido'), '2026-09-01');
const t1 = summary(ticket(4, 'SCTASK0000001', 'Erro na emissão da nota'), '2026-11-04');
const t2 = summary(ticket(5, 'SCTASK0000002', 'Lentidão no portal'));
const t3 = summary(ticket(6, 'SCTASK0000003', 'Acesso negado'));
const daily = summary(meeting(7, 'Daily'), '2026-11-06');
const legacy = summary(meeting(8, 'Planejamento', 'Sprint de novembro', 'Equipe Exemplo'));
const all = [portal, relatorio, old, t1, t2, t3, daily, legacy];

const ids = (list: DemandSummary[]) => list.map((d) => d.id);

describe('busca de demandas', () => {
  it('ignora maiúsculas e acentos', () => {
    assert.equal(normalizeSearch('Emissão Ação'), 'emissao acao');
    assert.deepEqual(ids(searchDemands(all, 'EMISSAO').groups.flatMap((g) => g.items)), [4]);
  });

  it('vários termos: todos precisam aparecer, em qualquer ordem', () => {
    assert.deepEqual(ids(searchDemands(all, 'deploy portal').groups.flatMap((g) => g.items)), [1]);
    assert.deepEqual(searchDemands(all, 'deploy relatorio').groups, []);
  });

  it('acha o chamado pelo número e pela descrição', () => {
    assert.deepEqual(ids(searchDemands(all, 'sctask0000002').groups.flatMap((g) => g.items)), [5]);
    assert.deepEqual(ids(searchDemands(all, 'lentidao').groups.flatMap((g) => g.items)), [5]);
  });

  it('acha a reunião antiga pelo assunto e pelas pessoas', () => {
    assert.deepEqual(ids(searchDemands(all, 'sprint').groups.flatMap((g) => g.items)), [8]);
    assert.deepEqual(ids(searchDemands(all, 'equipe exemplo').groups.flatMap((g) => g.items)), [8]);
  });
});

describe('ordem e grupos', () => {
  it('sem busca: grupos na ordem das categorias; a recência dentro do grupo; nunca apontadas pela declaração mais nova', () => {
    const r = searchDemands(all, '', { recentLimit: 0 });
    assert.deepEqual(r.groups.map((g) => g.category), ['ciclo', 'chamado', 'reuniao']);
    assert.deepEqual(ids(r.groups[0].items), [2, 1]); // 05/11 antes de 03/11; a encerrada fica de fora
    assert.deepEqual(ids(r.groups[1].items), [4, 6, 5]); // apontado, depois 6 e 5 (mais nova primeiro)
    assert.deepEqual(ids(r.groups[2].items), [7, 8]);
  });

  it('recentes: as abertas apontadas há mais pouco, sem repetir nos grupos', () => {
    const r = searchDemands(all, '', { recentLimit: 3 });
    assert.deepEqual(ids(r.recent), [7, 2, 4]);
    assert.equal(r.groups.flatMap((g) => g.items).some((d) => [7, 2, 4].includes(d.id)), false);
  });

  it('com busca ou filtro de categoria, não há seção de recentes', () => {
    assert.deepEqual(searchDemands(all, 'portal').recent, []);
    assert.deepEqual(searchDemands(all, '', { category: 'chamado' }).recent, []);
  });

  it('com busca, ordena por relevância: começa com o termo, contém no nome, só na descrição', () => {
    const byName = summary(cycle(10, 'Migração do portal'), '2026-11-01');
    const startsWith = summary(cycle(11, 'Portal novo'));
    const inDescription = summary({ ...cycle(12, 'Outro ciclo'), description: 'Revisar o portal' }, '2026-11-05');
    const r = searchDemands([byName, inDescription, startsWith], 'portal');
    assert.deepEqual(ids(r.groups[0].items), [11, 10, 12]);
  });

  it('o filtro de categoria limita a lista e as contagens seguem valendo para todas', () => {
    const r = searchDemands(all, '', { category: 'ciclo' });
    assert.deepEqual(r.groups.map((g) => g.category), ['ciclo']);
    assert.equal(r.counts.chamado, 3);
    assert.equal(r.counts.ciclo, 2);
    assert.equal(r.counts.reuniao, 2);
  });
});

describe('encerradas', () => {
  it('ficam de fora por padrão e a quantidade volta para o botão', () => {
    const r = searchDemands(all, '');
    assert.equal(r.hiddenClosed, 1);
    assert.equal(r.showingClosed, false);
    assert.equal(r.groups.flatMap((g) => g.items).some((d) => d.id === 3), false);
  });

  it('a pedido, entram na lista', () => {
    const r = searchDemands(all, '', { includeClosed: true });
    assert.equal(r.hiddenClosed, 0);
    assert.equal(r.groups[0].items.some((d) => d.id === 3), true);
  });

  it('com busca cujo único resultado é encerrado, aparecem direto', () => {
    const r = searchDemands(all, 'antigo');
    assert.equal(r.showingClosed, true);
    assert.deepEqual(ids(r.groups.flatMap((g) => g.items)), [3]);
  });

  it('com busca que também acha abertas, as encerradas esperam o botão', () => {
    const closedPortal = summary(cycle(20, 'Portal antigo', 'concluido'), '2026-08-01');
    const r = searchDemands([...all, closedPortal], 'portal');
    assert.equal(r.showingClosed, false);
    assert.equal(r.hiddenClosed, 1);
  });
});

describe('trechos em negrito', () => {
  it('marca cada termo no texto original, sem diferenciar acentos nem maiúsculas', () => {
    assert.deepEqual(highlightRanges('Portal — ajuste no deploy', 'deploy PORTAL'), [[0, 6], [19, 25]]);
    assert.deepEqual(highlightRanges('Emissão da nota', 'emissao'), [[0, 7]]);
  });

  it('une trechos que se tocam e não marca nada sem busca', () => {
    assert.deepEqual(highlightRanges('abcdef', 'abc cde'), [[0, 5]]);
    assert.deepEqual(highlightRanges('abc', ''), []);
  });
});
