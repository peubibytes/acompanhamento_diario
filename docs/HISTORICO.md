# Histórico do plano — Acompanhamento Diário

Texto original das seções do `docs/PLANO.md` que descreviam versões antigas, guardado como estava quando
saiu do plano (v0.10). **Não é fonte de regra:** o que continua valendo foi reescrito no PLANO.md, nas
mesmas seções (6, 7 e 8.1). Em conflito, vale o PLANO.md.

## 6. Demandas de ciclo e correção de sobreposição (v0.2)

- **Demandas de ciclo:** trabalhos longos, feitos em vários dias, com meta de horas totais
  (até 999h59), data de início e data de conclusão opcional. Status: ativa ou concluída
  (substituído na v0.4 pelos 6 status da seção 8.1; na v0.5 a meta de horas deixou de existir:
  as demandas não declaram horas, ver seção 9).
- **Vínculo:** cada atividade pode ser atribuída a uma demanda (campo "Demanda").
  As horas da demanda são a soma das atividades vinculadas. Excluir a demanda mantém as
  atividades, sem vínculo.
- **Análise de horas:** não iniciada, em andamento, meta atingida ou meta excedida, com o
  quanto falta ou excedeu.
- **Prazo:** "no prazo", "prazo próximo" (até 2 dias úteis), "vence hoje" ou "atrasada".
  Calcula o ritmo necessário por dia útil e marca "em risco" quando o que falta não cabe nos
  dias restantes nem com a meta diária inteira. Lembretes aparecem no painel e na tela Demandas.
- **Painel:** novo gráfico com horas apontadas × meta de cada demanda ativa.
- **Sobreposição:** horários sobrepostos no mesmo dia contam uma única vez (união dos
  intervalos), tanto no total do dia quanto nas horas das demandas.
- **Banco:** migrações versionadas por `PRAGMA user_version`; bancos existentes são
  atualizados automaticamente ao iniciar o servidor.
- **Navegação:** no celular, barra inferior com as quatro telas.
- **Distribuição do dia (painel):** gráfico de pizza com o tempo de um dia escolhido
  (Sex–Qui) dividido por demanda; atividades sem demanda aparecem pelo projeto. Trechos
  sobrepostos são divididos igualmente entre as atividades simultâneas, para a soma das
  fatias bater com o total do dia. Até 6 fatias (o restante vira "Outros"); cores da paleta
  categórica validada, atribuídas pela identidade e não pelo tamanho.

## 7. Painel sob demanda, sino e lembretes (v0.3)

Princípio: o usuário vê apenas o que escolher, sem poluição.

- **Visões do painel:** o usuário escolhe uma por vez em um seletor no topo: *Dia útil*
  (indicadores e gráfico diário, juntos), *Distribuição do dia* ou *Ciclos em andamento*. A
  escolha fica salva no navegador. (Até a v0.5 era uma coluna lateral "Métricas".)
- **Lembretes fora da tela:** os alertas de apontamento irregular, de prazo das demandas e o
  aviso do dia de apontamento saíram do painel e da tela de detalhes.
- **Sino no header:** contador do que pede atenção (vermelho se houver algo urgente); ao passar
  o mouse ou focar pelo teclado, mostra um resumo; ao clicar, abre a tela de lembretes.
- **Tela "Lembretes e agenda" (`/lembretes`):** acessível só pelo sino, sem entrada no seletor
  de telas. Lembretes agrupados por gravidade e agenda por data (prazos vencidos, prazos e
  inícios de demandas, dias de apontamento do ciclo atual e do próximo).

### Estilo visual (v0.6 — em andamento)

Reestilização só de apresentação (cálculos, regras, API, rotas e banco não mudam), em fases
aprovadas uma a uma: 0 fundação · 1 estrutura e navegação · 2 painel · 3 apontamentos ·
4 demandas · 5 detalhes e lembretes · 6 revisão. Meta: o mínimo de informação na tela, gráficos
em destaque, um título, uma ação principal e um filtro por tela.

- **Fase 0 — fundação (pronta):**
  - **Tokens** em `web/src/index.css`: tipografia (`text-2xs` … `text-display`, sem tamanhos
    soltos), raios (`rounded-control`, `rounded-card`), espaço (`px-gutter`, `gap-section`,
    `max-w-page`) e cores nos dois temas, com uma única cor de destaque. Cartões quase sem
    borda e sombra; campos com borda de contraste ≥ 3:1. Contraste conferido: texto ≥ 4,5:1.
  - **ⓘ (`InfoHint`):** todo texto explicativo vai para a dica do ícone. Abre ao passar o mouse,
    ao focar pelo teclado ou ao tocar; Esc ou tocar fora fecha; fica ligada ao botão por
    `aria-describedby`. A dica é deslocada para dentro da janela e abre para cima se faltar
    espaço. Fechada, sai do layout (para não criar rolagem horizontal).
  - **`PageHeader`:** aplicado em todas as telas; os subtítulos das páginas já estão nos ⓘ.
  - A cor de status ainda nunca é a única pista (ícone ou rótulo junto). As cores de barra
    âmbar e cinza do tema claro foram escurecidas para atingir 3:1.

