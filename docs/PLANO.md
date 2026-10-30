# Plano de ação — Acompanhamento Diário

## 0. Visão do produto (fonte da verdade)

Aplicação web (React + Node + SQLite) de **organização e gestão para colaboradores, focada em
gestão de tempo**: acompanhamento de atividades diárias, demandas/chamados, treinamentos,
metas e relatórios de prestação de contas (daily, 1:1, relatório mensal).

> **Mudança de escopo:** o projeto nasceu como um controlador de apontamentos de horas
> (replicando a planilha `Acompanhamento diário.xlsx`, mantida fora do repositório por conter
> dados reais). O apontamento agora é **um módulo** do produto, e não o seu núcleo.
> Em conflito entre este plano e o código/nomes antigos, vale este plano.

### Módulos
| Módulo | Situação | Descrição |
|---|---|---|
| Apontamento de horas | Existente (seções 1–7 e 9) | Ciclo sex→qui, meta, apontamentos sobre demandas, métricas, conformidade |
| Demandas | Existente (seções 6, 8.1 e 9) | Declarações: Tarefas (chamados, reuniões, treinamentos) e Ciclos (prazo, linha do tempo, impedimentos) |
| Treinamentos | Existente como Tarefa (seção 9) | Nome, descrição e status; as horas de estudo são apontadas |
| Metas | Novo (seção 8) | Objetivos com prazo e progresso, ligados a atividades/demandas/treinamentos |
| Relatórios | Novo (seção 8) | Status diário/semanal/mensal exportável |
| Integração Azure | Futuro | Fora de escopo por enquanto |

### Glossário
- **Demanda:** o que o colaborador declara que faz. Não tem horas. Duas famílias: Tarefas e Ciclo.
- **Tarefa:** demanda de rotina: **chamado**, **reunião** ou **treinamento**. (Até a v0.6 era
  chamada "Atividade"; o nome mudou para não se confundir com o apontamento, que no código é
  `activity`.)
- **Chamado:** número do chamado (único), descrição (problema, solicitante, contexto) e status.
- **Reunião:** tipo (ex.: Daily, Semanal, Planejamento), com quem e assunto; declarada uma vez,
  apontada a cada ocorrência.
- **Treinamento:** nome, descrição e status.
- **Ciclo (demanda):** trabalho longo, com tipo, status, prioridade, início, prazo opcional, linha do
  tempo e impedimentos. Não confundir com o **ciclo de apontamento** (sexta → quinta, seção 1).
- **Apontamento:** intervalo de tempo (data, início, fim) gasto em uma demanda declarada. Só é
  feito na tela Apontamentos. No código e no banco mantém o nome histórico `activity`.
- **Evento:** linha datada na linha do tempo de um ciclo.
- **Impedimento:** bloqueio de um ciclo, com responsável externo e data de início.
- **Intempestiva:** demanda não planejada, que interrompe o planejado.
- **Meta:** diária/semanal (horas) ou objetivo de acompanhamento (progresso e prazo).

### Princípios
- O usuário vê apenas o que escolher, sem poluição (ver seção 7).
- Tempo sempre em minutos inteiros.
- Toda funcionalidade deve ajudar o colaborador a se organizar, priorizar ou prestar contas.
- Dados reais (nomes, pedidos, chamados) nunca entram no repositório, em testes ou em commits.

## 1. Regras de negócio — módulo Apontamento

### Ciclo
- Começa na **sexta-feira** e termina na **quinta-feira** seguinte.
- Apenas dias úteis: **Sex, Seg, Ter, Qua, Qui** (5 dias). Sábado e domingo não aceitam lançamentos.
- O ciclo de uma data é derivado dela: `início = sexta-feira mais recente ≤ data`.

### Meta diária (definida pelo usuário)
- Opções: **5h30**, **8h48** ou **Outro** (valor livre em `hh:mm`).
- Meta semanal = meta diária × 5.
- A meta fica gravada por ciclo: alterar a meta vale para o ciclo atual e para os próximos,
  sem reescrever o histórico de ciclos anteriores.

### Apontamento
- Campos: data, início, fim, duração (calculada), **demanda (obrigatória)**, o que foi feito,
  observações/entregáveis. O "projeto" da planilha é o nome da demanda.
- `duração = fim − início`, com `fim > início`.
- O apontamento **não tem status**: o andamento é da demanda (v0.7, `docs/decisions/0003`). O formulário
  mostra o status da demanda escolhida, só para leitura, com o atalho "Alterar em Demandas".
