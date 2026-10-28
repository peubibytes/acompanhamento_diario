# 0001 — Demandas de ciclo viram chamados estendendo a tabela `demands`

- **Data:** 2026-10-28
- **Status:** aceita; parcialmente substituída pela [0002](0002-demandas-declaradas-e-apontamentos.md)
  (estas demandas viraram os Ciclos; meta de horas, % de progresso e identificadores saíram)
- **Contexto:** PLANO.md, seção 8.1

## Contexto

A v0.2 criou as "demandas de ciclo" (título, meta de horas, início, prazo, ativa/concluída).
A v0.4 precisa acompanhar chamados: identificadores externos, tipo, prioridade, % de progresso,
status de fluxo, linha do tempo e impedimentos. As regras do projeto proíbem renomear tabelas
ou rotas públicas sem migração e aprovação, e pedem que novas features entrem via Demanda e Atividade.

## Decisão

1. **Estender `demands`, sem criar uma tabela `tickets` nem renomear nada.** As rotas
   `/api/demands` continuam; eventos e impedimentos entram como sub-rotas.
2. **Meta de horas opcional.** Um chamado nem sempre tem estimativa. Sem meta, a demanda mostra
   as horas apontadas e o % de progresso informado; prazo e lembretes continuam valendo.
   Como o SQLite não altera `CHECK`/`NOT NULL`, a migração recria a tabela com o mesmo nome,
   copiando os dados, com as chaves estrangeiras desligadas durante a troca.
3. **Status em 6 estados** (novo, em andamento, aguardando terceiro, em homologação,
   concluído, cancelado). Migração: `ativa → em_andamento`, `concluida → concluido`.
   "Abertas" = os quatro primeiros; o filtro `?status=` aceita um status ou `abertas`/`encerradas`.
4. **Identificadores externos como lista JSON** numa coluna de texto, normalizados em maiúsculas.
   Uma demanda pode ter vários (SCTASK, RITM, user story); a checagem de duplicados é feita nas regras (`shared`).
5. **Eventos e impedimentos em tabelas próprias** (`demand_events`, `demand_blockers`), removidos
   junto com a demanda (`ON DELETE CASCADE`).

## Consequências

- O cliente web e os lembretes passam a usar "abertas" em vez de `status === 'ativa'`.
- Demandas sem meta não entram na soma de metas do gráfico do painel.
- Bancos antigos são atualizados automaticamente ao iniciar o servidor (migração 3).
