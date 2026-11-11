# 0017 — Kanban: as demandas por andamento, na ordem de prioridade do colaborador

- **Data:** 2026-11-10
- **Status:** aceita
- **Contexto:** PLANO.md, seção 14 (v0.16)

## Contexto

A gestão pediu um Kanban: o colaborador precisa ver o que tem em mãos e decidir o que é mais importante. A tela
Demandas lista por tipo (um tipo por vez) e não deixa dizer "isto vem antes daquilo": só os ciclos têm prioridade
declarada, e ela não ordena um chamado em relação a um ciclo.

## Decisão

1. **Uma tela nova, `/kanban`**, no menu entre Demandas e Detalhes. É uma visão das demandas que já existem: nada
   novo se declara só para o quadro, e o módulo de Apontamento não muda.
2. **A coluna vem do status** (não há "coluna" gravada). Quatro colunas servem às quatro categorias com status:

   | Coluna | Ciclo | Chamado | Treinamento e atividade |
   |---|---|---|---|
   | A fazer | Novo | Não iniciado | Não iniciado |
   | Em andamento | Em andamento | Em andamento | Iniciado, Em andamento |
   | Aguardando | Aguardando terceiro, Em homologação | Em espera | — |
   | Concluído | Concluído | Concluído | Concluído |

   Soltar um cartão numa coluna grava o primeiro status da célula (ex.: ciclo em "Aguardando" vira "Aguardando
   terceiro"); o status exato (Em homologação, Iniciado, Cancelado) se escolhe no seletor do cartão. Treinamento e
   atividade não têm "Aguardando": a coluna recusa o cartão e diz por quê.
3. **Ficam de fora:** reuniões (não têm status), ciclos cancelados e o que foi concluído há mais de 7 dias
   (`BOARD_DONE_DAYS`); tudo isso continua em Demandas.
4. **A ordem dentro da coluna é a prioridade**, e é do colaborador: fica gravada em `demands.board_rank`
   (migração 10). Cada movimento regrava a coluna de destino inteira (1 = topo), inclusive o que um filtro esconde.
   O que ainda não foi ordenado vem depois, por prazo (vencido, hoje, próximo), prioridade do ciclo e ordem de
   declaração. "Concluído" não tem ordem manual: o mais recente primeiro.
5. **A prioridade do ciclo (baixa → urgente) continua existindo** e aparece no cartão (alta e urgente). Ela é uma
   declaração sobre o ciclo; a ordem do quadro é a fila de trabalho. Uma não reescreve a outra.
6. **Uma rota nova, `PUT /api/board`** (`{ demandId, status?, order? }`): troca o status (com a linha no histórico,
   como `PUT /api/demands/:id/status`) e regrava a ordem numa transação só. `GET /api/demands` passa a trazer
   `boardRank`. Nenhuma rota existente muda.
7. **Arrastar não é o único caminho.** Cada cartão tem o seletor de status e as setas de subir e descer, que fazem
   o mesmo pelo teclado e pelo leitor de tela. O arrasto usa eventos de ponteiro, sem dependência nova: com o
   mouse, o cartão inteiro; no toque, só a pega, para o dedo continuar rolando a página.
8. **No celular, uma coluna por vez** (abas no topo). Mudar de coluna ali é pelo seletor do cartão.
9. **O cartão aparece no lugar novo na hora** e volta se o servidor recusar.

## Consequências

- A ordem do quadro ainda não é usada fora dele. O plano do relatório diário ("O que será feito hoje") segue a
  ordem de sempre; usar a do quadro é um passo natural, a decidir com a gestão.
- `board_rank` só é comparado entre demandas da mesma coluna; ao mudar de coluna, a demanda entra na ordem da nova.
- A exportação leva a coluna nova sem mudança (o formato é genérico); importar exige o esquema 10.
- A barra inferior do celular passa a ter seis telas; "Apontamentos" aparece ali como "Apontar" (o leitor de tela
  ouve o nome inteiro).
