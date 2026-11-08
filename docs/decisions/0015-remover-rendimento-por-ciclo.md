# 0015 — Remover o "Rendimento por ciclo" do Painel

- **Data:** 2026-11-08
- **Status:** aceita
- **Contexto:** PLANO.md, seções 2, 3 e 12 (v0.15)

## Contexto

O bloco **Rendimento por ciclo** (Painel → Rendimento, v0.9) mostrava, por ciclo, o total no período, a variação sobre
o período anterior, os registros da linha do tempo e um mini-gráfico com a média dos dias anteriores. A gestão avaliou
que ele não trouxe o efeito esperado no rendimento dos colaboradores.

## Decisão

1. **Sai** o bloco (`CycleYieldChart`), a regra `cycleYield` e seus tipos (`YieldCycle`, `CycleYield`, `CycleYieldDay`).
2. **Fica** a visão Rendimento com o bloco **Tempo por categoria** (`categorySplit`, `familyOf`, `unplannedTime`), o
   Painel → Ciclos (mapa da linha do tempo), Detalhes → Ciclos e os relatórios, que nunca usaram `cycleYield`.
3. **API:** `GET /api/yield` não muda de nome nem de rota; a resposta perde `cycles` e `previous` (só o rendimento por
   ciclo usava este último, e nenhuma tela o lia). Foi aceito porque o app roda local e a tela é o único cliente.
4. **Nome da visão:** continua "Rendimento" (é o que o usuário conhece, e a preferência salva no navegador segue valendo).
   Rever com a gestão.
5. Sem migração e sem perda de dados: o bloco só lia e calculava na hora.

## Alternativas descartadas

- **Manter `previous` na resposta** para uma comparação futura com o período anterior: sem uso hoje; volta junto se for preciso.
- **Pôr outro sinal por ciclo no lugar:** o lugar natural seria o Painel → Ciclos, partindo do que os colaboradores usam de fato.

## Como voltar atrás

A remoção fica num commit só ("Painel: remove o Rendimento por ciclo"): `git revert` desse commit restaura tudo. O texto
antigo das regras está em `docs/HISTORICO.md`.
