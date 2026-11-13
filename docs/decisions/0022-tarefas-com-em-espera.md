# 0022 — Treinamento e atividade sem "Iniciado" e com "Em espera"

- **Data:** 2026-11-13
- **Status:** aceita
- **Contexto:** PLANO.md, seções 2, 8.2, 9, 10 e 14 (v0.19); estende a decisão 0013 (chamado) e ajusta a 0017 (Kanban)

## Contexto

Desde a v0.14 (decisão 0013), o chamado tem Não iniciado, Em andamento, **Em espera** e Concluído. Treinamentos e
atividades ficaram com Não iniciado, **Iniciado**, Em andamento e Concluído. No Kanban (decisão 0017), "Iniciado" e
"Em andamento" caem na mesma coluna, e a coluna "Aguardando" não tinha status para eles: ficava apagada, e um
treinamento ou uma atividade parados à espera de alguém não podiam ir para lá.

## Decisão

1. **Treinamento e atividade passam a ter os status do chamado:** Não iniciado, Em andamento, **Em espera** e
   Concluído (`TASK_STATUSES` em `shared/src/demands.ts`). "Iniciado" deixa de existir em todas as categorias.
2. **Kanban:** "Aguardando" recebe treinamento e atividade como "Em espera" (`statusForColumn`); a coluna não fica
   mais apagada para eles. Só a reunião segue fora do quadro.
3. **Banco (migração 11):** a tabela `demands` é recriada (o CHECK muda) com `board_rank` preservado. Os treinamentos
   e atividades `iniciado` viram `em_andamento`, e o histórico de status, igual; a troca que sobra `em_andamento →
   em_andamento` é apagada (a declaração, com `from_status` nulo, fica), como na migração 9. O backup
   `pre-migracao-10.db` é automático.
4. **API:** `iniciado` → 400 em qualquer categoria; `em_espera` passa a valer em treinamento e atividade.
5. **Visual e relatório:** "Em espera" em âmbar com a ampulheta, como no chamado. Em espera = aberto: segue no plano do
   dia e conta como em andamento nas métricas de tarefas.

## Consequências

- `TASK_STATUSES` e `TICKET_STATUSES` ficam com os mesmos valores; as duas listas continuam separadas para a validação
  por categoria seguir explícita e permitir divergir no futuro.
- Uma exportação feita antes da migração tem outro `schemaVersion` e não é importada (regra da v0.10).
