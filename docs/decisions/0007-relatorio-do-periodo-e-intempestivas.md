# 0007 — Relatório do período e o indicador de trabalho não planejado

- **Data:** 2026-11-02
- **Status:** aceita
- **Contexto:** PLANO.md, seções 8.4 e 13 (v0.10)

## Contexto

O relatório diário (v0.7) serve à daily. Para o 1:1 e a prestação de contas da semana ou do mês faltava um
resumo do período, e a seção 8.4 pedia também um indicador de demandas intempestivas: quanto do tempo foi
consumido por trabalho não planejado. Já existiam o período semanal e o mensal (`getPeriod`, v0.9) e a divisão
de sobreposições entre famílias do Rendimento.

## Decisão

1. **O Relatório ganha a escala Dia | Semana | Mês**, no canto superior esquerdo como no Painel, guardada na URL
   (`?escala=semana` ou `?escala=mes`; sem ela, o dia). Semana e mês usam a mesma navegação do Painel
   (`PeriodNav`) e, sem data, o período de hoje.
2. **O relatório do período fala do trabalho, como o diário:** ciclos que andaram (apontados, com troca de
   status, evento ou impedimento no período), com a troca de status do período, os dias de trabalho e os
   eventos da linha do tempo; tarefas concluídas e as demais trabalhadas; reuniões com o número de dias em que
   aconteceram; impedimentos que estiveram abertos no período. **Não lista o "o que foi feito" de cada
   apontamento**: num mês isso viraria uma lista longa; os eventos da linha do tempo são o resumo do ciclo.
   Também não tem "O que será feito".
3. **Trabalho não planejado = ciclos do tipo Intempestiva.** Só os ciclos têm tipo; tarefas e reuniões entram
   só no total. A fatia é `tempo em intempestivas ÷ tempo apontado no período`, com a mesma regra de
   sobreposição do Tarefas × Ciclos (dentro do grupo conta uma vez; entre grupos, divide igualmente), para nunca
   passar do total do dia. É a única medida de tempo do relatório, porque é o que a seção 8.4 pede.
4. O indicador aparece no **relatório do período** (seção "Trabalho não planejado") e no **Painel → Rendimento**
   (selo "Não planejado"). Regras em `shared/src/periodReport.ts` e `shared/src/yield.ts` (`unplannedTime`);
   rota nova `GET /api/reports/period` e o campo `unplanned` em `GET /api/yield`. Nenhuma rota existente muda.

## Consequências

- Um chamado urgente não conta como não planejado: para entrar no indicador, o trabalho precisa ser declarado
  como ciclo intempestivo. Se isso se mostrar pouco, a alternativa é dar tipo também às tarefas (migração).
- O relatório do período é montado na hora, como o diário: nada é gravado.
- A divisão de sobreposições passou a ser uma função só (`splitDay`), usada pelo Tarefas × Ciclos e pelas
  intempestivas.
