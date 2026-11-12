# 0019 — Seletor de categoria: todas as categorias à vista, em chips

- **Data:** 2026-11-11
- **Status:** aceita
- **Contexto:** PLANO.md, seções 3, 7, 9 e 14, v0.17

## Contexto

Em Demandas e no Kanban, o filtro por tipo de demanda (chamado, reunião, treinamento, atividade, ciclo) era um menu
nativo (`FilterSelect`). A gestão o achou "simples e feio", e havia problemas além da aparência:

- **As opções ficavam escondidas.** A categoria é a navegação principal das duas telas, mas só se descobria que
  existiam treinamentos ou atividades abrindo o menu.
- **Em Demandas, uma escolha pedia dois controles:** as abas Tarefas | Ciclo e, só em Tarefas, o menu do tipo. O Ciclo
  ficava um nível acima dos outros tipos sem ganho para quem usa.
- **A identidade dos tipos não aparecia.** Cada tipo já tinha ícone (`categoryIcon`) e cor fixa (a do Rendimento), e o
  menu não mostrava nenhum dos dois.
- **As contagens não conversavam:** total no menu de Demandas, abertas na aba, cartões no quadro no Kanban, sempre
  entre parênteses.
- O menu abre com o desenho do sistema operacional, diferente em cada navegador e destoante do controle segmentado
  usado ao lado.

## Decisão

1. **Um componente, `CategoryFilter`** (`web/src/components/CategoryFilter.tsx`), nas duas telas: uma barra de chips,
   todas as opções à vista. Cada chip tem o ícone do tipo na cor do tipo, o nome no plural e a contagem num selo.
2. **Escolhido:** fundo suave na cor do tipo (14% sobre `surface`), anel de 1px e texto forte. A cor nunca é a única
   pista: o anel e o peso do texto também mudam. Contagem zero deixa o chip apagado, mas clicável.
3. **Cor como token único:** `--cat-<tipo>` (preenche: gráficos e fundo do chip) e `--cat-<tipo>-ink` (desenha: ícone
   e anel; a variante "b" da paleta, com contraste ≥ 3:1 nos dois temas). `categoryColor` e `categoryInk`, em
   `DemandVisuals.tsx`, expõem os dois; o Rendimento passou a usar `categoryColor`, então a cor de um tipo é a mesma
   no app inteiro.
4. **Demandas: uma barra só.** Saem as abas Tarefas | Ciclo e o menu: Chamados, Reuniões, Treinamentos, Atividades,
   um divisor e Ciclos. O divisor mantém a ideia de família sem um segundo controle. A contagem é a das **abertas**
   (reunião não tem status: conta as declaradas). O filtro de status continua à direita.
5. **Kanban:** Todos, um divisor e Chamados, Ciclos, Treinamentos e Atividades (reunião não entra no quadro). A
   contagem é a de cartões no quadro.
6. **Acessibilidade:** `role="radiogroup"` com chips `role="radio"` e `aria-checked`; só o escolhido recebe o Tab;
   ←/→ (e ↑/↓), Home e End trocam a escolha. O nome acessível traz a contagem ("Chamados, 3 em aberto").
7. **Celular:** os chips quebram linha, sem rolagem horizontal. Abaixo de 640 px ficam mais compactos (texto `xs`,
   menos espaço); o nome nunca é cortado. Em 390 px cabem em duas linhas; em 360 e 320 px, em três.
8. **Não muda:** a URL (`?tipo=`), as rotas, o banco e o seletor de tipo do painel "Declarar demanda". O
   `FilterSelect` continua existindo para Detalhes → Ciclos.

## Consequências

- Quem chega a Demandas vê de uma vez todos os tipos e quantos estão em aberto em cada um, e troca de tipo com um
  clique em vez de dois.
- A cor de um tipo agora é uma promessa do sistema: mudar `--cat-*` muda o gráfico e o filtro juntos.

## Atualização (v0.18, decisão 0020)

O mecanismo do item 3 continua (um token por tipo, `--cat-<tipo>` e `--cat-<tipo>-ink`), mas qual cor vai para cada
tipo passou a seguir o significado: treinamento azul (conhecimento), chamado laranja (ação e resposta), ciclo verde
(crescimento), reunião amarelo (comunicação) e atividade rosa (cuidado e apoio), sobre os mesmos 5 tons. Os chips
trocaram a pílula pelo raio de controle e ganharam borda em repouso. O resto desta decisão não muda.
- A barra ocupa mais espaço que o menu. Na largura de notebook cabe numa linha ao lado do status; no celular ocupa
  duas ou três linhas.
- O último tipo de tarefa escolhido não é mais lembrado (a aba Tarefas o usava); não faz falta, porque todos os tipos
  estão a um clique.
