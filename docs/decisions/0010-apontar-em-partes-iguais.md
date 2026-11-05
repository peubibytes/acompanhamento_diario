# 0010 — "Apontar": o valor de cada apontamento quando há horários sobrepostos

- **Data:** 2026-11-05
- **Status:** aceita
- **Contexto:** PLANO.md, seções 1, 6 e 9 (v0.12)

## Contexto

Quando dois apontamentos se sobrepõem, cada um mostra a sua duração de início a fim, mas o total do dia conta o
trecho em comum uma vez. Ao lançar as horas no Azure (fora do aplicativo), a soma das durações passa do total e
sobram horas. O aplicativo já divide o trecho sobreposto em partes iguais na Distribuição e no Rendimento.

## Decisão

1. Cada apontamento mostra **"Apontar X"**: o que lançar nele. Cada trecho de tempo é dividido em partes iguais
   entre os apontamentos que o ocupam; sem sobreposição, o valor é a própria duração.
2. Minutos inteiros pelo maior resto: a soma dos "Apontar" do dia é sempre o total do dia.
3. É um valor **calculado na tela**: sem campo, tabela ou rota novos. Não é integração com o Azure (que segue
   fora de escopo) nem expande o módulo de apontamento: não muda horas, metas nem conformidade.
4. Na visão **Por demanda**, o cabeçalho do grupo mostra a soma dos "Apontar" do grupo.

## Consequências

- Uma fatia pode diferir em 1 minuto da Distribuição, que arredonda por demanda e não por apontamento.
- Dividir de outro jeito (uma demanda com prioridade) exigiria uma regra nova; fica como evolução.
