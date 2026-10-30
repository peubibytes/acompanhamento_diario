# 0004 — Impedimentos dentro da linha do tempo, com bandeira

- **Data:** 2026-10-30
- **Status:** aceita
- **Contexto:** PLANO.md, seção 11 (v0.8)

## Contexto

Em Demandas, o acompanhamento de um ciclo tinha as abas "Linha do tempo" e "Impedimentos". O tipo de
evento **Impedimento** (texto livre) e a aba **Impedimentos** (responsável, início, resolução)
falavam da mesma coisa em dois lugares. Além disso, com o tempo a linha do tempo acumula registros
e não havia como filtrar por tipo nem destacar os que importam.

## Decisão

1. **A tabela `demand_blockers` continua sendo a fonte** da espera, do relatório diário e dos
   lembretes. Os impedimentos passam a aparecer **dentro da linha do tempo** (e a aba
   "Impedimentos" deixa de existir). Escolher o tipo "Impedimento" na entrada rápida pede o
   responsável e grava um registro em `demand_blockers`, não um evento.
2. **Eventos antigos do tipo Impedimento** (só texto, sem responsável) são mantidos como estão e
   contam no tipo Impedimento. Convertê-los inventaria responsáveis e deixaria impedimentos
   "abertos desde sempre", distorcendo a espera.
3. **Bandeira persistida** (`flagged`, migração 7) em eventos e impedimentos. Rotas próprias de
   marcação (`.../flag`), para que um PUT de edição não a apague.
4. **Análise em Detalhes → Ciclos:** filtro por ciclo, tipo e marcados; métricas da lista
   filtrada. Padrão: todos os ciclos abertos.
5. **Painel → Ciclos:** a barra de horas dá lugar a um mapa da linha do tempo em serpentina
   (esquerda → direita, desce, direita → esquerda).

## Consequências

- Nada é apagado nem renomeado: a mudança é de exibição, mais uma coluna em cada tabela.
- A "última atualização" de um ciclo passa a considerar o início e a resolução de impedimentos.
