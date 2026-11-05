# 0009 — Categoria Atividade e seção própria no relatório

- **Data:** 2026-11-05
- **Status:** aceita
- **Contexto:** PLANO.md, seções 0, 2, 9, 10 e 13 (v0.12)

## Contexto

Havia trabalho que não cabia em nenhuma categoria: documentação sem relação com um ciclo ou chamado, busca de
informações para ajudar outro colaborador, busca de kits mensais, repasses e alinhamentos. Sem onde declarar,
ele ficava sem apontamento ou era encaixado numa categoria errada, o que distorcia os números do relatório.

## Decisão

1. **Nova categoria `atividade`** na família Tarefas, com nome, descrição e status (os 4 do treinamento; o
   formulário começa em "Em andamento"). Sem número nem prazo. Tipo no código: `GeneralDemand`; "Atividade" já
   foi o nome da família Tarefas até a v0.6, e `activity` segue sendo o apontamento.
2. **Não entra em números:** a frase e os indicadores do relatório diário, o resumo do relatório do período e
   "Demandas cumpridas" ignoram atividades.
3. **Seção própria no relatório:** "Outras atividades", dentro de "O que foi feito", no diário (tela e
   Markdown), no semanal e no mensal. Traz o nome, a situação e o que foi feito; sem contagens nem horas.
   Fica fora das frases de resumo, detalhamento e planejamento.
4. **Fora de "O que será feito":** atividades costumam ser reativas; não entram no plano.
5. **O tempo apontado entra no total e em Tarefas** (Rendimento, com cor e ícone próprios). Não conta como
   trabalho não planejado: esse indicador segue só com ciclos intempestivos (decisão 0007).
6. **Migração 8** recria `demands` para aceitar a categoria no CHECK (mesmo padrão da migração 4); nenhuma linha
   muda. Exportações de esquema 7 não importam mais (a importação exige a mesma versão do esquema): exporte de
   novo depois de atualizar.

## Consequências

- O relatório fica fiel ao que foi feito sem inflar os números; em troca, atividades não aparecem no plano do dia.
- Se atividades passarem a contar como não planejadas, o `unplannedTime` precisa de um critério (hoje só os
  ciclos têm tipo).