- Horários sobrepostos no mesmo dia geram aviso (não bloqueiam).

### Métricas por dia (replicadas da planilha)
| Métrica | Regra |
|---|---|
| Horas apontadas | soma das durações do dia |
| Diferença | vazio se 0h · `00:00` se igual à meta · `+hh:mm` se excedeu · `-hh:mm` se faltou |
| Qtd apontamentos | apontamentos do dia com duração > 0 |
| Conformidade | **Pendente** (0h) · **Conforme** (= meta) · **Não conforme** (≠ meta) |
| Diagnóstico | "Sem apontamento" · "Meta atingida" · "Faltam hh:mm" · "Excedeu em hh:mm" |

### Métricas da semana
- Meta semanal, total realizado, dias conformes (`X / 5`).
- **% preenchido = horas apontadas ÷ meta semanal**.
- Linha de total: "100% conforme / Meta total atingida" ou "X/5 conformes / Ajustes pendentes".

### Fora de escopo por enquanto
- Tudo relacionado ao Azure (códigos, apontamento automático).
- Login / múltiplos usuários — a aplicação roda localmente.

## 2. Arquitetura

```
acompanhamento_diario/
├── shared/   regras de negócio em TypeScript puro (ciclo, métricas, formatação)
├── server/   Node + Express + SQLite (módulo nativo node:sqlite)
└── web/      React + Vite + TypeScript + Tailwind
```

- **Tempo sempre em minutos inteiros** (evita o `ROUND(x*1440)` da planilha).
- **SQLite via `node:sqlite`** (embutido no Node ≥ 22): sem dependência nativa para compilar.
- **TypeScript executado direto pelo Node** (type stripping) — sem etapa de build no servidor.
- **Front:** React, React Router, TanStack Query, Tailwind CSS; gráficos em SVG próprio.
- **Testes:** `node --test` para as regras (`shared`) e para a API (`server`).

### Modelo de dados
```sql
-- activities = apontamentos (nome histórico). project = nome da demanda, mantido em dia.
activities(id, date, start_minute, end_minute, project, description, notes,
           demand_id → demands (ON DELETE SET NULL; nulo só nos anteriores à v0.5),
           created_at, updated_at)
cycle_goals(cycle_start PRIMARY KEY, daily_goal_minutes)
settings(key PRIMARY KEY, value)          -- default_daily_goal_minutes
-- uma linha por demanda; colunas fora da categoria ficam nulas/vazias (CHECKs por categoria)
demands(id, category ('ciclo'|'chamado'|'reuniao'|'treinamento'),
        title (ciclo: nome do projeto · treinamento: nome · reunião: assunto), description,
        ticket_number (chamado, único), meeting_type, participants (reunião),
        kind, priority, start_date, due_date, branch, pr_url, environment (ciclo),
        status (ciclo: 6 estados · chamado/treinamento: 4 estados · reunião: nulo),
        created_at, updated_at)
demand_events(id, demand_id → demands (ON DELETE CASCADE), date, kind, text, flagged, created_at)
demand_blockers(id, demand_id → demands (ON DELETE CASCADE), owner, description, since,
                resolved_at, flagged, created_at)
-- flagged (v0.8): bandeira da análise da linha do tempo, nos eventos e nos impedimentos
-- uma linha por troca de status (v0.7); a declaração entra com from_status nulo
demand_status_changes(id, demand_id → demands (ON DELETE CASCADE), from_status, to_status,
                      changed_at, created_at)
```
O esquema evolui por migrações numeradas em `server/src/db.ts` (`PRAGMA user_version`).

