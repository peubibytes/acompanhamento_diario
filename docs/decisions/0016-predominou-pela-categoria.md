# 0016 — "Predominou" pela categoria, não pela família

- **Data:** 2026-11-08
- **Status:** aceita
- **Contexto:** PLANO.md, seção 12 (v0.15)

## Contexto

O selo **Predominou** (Painel → Rendimento → Tempo por categoria) só dizia "Mais em Tarefas" ou "Mais em Ciclos".
"Tarefas" junta chamados, reuniões, treinamentos e atividades, e não ajuda a ver para onde o tempo foi.

## Decisão

1. **Concorrem as cinco categorias:** chamado, reunião, treinamento, atividade e ciclo. Treinamento entra (é uma
   categoria como as outras; sem ele, uma semana de estudo mostraria outra categoria como predominante).
2. **"Sem demanda" não concorre** (não é uma categoria que o colaborador escolhe), mas continua no total: a fatia é
   sempre sobre o tempo apontado inteiro. Só apontamentos antigos: ninguém predomina.
3. **Empate no topo:** o selo mostra as empatadas, na ordem da legenda ("Chamados e Reuniões · 30% cada"); com mais de
   duas, "Empate · 33% cada", com os nomes no `title` e no texto acessível. Sem tempo: "Sem apontamentos".
4. **Formato:** `predominant: { categories: DemandCategory[]; percent: number } | null`. O campo `family` saiu;
   `familyOf` e as horas em Tarefas e em Ciclos continuam.
5. O selo pode quebrar linha (em 320 px o texto mais longo, "Mais em Treinamentos · 100%", ocupa três linhas na coluna
   estreita). Cor: fica a de destaque; o ícone e o nome escritos são a pista.

## Consequências

- Com cinco categorias, a fatia de quem predomina cai ("Mais em Tarefas · 63%" vira "Mais em Chamados · 38%"). É esperado;
  avisar a gestão para não ler como piora.
- Sem mudança de rota, de banco ou do cálculo do tempo.
