# 0005 — "Período" no lugar de "ciclo" de apontamento

- **Data:** 2026-11-01
- **Status:** aceita
- **Contexto:** PLANO.md, glossário e seção 1 (v0.9)

## Contexto

A palavra "ciclo" tinha dois sentidos na interface: o **ciclo de apontamento** (sexta → quinta, a
janela das metas e das métricas) e o **Ciclo** como demanda de trabalho longo (categoria `ciclo`).
O Painel mostra os dois lado a lado ("Ciclo atual" ao lado da visão "Ciclos"), o que confunde. A
v0.9 ainda acrescenta a escala mensal, que não cabe no nome "ciclo (sexta → quinta)".

## Decisão

1. Na interface, a janela de tempo do apontamento passa a se chamar **Período** (semana de sexta a
   quinta ou, a partir da v0.9, mês civil). "Ciclo" fica reservado à demanda.
2. **Só textos visíveis mudam** ("Período atual", "Período anterior", "Próximo período", "neste
   período", "Fechamento do período"…). Código, tabelas, rotas e a API mantêm `cycle`
   (`getCycle`, `/api/cycles/:date`, `cycle_goals`).
3. Os textos sobre o ciclo-demanda (prazo, início, tipo, linha do tempo) não mudam.

## Consequências

- Nada é renomeado nem migrado; é uma mudança de vocabulário.
- Quem lê o código encontra `cycle` onde a interface diz "Período". O glossário do PLANO.md registra
  a correspondência.
