# 0021 — Sistema visual "Andon": industrial, sem vícios de interface gerada

- **Data:** 2026-11-13
- **Status:** aceita (validada em 13/11/2026)
- **Contexto:** PLANO.md, seções 3 e 7, v0.19; ajusta a decisão 0020 ("Precisa") sem desfazer a base dela

## Contexto

A aplicação é usada em empresas, pelos colaboradores, como ferramenta de trabalho. A direção "Precisa" (0020) acertou a
base (densa, bordas em vez de sombras, números como dado, cor com significado), mas a pele ainda tinha as escolhas padrão
de interface gerada por IA. Uma auditoria das telas, com dados fictícios, listou treze vícios; os principais:

- **Roxo-íris como marca** (o índigo padrão de shadcn/Linear) e o logo de ícone num quadrado arredondado.
- **Geist e Geist Mono**, o par padrão da Vercel; a hora em mono ("3h30") parecendo código.
- **Faixa de quatro KPIs** (rótulo cinza e número grande) e o **anel de progresso**, que repetia Total ÷ Meta;
  "Demandas cumpridas 0" ocupava um quarto da faixa. (Na validação, ficou decidido manter o layout dos indicadores.)
- **ⓘ e sobrancelhas em caixa alta** ("PERÍODO ATUAL") por toda parte.
- **Tudo em pílula** (segmentados, chips, status, "Hoje") e cartão branco de raio 10 sobre fundo cinza.
- **Frase com filete colorido à esquerda** no relatório.

Uma primeira proposta ("Livro de Ponto": papel, serifa, marca-texto) foi recusada: o produto deve manter o modelo
industrial. A segunda, **Andon**, foi aprovada para teste.

## Decisão

1. **Sem cor de marca.** A ação principal, o foco e o item escolhido são pretos (no escuro, claros): o destaque é a
   **inversão**, como etiqueta de máquina. `--accent` passa a ser esse preto; sai o íris.
2. **Barra do topo em grafite** (`--chrome`, nos dois temas), com o nome em Barlow Condensed caixa alta
   ("ACOMPANHAMENTO DIÁRIO"; "AD" entre 640 e 1024 px) e as telas em abas; a atual se encaixa na página (o fundo dela).
   No celular, a barra inferior também é grafite.
3. **Fontes:** Barlow no texto e **Barlow Condensed** (desenho DIN, a letra das placas e painéis) no número como dado
   (`.num`, `.kpi-value`) e nos títulos (`.title-plate`). Algarismos tabulares em toda a página. O token segue
   `--font-mono` para não mexer nas telas.
4. **Cantos retos:** todos os raios em 2px (`rounded-badge`, `-control`, `-card` e `lg/xl/2xl`). Painéis (`.card`) com
   uma régua preta de 2px em cima.
5. **Andon** (`.andon[data-tone]`, `AndonCell` em `Badges.tsx`): o sinal do dia como a luz de uma máquina, uma célula
   preenchida — verde **Conforme**, âmbar **Abaixo**, vermelho **Irregular**, cinza **Pendente** —, sempre com ícone e
   rótulo dentro. Tokens `--andon-*` com o texto de cada um (contraste AA).
6. **Painel → Dia útil:** os indicadores (anel de preenchido com o selo da situação, total realizado, meta e demandas
   cumpridas) e o gráfico "Horas por dia útil" ficam como na v0.18, só com a pele nova (decidido na validação). Na
   semana, abaixo, um segundo cartão com a **linha do turno** de cada dia (ver o item 7). Um "quadro de produção"
   (tabela dia a dia com o andon) foi proposto e **não foi aprovado**. Com o cartão a mais, o Dia útil na semana deixa
   de caber na janela (`fit-viewport`) e cresce com o conteúdo; no mês, sem a linha do turno, segue cabendo.
7. **Apontamentos:** as abas dos dias numa faixa encaixada, a escolhida invertida, com o andon embaixo de cada uma (sai
   a barrinha de progresso); a **linha do turno** do dia (`ShiftLine`: de 8h a 20h, a escala se alarga se preciso, com
   os apontamentos em blocos na cor do tipo e a legenda com a sigla — CIC, CHM, REU, TRE, ATV — e as horas) aparece
   acima da lista quando há apontamento.
8. ~~**Kanban:** cabeçalho de coluna em grafite com uma faixa de sinal embaixo (neutro, azul, âmbar, verde); o cartão
   como ordem de serviço: a posição numa etiqueta preta e o tipo pela sigla com o quadradinho da cor.~~ **Desfeito
   (13/11/2026):** não aprovado no uso; o Kanban voltou ao visual da v0.18 (cabeçalho com ícone, nome e contagem sobre o
   fundo da coluna; no cartão, a posição em número simples e o ícone do tipo). A pele global (fontes, raios, cores) segue valendo.
9. **Controles retos e encaixados:** segmentados com o escolhido em preto (o fundo ainda desliza até ele), seletor de
   categoria com o escolhido invertido (a cor do tipo vai para o quadradinho ao lado), navegação de período e de dia
   como um controle só (‹ período ›), com a situação em caixa normal ("Período anterior · Sex 06/11 → Qui 12/11").
10. **Relatório:** a frase de abertura em destaque pelo peso, sem filete; os indicadores mantêm o layout da v0.18.
11. **Cores dos tipos:** os significados da 0020 ficam (treinamento azul, chamado laranja, ciclo verde, reunião amarelo,
    atividade rosa), em tons de sinalização mais saturados, com as variantes `-ink` revistas para contraste ≥ 3:1.

## O que não muda

Rotas, regras, textos, dados e o movimento (decisão 0018: as mesmas classes e durações). O ⓘ (`InfoHint`) continua;
reduzir o número deles fica para uma próxima etapa.

## Consequências

- Um teste muda: o Dia útil na semana deixa de usar `fit-viewport` (a linha do turno vem abaixo do gráfico).
- A linha do turno busca os apontamentos do período (`/api/activities?from=&to=`); nada novo no servidor.
- Telas ainda não revistas uma a uma (Demandas, Detalhes, Lembretes, formulários) herdam a pele pelos tokens.
