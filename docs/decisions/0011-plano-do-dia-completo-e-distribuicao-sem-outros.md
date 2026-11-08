# 0011 — Plano do dia completo, Distribuição sem "Outros" e meta de 9h

- **Data:** 2026-11-05
- **Status:** aceita (substitui parte da 0008: a fila do plano)
- **Contexto:** PLANO.md, seções 1, 6 e 10 (v0.13)

## Decisões

1. **Meta de 9h no lugar de 8h48.** O preset muda de 528 para 540 minutos; a meta semanal nessa opção vai a 45h.
   Sem migração: uma migração mudaria o `SCHEMA_VERSION` e inutilizaria as exportações já feitas. Uma meta
   gravada em 8h48 continua valendo e aparece como "Outro 08:48".
2. **Distribuição mostra todas as fatias.** Saem `foldSlices` e o grupo "Outros". Para isso funcionar: a paleta
   ganha 5 variações por tema (10 cores; depois repetem, e a legenda e o hover identificam a fatia); o espaço
   entre arcos é proporcional, com um arco mínimo visível; fatias abaixo de 1% mostram "<1%". `--series-other`
   fica, porque o Rendimento a usa em "Sem demanda".
3. **O plano do dia não tem mais "Na fila".** Entram todos os chamados e treinamentos em aberto, iniciados ou
   não (a 0008 deixava de fora os não iniciados). O selo "novo" passa a exigir chamado não iniciado e recém
   declarado. O `queued` de `GET /api/metrics` é outra métrica e não muda. Atividades continuam fora do plano (0009).
   O bloco de impressão passa a listar os treinamentos quando a frase cita "a lista abaixo".

## Consequências

- Com muitos chamados abertos, a frase cita a quantidade ("os 5 chamados da tabela abaixo"); as caixas de
  seleção continuam servindo para tirar itens.
- Um treinamento não iniciado sai como "seguirei no treinamento": não foi criada outra variação de frase.
