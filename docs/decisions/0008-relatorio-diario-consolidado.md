# 0008 — Relatório diário consolidado: dois tópicos abertos por frases

- **Data:** 2026-11-04
- **Status:** aceita
- **Contexto:** PLANO.md, seções 3 (tela 6), 8.4 e 10 (v0.11)

## Contexto

O relatório diário (v0.7) tinha três seções (o que foi feito, impedimentos, o que será feito) e listava cada
ciclo, tarefa e reunião em grupos. Para a daily, faltava o que se lê em voz alta: um resumo com números e uma
frase do que foi feito e do que vem a seguir. Os registros também chegavam soltos (o mesmo texto repetido com
outra caixa, espaços e pontuação sobrando).

## Decisão

1. **Dois tópicos, nesta ordem:** "O que foi feito ontem" e "O que será feito hoje". Fora de ontem e hoje, os
   títulos e as frases dizem o dia ("na sexta-feira (30/10)"). Impedimentos deixam de ser um tópico: os abertos
   entram no fim do segundo (o que vai travar o dia) e os resolvidos no dia entram como ação do ciclo.
2. **Frase de métricas:** "Ontem, atendi X chamados, participei de Y reuniões e fiz Z de demandas de Ciclo."
   X = chamados trabalhados no dia; Y = reuniões distintas apontadas; Z = horas em ciclos (união dos intervalos).
   Treinamentos entram ("avancei em N treinamentos") só quando houve. **Exceção à regra da v0.7** de não mostrar
   horas no diário: só o total em ciclos, como pede o formato.
3. **Frase de detalhamento:** "Atendi aos chamados (número – descrição), entrei em reunião com (pessoas), e fiz
   minhas demandas de ciclo: (ciclo (ações))". As pessoas das reuniões são juntadas sem repetir; as ações do ciclo
   são o "o que foi feito" dos apontamentos, os eventos da linha do tempo e os impedimentos resolvidos no dia.
4. **Frase de planejamento:** "Para hoje, buscarei encerrar os chamados (…) e atuarei nas demandas (…)". Entram os
   chamados que ficaram (iniciados ou em andamento), os chamados novos (declarados no dia do relatório ou depois,
   marcados "novo"), os treinamentos iniciados e os ciclos abertos já começados. O resto vai para "Na fila".
   Desmarcar um item na tela tira-o da frase.
5. **Mais de três itens de um tipo:** a frase cita a quantidade ("os 5 chamados da tabela abaixo") e os itens vão
   para uma tabela leve (chamados, ciclos) ou lista (reuniões, treinamentos).
6. **Consolidação:** `tidyText` arruma a digitação (espaços, espaço antes da pontuação, pontuação repetida, ponto
   final) e textos iguais a menos de caixa, acento ou pontuação aparecem uma vez. O conteúdo não é reescrito.
7. **Saída sem introdução:** o Markdown começa no título "# Daily — dd/mm" e segue os dois tópicos, pronto para
   colar ou integrar. Regras em `shared/src/report.ts`; o relatório do período (seção 13) não muda.

## Consequências

- A API `GET /api/reports/daily` muda de forma: `done.tasks` vira `done.tickets` e `done.trainings`, com
  `people` e `cycleMinutes`; `next` passa a existir sempre, com `tickets`, `trainings`, `cycles` e `queued`.
- O tópico de impedimentos sai da tela e do Markdown do diário (os dados continuam em `blockers`).
