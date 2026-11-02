# 0006 — Fluxo de branches: uma entrega, um PR, uma tag por versão

- **Data:** 2026-11-01
- **Status:** aceita
- **Contexto:** PLANO.md, seção 12 (v0.9) e fases da v0.10

## Contexto

Até a v0.9 o trabalho foi feito em branches de nomes variados (`v0.7-tarefas`, `v0.7-painel`,
`feat/nome-da-mudanca`, `feat/expansaoCiclos`…), a maioria só local e empilhada uma sobre a outra, e a
`main` ficou parada atrás delas por dias. Sobraram onze branches locais para conferir à mão antes de saber
o que já estava integrado, e nenhuma tag marcava onde cada versão terminou.

## Decisão

1. **`main` é a única linha estável.** Tudo o que está nela passou por `npm run typecheck`, `npm test` e
   `npm run check:sensitive` (no CI, a partir da v0.10).
2. **Uma branch por entrega**, criada a partir da `main` atualizada, com nome `feat/<assunto>`,
   `fix/<assunto>` ou `docs/<assunto>` (a v0.10 usa `feat/v0.10-<assunto>`). Nada de empilhar uma entrega
   em cima de outra sem integrar a primeira.
3. **Um commit por fase** dentro da entrega, em pt-BR, no estilo do `git log`.
4. **Integração por Pull Request para a `main`**, com merge commit (cada PR vira um ponto nomeado na
   história e o histórico por fase é preservado). Quem aprova e integra é o dono do repositório.
5. **Tag anotada `vX.Y.Z` na `main` a cada versão**, depois do merge (`v0.9.0` é a primeira).
6. **Depois do merge, a branch é apagada**, local e remota (`git branch -d` só apaga o que já está na
   `main`). Branch nova só nasce da `main` atualizada.
7. Mudança de comportamento atualiza o `docs/PLANO.md` no mesmo PR; decisão nova de escopo ou arquitetura
   ganha um arquivo em `docs/decisions/`.

## Consequências

- A lista de branches vira um retrato fiel do que está em andamento: o que não está na `main` é trabalho aberto.
- Cada versão pode ser reconstruída a partir da tag, e um problema novo se localiza pelo PR que o trouxe.
- Entregas dependentes (a v0.9 dependia da v0.8) esperam o merge da anterior, em vez de empilhar branches.
- As branches locais antigas (v0.3 a v0.9) foram apagadas depois de conferidas contra a `main`; as remotas já
  integradas saem pelo GitHub (a opção "apagar a branch" ao fazer o merge do PR evita o acúmulo).