- **Fase 1 — estrutura e navegação (pronta):**
  - **Header** de 56px: logo, as quatro telas, sino e tema. Só a tela atual tem fundo; sino e
    tema ficam sem fundo em repouso. A cor de destaque fica para a ação principal e o foco.
  - **Contêiner único:** todas as telas usam a mesma largura (`max-w-page`), a mesma margem
    lateral (`px-gutter`) e o mesmo espaço entre blocos (`space-y-section`), alinhados ao logo.
    O espaço da barra de rolagem é sempre reservado, para o conteúdo não "pular" entre telas.
  - **Celular:** a barra inferior com as quatro telas continua; a tela atual fica em negrito.

- **Fase 2 — Painel (pronta):**
  - O seletor segmentado no topo substitui a coluna lateral "Métricas"; as descrições das
    visões estão no ⓘ do título.
  - **Dia útil:** faixa de indicadores (só número e rótulo; explicações no ⓘ) e gráfico em
    destaque. O selo de status sob cada barra saiu: o status fica na cor da barra e no ícone ao
    lado do valor, e a legenda no ⓘ do gráfico. Saíram também os quadradinhos por dia e as
    frases "5 dias × 5h30" e "Faltam…" (esta virou um selo curto). A meta diária deixou de ocupar
    uma linha de controles: abre ao tocar em "Meta semanal".
  - **Distribuição** e **Ciclos:** mesmo tratamento (gráfico grande, rótulos diretos, detalhes
    no hover ou foco; a frase-resumo e os rodapés explicativos foram para o ⓘ).
  - Tooltips do gráfico fechados saem do layout (sem rolagem horizontal em 320 px).

- **Fase 3 — Apontamentos (pronta):**
  - **Painel deslizante** (`SlideOver`, reutilizável): o formulário sai da lateral e abre pelo
    botão "Novo apontamento" (ação principal do cabeçalho) ou ao editar. É um diálogo modal: foco
    preso dentro dele, Esc fecha, o foco volta a quem o abriu e a rolagem da página fica travada.
    Com algo digitado, fechar (✕, Esc ou clique fora) pede confirmação antes de descartar. No
    celular ocupa a tela. "Adicionar e continuar" salva e deixa o painel aberto para o próximo
    lançamento (início = fim do anterior).
  - **Abas dos dias:** dia, horas, ícone de status e uma barrinha; a meta saiu da aba.
  - **Resumo do dia em uma linha:** apontado · meta · situação (selo + diferença); o diagnóstico, o
    aviso de irregular e o de horários sobrepostos estão no ⓘ.
  - **Itens compactos:** horário, demanda e duração em destaque, em destaque. A
    descrição e as observações aparecem ao expandir a linha; editar e excluir
    aparecem ao passar o mouse (no celular, dentro da linha expandida).

- **Fase 4 — Demandas (pronta):**
  - **Uma barra de navegação** no lugar de três níveis empilhados (cartões de família, seletor de
    tipo e filtro de status). Tipos de tarefa em menu; o seletor de status some em Reuniões,
    que não têm status.
  - **Formulário no painel deslizante** (o mesmo `SlideOver` de Apontamentos, com confirmação ao
    descartar). O botão principal acompanha o tipo: "Declarar chamado", "Declarar reunião"…
    As explicações dos campos viraram placeholder ou ⓘ (ex.: a diferença entre planejada,
    intempestiva e preventiva); a nota fixa "Aqui você só declara" saiu (está no ⓘ da tela).
  - **Linhas compactas:** título, status, prazo e horas; o impedimento aberto aparece como um ícone
    de ampulheta, com rótulo para leitor de tela. Editar e excluir aparecem no hover (celular:
    na linha expandida).
  - Links por âncora (`#demanda-ID`) abrem a aba certa, mostram a demanda mesmo se encerrada, a
    expandem e rolam até ela, uma vez por link.

- **Fase 5 — Detalhes e Lembretes (pronta):**
  - **Detalhes:** a tela passa a se chamar "Detalhes" (como o item do menu; o link do Painel
    também). Sem o "Voltar ao painel" (a tela já está no menu) e sem o texto de rodapé, que foi
    para o ⓘ. A data de cada dia é um link, alcançável pelo teclado.
  - **Lembretes:** o "Voltar" virou uma seta no cabeçalho (`PageHeader` ganhou `onBack`), então o
    título fica na mesma altura de todas as telas. Saíram os subtítulos fixos (dia por extenso,
    contagem de vencidos, "nenhum lembrete…") e o "Ver demanda →" repetido; a linha inteira é o
    link. A agenda mostra "Amanhã  Qui 29/10" numa linha só. Ícones sem status ficam neutros (a
    cor de destaque é para a ação principal).

