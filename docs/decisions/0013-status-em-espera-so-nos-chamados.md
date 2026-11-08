# 0013 — Chamado sem "Iniciado" e com "Em espera"

- **Data:** 2026-11-08
- **Status:** aceita
- **Contexto:** PLANO.md, seções 2, 9 e 10 (v0.14)

## Decisão

1. **Chamado:** Não iniciado, Em andamento, **Em espera** e Concluído. "Iniciado" deixa de existir nos chamados
   (`TICKET_STATUSES`, em `shared/src/demands.ts`).
2. **Treinamentos e atividades não mudam:** seguem com Não iniciado, Iniciado, Em andamento e Concluído
   (`TASK_STATUSES`). `statusesOf(categoria)` devolve a lista certa para formulário, seletor e validação.
3. **Em espera = aberto.** Segue no plano do dia, com o detalhe "(em espera)", e conta como em andamento nas
   métricas de tarefas.
4. **Banco (migração 9, junto com a 0012):** o CHECK do chamado troca `iniciado` por `em_espera`; os chamados
   `iniciado` viram `em_andamento`, e o histórico de status, igual; a troca que sobra `em_andamento →
   em_andamento` é apagada (a linha de declaração, com `from_status` nulo, fica). Datas de conclusão não mudam; a
   "última atualização" pode recuar se a troca apagada era a mais recente. O backup `pre-migracao-8.db` é automático.
5. **API:** `iniciado` em chamado → 400; `em_espera` em treinamento e atividade → 400.
6. **Visual:** "Em espera" em âmbar com ícone de ampulheta (a cor nunca é a única pista).

## Consequências

- Uma lista de status por família evita um status que não faz sentido numa categoria, ao custo de duas listas.