### API
| Método | Rota | Uso |
|---|---|---|
| GET | `/api/cycles/:date` | ciclo da data: 5 dias com métricas + totais |
| PUT | `/api/cycles/:date/goal` | define a meta diária do ciclo (e o padrão dos próximos) |
| GET | `/api/activities?date=` | apontamentos de um dia |
| POST | `/api/activities` | aponta (exige `demandId` de uma demanda declarada) |
| PUT | `/api/activities/:id` | edita |
| DELETE | `/api/activities/:id` | remove |
| GET | `/api/demands?status=&category=` | demandas com nome, métricas (horas apontadas, prazo) e acompanhamento; `status` = `abertas` ou `encerradas` |
| GET | `/api/demands/:id` | demanda com métricas, apontamentos, eventos e impedimentos |
| POST | `/api/demands` | declara (corpo por `category`; chamado ou reunião repetidos → 409) |
| PUT | `/api/demands/:id` | edita (a categoria não muda; o nome é atualizado nos apontamentos) |
| DELETE | `/api/demands/:id` | remove; com apontamentos → 409 (eventos e impedimentos vão junto) |
| POST/PUT/DELETE | `/api/demands/:id/events[/:eventId]` | linha do tempo (só ciclos) |
| POST/PUT/DELETE | `/api/demands/:id/blockers[/:blockerId]` | impedimentos (só ciclos) |
| GET | `/api/reports/daily?date=` | relatório do dia (sem `date`, o dia útil anterior): o que foi feito, impedimentos e o que será feito |
| GET | `/api/timeline?demandId=` | linha do tempo unificada dos ciclos (eventos e impedimentos), do mais recente ao mais antigo; sem `demandId`, de todos |
| PUT | `/api/demands/:id/events/:eventId/flag`, `/blockers/:blockerId/flag` | marca ou desmarca a bandeira (`{ flagged }`); editar não a apaga |
| GET | `/api/metrics?date=` | tarefas (concluídas no ciclo de apontamento da data, na fila, em andamento) e ciclos abertos (última atualização, horas) |

## 3. Telas

Toda tela começa por um cabeçalho padrão (`PageHeader`): título, um ⓘ com o texto explicativo
(que não fica fixo na tela) e, à direita, a ação principal.

1. **Painel (`/`)** — um seletor no topo escolhe a visão (**Dia útil**, **Distribuição**,
   **Tarefas** ou **Ciclos**); a navegação entre ciclos de apontamento fica ao lado (v0.7: em todas).
   - *Dia útil:* faixa fina com o anel de % preenchido, o selo da situação ("Faltam 17h15",
     "Excedeu 1h", "Meta atingida"), total realizado, meta semanal e dias conformes; abaixo, o
     gráfico por dia útil (~340 px), com o valor e o ícone de status em cima de cada barra e
     a linha de meta por cima das barras. Tocar em "Meta semanal" abre a meta diária (5h30,
     8h48 ou outro). O lembrete de dia de apontamento fica no sino. Passar o mouse numa coluna
     mostra o apontado, a diferença, o nº de apontamentos, quantas reuniões, chamados,
     treinamentos e ciclos foram apontados no dia (demandas distintas) e o diagnóstico.
   - *Distribuição:* rosca grande do dia escolhido (Sex–Qui) e legenda com nome, horas e %.
   - *Tarefas (v0.7):* concluídas no ciclo, na fila e em andamento, e a divisão entre chamados e
     treinamentos (barra empilhada, com os números escritos).
   - *Ciclos:* barras de horas apontadas por ciclo aberto, com o selo de prazo, a última
     atualização e o selo "Parado há N dias úteis".
   - Ação principal: "Registrar apontamentos". Link "Detalhes" no gráfico.
2. **Apontamentos (`/apontamentos`; `/atividades` redireciona)** — abas Sex/Seg/Ter/Qua/Qui
   (dia, horas e uma barrinha de progresso); mostra só o dia escolhido: resumo do dia em uma
   linha, e a lista (por horário ou por demanda) ocupando a tela. O formulário (demanda, início,
   fim, duração ao vivo, o que foi feito, observações, status) abre num painel deslizante pelo
   botão "Novo apontamento" ou ao editar. Ver seção 9.
3. **Demandas (`/demandas`)** — uma barra só: abas **Tarefas | Ciclo** (com a contagem dos
   abertos), o tipo da tarefa (chamado, reunião ou treinamento) num menu, e o status (em
   aberto, encerrados, todos) à direita. A lista é de linhas compactas; o formulário abre num
   painel deslizante pelo botão "Declarar {tipo}" ou ao editar. Ver seção 9.
4. **Detalhes (`/detalhes`)** — tabela fiel à planilha: data, dia, meta, horas, diferença, qtd
   apontamentos, conformidade, diagnóstico e linha de total geral. Linhas com listras suaves em
   vez de bordas, números à direita (algarismos tabulares) e cabeçalho fixo; clicar num dia abre
   os apontamentos dele.
5. **Lembretes e agenda (`/lembretes`)** — só pelo sino; seta de voltar ao lado do título.
   Lembretes por gravidade ("Pedem atenção", "Para saber") e a agenda por dia, em listas sem
   molduras.