- **Fase 6 — revisão (pronta):**
  - **Contraste (WCAG AA):** auditoria automática de todo texto visível — Painel (3 visões),
    Apontamentos, Demandas, Detalhes e Lembretes, mais os estados abertos (painéis, ⓘ, meta, sino),
    nos dois temas, em 1280 e 390 px —, sem nenhuma falha (texto ≥ 4,5:1; texto grande ≥ 3:1).
  - **Teclado:** todo controle alcançado com Tab mostra um indicador de foco. A auditoria achou
    um só caso, o seletor de status das linhas de Demandas, e foi corrigido.
  - **Celular:** o ⓘ abre ao toque, fecha ao tocar de novo ou fora, e a barra inferior continua.
    Nenhuma tela tem rolagem horizontal em 390, 360 e 320 px.
  - **Antes e depois:** comparativos lado a lado de cada tela (8 telas × desktop claro, desktop
    escuro e celular), tomando como "antes" o commit `9fdc285`.


### 8.1 Demandas ampliadas (estende a "Demanda de ciclo" da seção 6) — ✅ implementado, revisto na v0.5

> Na v0.5 (seção 9) estas demandas viraram os **Ciclos**. Identificadores externos foram para os
> **Chamados**; meta de horas, % de progresso e sistema deixaram de existir (os valores antigos
> foram preservados no fim da descrição). O resto desta seção continua valendo para os ciclos.
- Novos campos: identificadores externos (SCTASK, RITM, user story), sistema/projeto,
  tipo (planejada / intempestiva / preventiva), prioridade, % de progresso, prazo final.
- Status ampliado: Novo → Em andamento → Aguardando terceiro → Em homologação → Concluído | Cancelado.
  O status "ativa/concluída" da v0.2 é migrado para este (migração versionada).
- A meta de horas e o vínculo com atividades continuam como estão.
- **Eventos:** linha do tempo datada (ação, decisão, impedimento, validação, deploy), com entrada rápida.
- **Impedimentos:** responsável (pessoa/equipe), desde quando, resolvido ou não.
  Separa esforço de espera. Concluído com impedimento aberto gera validação.
- **Vínculos técnicos:** branch, PR e ambiente (staging/PRD) opcionais.

Como ficou (decisão em `docs/decisions/0001-demandas-viram-chamados.md`):
- **Migração 3** recria `demands` com o mesmo nome: `ativa → em_andamento`, `concluida → concluido`
  (com progresso 100%). Os vínculos das atividades são preservados.
- **Meta de horas opcional.** Sem meta, a demanda mostra as horas apontadas e o % informado;
  prazo e lembretes continuam, sem ritmo necessário nem "em risco".
- **Abertas** = novo, em andamento, aguardando terceiro e em homologação. Lembretes, agenda,
  painel e o campo "Demanda" do formulário de atividade consideram só as abertas.
- **Identificadores** em maiúsculas, sem repetir, separados por espaço, vírgula ou ponto e vírgula.
- **Ordenação:** urgência do prazo, depois prioridade (urgente → baixa), depois prazo e título.
- **Espera:** dias úteis com algum impedimento aberto (de `since` até a resolução ou hoje),
  sem contar duas vezes impedimentos simultâneos. Fica separada das horas apontadas (esforço).
- **Tela Demandas:** filtros Abertas / Encerradas / Todas; cartão com identificadores, sistema,
  selos de status, tipo (só se não for planejada), prioridade (só alta/urgente) e ambiente; o
  indicador "Espera" aparece quando não há ritmo necessário a mostrar. "Acompanhamento" abre as abas
  Linha do tempo (entrada rápida: data, tipo e texto; os impedimentos ficam nela, v0.8) e Apontamentos.
- **Formulário:** vínculos técnicos numa seção recolhível, aberta só se já houver algum preenchido.

## 12. Rendimento por ciclo (v0.9; removido na v0.15, 2026-11-08)

A gestão avaliou que o bloco não trouxe o efeito esperado no rendimento dos colaboradores (decisão `docs/decisions/0015`).
Texto que valia até a v0.14 (seção 12, item 2 do PLANO):

2. **Rendimento por ciclo** (`cycleYield`). Entram os ciclos com apontamento ou registro no período e os
   abertos já iniciados; do maior total para o menor.
   - *Total no período* e *variação* sobre o período anterior equivalente, em minutos e %, com selo de
     seta e texto escrito ("+2h10 vs. período anterior"). Sem apontamento no anterior, só os minutos.
   - *Registros da linha do tempo no período:* eventos, mais o início e a resolução de cada impedimento.
   - *Mini-gráfico:* barras com as horas de cada dia útil e uma linha tracejada com a **média dos dias
     anteriores** do período em que o ciclo teve apontamento (o primeiro dia não tem média). Tooltip:
     apontado, média anterior e diferença.
   - Sem nenhum apontamento em ciclos no período: "Nenhum apontamento em ciclos neste período".
