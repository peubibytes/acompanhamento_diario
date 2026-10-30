# 0003 — O status existe só na demanda

- **Data:** 2026-10-29
- **Status:** aceita
- **Contexto:** PLANO.md, seção 10 (v0.7)

## Contexto

O apontamento tinha um status próprio (Concluído, Não concluído, Pendente de aprovação, Não
iniciado), independente do status da demanda. O formulário já vinha com "Concluído" marcado, então
quase todo apontamento ficava "Concluído" enquanto a demanda seguia "Em andamento". Nenhuma
métrica usava o status do apontamento.

## Decisão

1. **O apontamento não tem status.** O andamento (da tarefa ou do ciclo) vive só na demanda.
2. **Migração 5** remove `activities.status`. Os status diferentes de "Concluído" são preservados
   no fim de `notes` ("Status anterior: …."). A API ignora um `status` enviado por clientes antigos.
3. **O formulário mostra o status da demanda escolhida**, só para leitura, com o link "Alterar em
   Demandas": uma única fonte, sem segundo lugar para editar.
4. **Histórico de status** (migração 6, nos PRs seguintes): cada troca de status de uma demanda é
   registrada com data, para saber quando uma tarefa foi concluída e alimentar o relatório diário
   e as métricas de tarefas.

## Consequências

- O conceito "Pendente de aprovação" do apontamento deixa de existir como campo.
- As datas de conclusão de demandas anteriores ao histórico são aproximadas (`updated_at`).