6. **Relatório (`/relatorio`, v0.7)** — o relatório de um dia para a daily ou o 1:1; por padrão, o
   dia útil anterior, com navegação por dia útil. Mostra o trabalho (ciclos, tarefas, reuniões), não os
   apontamentos. Pré-visualização em três seções e a ação principal **Copiar** (Markdown); também `Baixar .md` e `Imprimir / PDF` (impressão do navegador,
   sem o menu). Ver seção 10.

## 4. Fases

| Fase | Entregável | Status |
|---|---|---|
| 0 | Setup do monorepo e scripts | ✅ |
| 1 | `shared/`: ciclo, métricas e testes (cenários da planilha) | ✅ |
| 2 | Back-end: schema, CRUD, `/cycles`, validações, testes de API | ✅ |
| 3 | Tela de atividades | ✅ |
| 4 | Painel | ✅ |
| 5 | Detalhamento | ✅ |
| 6 | Polimento: estados vazios, carregamento, modo escuro, responsividade | ✅ primeira versão |
| 7 | Próximos passos: autocompletar projetos, copiar atividade de outro dia, exportar semana | a definir |
| 8 | Expansão para gestão do colaborador (seção 8) | a definir |
| 9 | v0.7: status só na demanda, Tarefas, métricas, relatório diário (seção 10) | ✅ código; falta a documentação técnica (PDF) |
| — | Integração com o Azure | futuro |

### Decisões registradas
- **Conformidade estrita, como na planilha:** só é "Conforme" o dia com exatamente a meta
  definida pelo usuário (5h30, 8h48 ou "Outro").
- **Acima da meta = irregular:** o dia aparece em vermelho com o aviso "Excedeu a meta de 5h30 em
  00:15. Reajuste o apontamento", e o painel lista os dias irregulares com link para corrigir.
  Abaixo da meta aparece em âmbar ("Faltam hh:mm").
- **% preenchido** arredonda para baixo: 100% só aparece quando a semana está realmente completa.
- **Ciclo passado:** alterar a meta vale só para aquele ciclo; no ciclo atual vale também para os próximos.

## 5. Como rodar

```bash
npm install
npm run dev     # API em :3001 e web em :5173
npm test        # testes das regras e da API
npm start       # build do front + servidor único em :3001
```

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

## 8. Expansão: gestão do colaborador (v0.4 — em andamento)

Objetivo: transformar o app, de controlador de apontamentos, em organizador completo do dia a dia
do colaborador, incorporando o acompanhamento de demandas que hoje é feito em texto solto
(chamados com status `[X]`/`[80%]` e bullets datados).

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

### 8.2 Treinamentos — ✅ como Tarefa (v0.5)
Declarados em Demandas → Tarefas → Treinamentos: nome, descrição e status (não iniciado,
iniciado, em andamento, concluído). Sem carga horária: as horas de estudo são apontadas.
Vínculo com metas fica para a seção 8.3.

### 8.3 Metas
Objetivo com prazo, progresso mensurável (manual ou calculado a partir de demandas,
atividades e treinamentos vinculados) e status. Não confundir com a "meta diária de horas",
que continua pertencendo ao módulo de Apontamento.

### 8.4 Relatórios
Status diário, semanal e mensal exportável (Markdown/PDF), no formato do acompanhamento
original: demanda, status, linha do tempo resumida e impedimentos. Inclui o indicador de
demandas intempestivas (quanto do tempo foi consumido por trabalho não planejado).

### 8.5 Importador do texto legado
Converte o formato antigo (`SCTASK… [status]` seguido de bullets com data entre parênteses)
em demandas e eventos. Pré-visualização antes de gravar; dados reais nunca versionados.

### 8.6 Validações novas
Concluído com impedimento aberto · IDs duplicados · demanda sem eventos há N dias ·
prazo vencido sem conclusão. Os avisos aparecem no sino e em Lembretes, sem poluir o painel.

### 8.7 Política para o legado
- O módulo de Apontamento não será removido nem expandido; novas telas partem do domínio da seção 0.
- Renomear tabelas ou rotas públicas só com migração e aprovação explícita.
- Decisões de escopo e arquitetura novas vão para `docs/decisions/` (um arquivo por decisão).

## 9. Demandas declaradas e Apontamentos (v0.5)

