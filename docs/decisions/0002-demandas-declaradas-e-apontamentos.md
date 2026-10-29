# 0002 — Demandas são declarações; horas só em Apontamentos

- **Data:** 2026-10-28
- **Status:** aceita (substitui parte da 0001)
- **Contexto:** PLANO.md, seção 9

## Contexto

Até a v0.4, a tela "Atividades" registrava horas com um projeto digitado à mão e um vínculo
opcional com uma demanda, e as demandas tinham meta de horas. Assim, a mesma coisa feita em
horários diferentes (a Daily de cada dia, um chamado retomado à tarde) virava registros soltos,
com nomes digitados de jeitos diferentes.

## Decisão

1. **Demandas são declarações, sem horas.** Duas famílias:
   - **Atividades** (rotina): **chamado** (número único, descrição, status), **reunião** (tipo,
     com quem, assunto; sem status) e **treinamento** (nome, descrição, status);
   - **Ciclo**: nome do projeto, tipo, status, prioridade, descrição, início, prazo opcional e
     vínculos técnicos, com linha do tempo e impedimentos.
2. **Apontar exige uma demanda declarada.** A tela "Atividades" passa a se chamar
   **Apontamentos** (`/apontamentos`; `/atividades` redireciona). O "projeto" da planilha passa a
   ser o nome da demanda, gravado pelo servidor e atualizado quando a demanda é renomeada.
3. **Nomes técnicos mantidos.** A tabela `activities` e a rota `/api/activities` continuam com o
   nome histórico (a regra do projeto exige aprovação para renomear); no código, `Activity` é o
   apontamento.
4. **Uma tabela `demands` com `category`.** Colunas fora da categoria ficam nulas, e CHECKs por
   categoria garantem os obrigatórios. `activities.demand_id` continua sendo uma única chave
   estrangeira. A migração 4 recria a tabela com o mesmo nome; as demandas existentes viram
   ciclos, e os campos que deixaram de existir (meta de horas, % de progresso, identificadores,
   sistema) são preservados no fim da descrição.
5. **Integridade das horas.** Uma demanda com apontamentos não pode ser excluída (409). O tipo de
   uma demanda não muda depois de declarado. Chamado com o mesmo número ou reunião idêntica não
   são declarados duas vezes (409).
6. **Status dos chamados e treinamentos:** Não iniciado, Iniciado, Em andamento, Concluído, como
   pedido. Reuniões não têm status e ficam sempre disponíveis para apontar.

## Consequências

- Apontamentos anteriores à v0.5, sem demanda, são mantidos e contam nas métricas; a tela os
  sinaliza e pede uma demanda ao editar.
- Sem meta de horas, o ciclo perde "ritmo necessário" e "em risco"; o painel compara as horas
  apontadas entre os ciclos abertos.
- "Ciclo" passa a nomear duas coisas: o ciclo de apontamento (sexta → quinta) e a família de
  demandas longas. O glossário do PLANO.md distingue as duas.
