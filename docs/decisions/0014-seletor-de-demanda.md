# 0014 — Seletor de demanda com busca no apontamento

- **Data:** 2026-11-08
- **Status:** aceita
- **Contexto:** PLANO.md, seções 3 e 9 (v0.15)

## Problema

O campo "Demanda" do apontamento era um `<select>` nativo: sem busca, uma linha de texto por opção, sem status nem data,
ordem fixa, "Recentes" e "Mostrar encerradas" fora do campo e, no celular, uma roleta com o texto cortado. Com muitas
demandas, achar e distinguir uma da outra ficava difícil.

## Decisão

Trocar o `<select>` por um **combobox com busca**, feito no projeto (`web/src/components/DemandPicker.tsx`), com as
regras de busca e ordem em `shared/src/demandSearch.ts` (puras e testadas). Sem mudança de API ou banco.

- Busca por nome, número, descrição e, nas reuniões, tipo, assunto e pessoas; sem acentos nem caixa; vários termos exigem todos.
- Pílulas de tipo com contagem; "Recentes" (5 abertas apontadas há mais pouco) só sem busca e sem filtro; grupos por tipo,
  a recência primeiro (com busca: começa com o termo, contém no nome, só na descrição).
- Opção em duas linhas (ícone, nome, status; descrição e "última vez"), com o termo em negrito e o selo de prazo nos ciclos
  próximos do prazo ou vencidos. Encerradas atrás de "Mostrar N encerradas", ou direto se forem o único resultado.
- Teclado e leitor de tela no padrão ARIA combobox com listbox. O Esc fecha só o seletor; no celular o painel ocupa a tela
  e tem botão para fechar. A rolagem da lista é feita à mão (`scrollIntoView` rolaria também o painel).
- O nome acessível do campo continua "Demanda"; a busca se chama "Buscar demanda".

## Alternativas

- **Só uma busca acima do `<select>`:** resolve só a busca.
- **Biblioteca (Downshift, Headless UI, cmdk):** dependência nova para um campo, contra o padrão de dependências mínimas.
- **Virtualização:** desnecessária; com 121 demandas a abertura levou ~70 ms. Reavaliar só se passar de centenas.

## Consequências

- Os testes de tela escolhem a demanda por `chooseDemand` (`web/test/render.tsx`).
- Os "Recentes" não se repetem nos grupos, então a contagem do título de um grupo pode ser menor que a da pílula.
- Favoritos fixados ficam fora desta versão.