Decisão em `docs/decisions/0002-demandas-declaradas-e-apontamentos.md`.

Princípio: **declarar uma vez, apontar quantas vezes acontecer.** Demandas descrevem o que o
colaborador faz e não têm campo de horas; o tempo é registrado só na tela Apontamentos, sempre
sobre uma demanda já declarada. Assim, a mesma coisa feita em horários diferentes (a Daily de
cada dia, um chamado retomado à tarde) aparece reunida.

### Demandas (`/demandas`)
- Duas famílias, nas abas do topo: **Tarefas** e **Ciclo**.
- **Tarefas** têm três tipos (menu ao lado das abas):
  - **Chamados:** número do chamado (obrigatório, normalizado em maiúsculas, único), descrição
    (obrigatória: problema, quem solicitou, outras informações) e status: Não iniciado,
    Iniciado, Em andamento, Concluído. Troca rápida de status na própria linha.
  - **Reuniões:** tipo (sugestões Daily, Semanal, Planejamento, Treinamento; aceita outro), com
    quem e assunto, todos obrigatórios. Sem status: ficam sempre disponíveis para apontar. A
    mesma reunião (tipo, participantes e assunto iguais) não é declarada duas vezes.
  - **Treinamentos:** nome (obrigatório), descrição e status (os mesmos dos chamados).
- **Ciclo:** nome do projeto, tipo (planejada, intempestiva, preventiva), status (os 6 da seção
  8.1), prioridade, descrição, início e prazo opcional, vínculos técnicos opcionais. Mantém prazo,
  lembretes, linha do tempo, impedimentos e espera.
- Cada linha mostra o título, o status, o prazo (ciclos abertos) e as horas apontadas
  (sobreposições contadas uma vez). Ao expandir: descrição, tipo, prioridade, datas, ambiente e
  vínculos técnicos; nos ciclos, a linha do tempo, os impedimentos e os apontamentos; nas demais,
  os apontamentos (cada ocorrência). Um resumo da descrição aparece ao passar o mouse no título.
- Filtro de status (em aberto / encerrados / todos) em chamados, treinamentos e ciclos.
- Uma demanda com apontamentos não pode ser excluída: primeiro exclua os apontamentos ou aponte-os
  em outra demanda. O tipo de uma demanda não muda depois de declarado.

### Apontamentos (`/apontamentos`)
- O formulário começa pela **demanda** (obrigatória), agrupada por tipo; mostra as encerradas só
  a pedido e oferece atalhos para as usadas recentemente. Depois: início, fim, o que foi feito,
  e observações. O status da demanda aparece só para leitura (ele se altera em Demandas).
- A lista do dia pode ser vista **por horário** ou **por demanda** (cada demanda com o total do dia
  e os horários em que aconteceu). A escolha fica salva no navegador.
- Apontamentos antigos, sem demanda, continuam valendo nas métricas e aparecem com o aviso
  "Sem demanda"; para editá-los é preciso escolher uma demanda.

### Painel e lembretes
- A visão *Demandas em andamento* virou **Ciclos em andamento**: horas apontadas por ciclo aberto
  (barras comparadas entre si, sem meta) e a situação do prazo.
- Lembretes e agenda tratam só dos ciclos (únicos com prazo e início). Lembrete de prazo:
  "Vence em N dias úteis (dd/mm). Xh apontadas até agora." e, vencido, "Conclua o ciclo ou
  ajuste o prazo".

### Banco
- **Migração 4** recria `demands` com a coluna `category`; as demandas existentes viram ciclos.
  Meta de horas, % de progresso, identificadores e sistema, quando preenchidos, vão para o fim da
  descrição ("Versão anterior: …"). Os vínculos dos apontamentos são preservados.

### Fora de escopo (atualizado)
Azure (códigos e apontamento automático), login/múltiplos usuários (roda localmente),
folha de pagamento, cobrança a clientes, controle de ponto oficial.

## 10. Status só na demanda, histórico e métricas de tarefas (v0.7)

Decisão em `docs/decisions/0003-status-so-na-demanda.md`.

- **Status só na demanda:** o apontamento não tem mais status (migração 5). O formulário mostra o
  status da demanda escolhida, só para leitura, com o atalho "Alterar em Demandas".
- **Tarefas:** o nome da família de rotina (chamado, reunião, treinamento), antes "Atividades".
- **Histórico de status (migração 6):** cada troca de status de uma demanda é gravada com a data.
  Dele saem a **data de conclusão** (`completedAt`: a última vez que passou a Concluído, se ainda
  está concluída) e a **última atualização** (`tracking.lastUpdate`: o mais recente entre evento,
  troca de status e apontamento; no mesmo dia vale essa ordem). As demandas anteriores à migração
  têm a data aproximada pelo último `updated_at`.
- **Métricas de tarefas** (só chamados e treinamentos; reunião não tem status):
  - *Concluídas:* `completedAt` dentro do ciclo de apontamento (sexta → quinta);
  - *Na fila:* status Não iniciado, agora; *Em andamento:* Iniciado ou Em andamento, agora.
- **Métricas de ciclos abertos:** última atualização, dias úteis sem atualização (**parado** a partir
  de 3, `STALLED_WORKDAYS`), horas apontadas no total e no ciclo de apontamento.
- **API:** `GET /api/metrics?date=` devolve o período e as duas métricas; as regras ficam em
  `shared/src/overview.ts`.

### Relatório diário (`/relatorio`)

Foco: apresentar em uma daily ou 1:1. Quem lê é a gestão e a equipe, então o relatório fala do
**trabalho** (quais ciclos andaram, quais tarefas foram trabalhadas ou concluídas, quantas reuniões),
não dos **apontamentos**: horários, horas, meta e conformidade ficam no módulo de Apontamento.
Montado na hora (nada é gravado); regras em `shared/src/report.ts`, testadas com dados fictícios.

1. **O que foi feito.** Uma linha-resumo só com o que houve ("1 ciclo · 2 tarefas (1 concluída) ·
   2 reuniões") e três grupos:
   - *Ciclos:* status e o que andou: o "o que foi feito" dos apontamentos (sem repetir, com as
     observações entre parênteses) e os eventos da linha do tempo na data.
   - *Tarefas:* as concluídas no dia primeiro; número, o começo da descrição, a troca de status do
     dia (ou o status atual) e o que andou. Ida e volta no mesmo dia não conta como troca.
   - *Reuniões:* cada uma uma vez (com quem), mesmo que tenha acontecido mais de uma vez no dia.
   Entra a demanda apontada no dia, com troca de status nele (a declaração não conta) ou com evento
   na data. Apontamentos antigos, sem demanda, ficam de fora.
2. **Impedimentos.** Os abertos no dia e os resolvidos nele (um resolvido antes não entra; um
   resolvido depois ainda estava aberto): "aguardando {responsável} desde dd/mm (N dias úteis)".
   Sem nenhum: "Sem impedimentos".
3. **O que será feito hoje.** Só existe se houver demanda aberta que não seja reunião. O dia é o
   próximo dia útil depois do relatório ("hoje" quando é hoje). Traz os ciclos abertos (ordem de
   urgência, com prazo e "impedimento aberto"), as tarefas iniciadas ou em andamento e a fila
   ("Na fila: N tarefas"). Na tela, cada item tem uma caixa para tirá-lo antes de copiar. O status
   usado é o de agora, mesmo em relatório de dia passado.

## 11. Linha do tempo dos ciclos: impedimentos, bandeira, análise e mapa (v0.8 — em andamento)

Decisão em `docs/decisions/0004-impedimentos-na-linha-do-tempo.md`.

- **Uma só lista:** eventos (ação, decisão, validação, deploy e os antigos "impedimento" em texto) e
  impedimentos (com responsável, início e resolução) aparecem juntos como `TimelineEntry`
  (`shared/src/timeline.ts`). A tabela de impedimentos continua sendo a fonte da espera, do
  relatório e dos lembretes; só a separação na tela acaba.
- **Bandeira:** qualquer entrada pode ser marcada (migração 7), para chamar atenção na análise.
  A marcação vale em todas as telas e não se perde ao editar o texto ou resolver o impedimento.
- **Última atualização:** o início e a resolução de um impedimento também contam.
- **Demandas (v0.8):** o acompanhamento do ciclo tem duas abas, **Linha do tempo** e **Apontamentos**;
  a aba Impedimentos deixou de existir. Escolher o tipo *Impedimento* na entrada rápida pede o
  responsável e registra o bloqueio; cada linha de impedimento tem **Resolver/Reabrir** e a espera
  em dias úteis. Cada entrada tem a **bandeira**: marcada, a linha ganha uma faixa vermelha à
  esquerda, fundo suave e o ícone de bandeira preenchido.
