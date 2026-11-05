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
| Relatórios | Existente (seções 10 e 13) | Diário (v0.7, consolidado na v0.11), semanal e mensal (v0.10), exportáveis; indicador de trabalho não planejado |
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
  tempo e impedimentos. Não confundir com o **Período** (sexta → quinta, seção 1).
- **Período:** janela de tempo do apontamento e dos indicadores. Na interface é o antigo "ciclo de
  apontamento": de **sexta a quinta** (semana) ou, a partir da v0.9, o **mês** civil (decisão
  `docs/decisions/0005`). No código e na API continua `cycle`.
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

### Ciclo (na interface: Período)
- Na interface este conceito se chama **Período**; "Ciclo" fica reservado à demanda de categoria
  `ciclo` (ver glossário). Código, tabelas e rotas mantêm `cycle`.
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
- **Testes:** `node --test` para as regras (`shared`), para a API (`server`) e para a varredura (`scripts`);
  **Vitest + Testing Library** para as telas (`web/test`, v0.10), em jsdom, falando com a **API real** (Express e
  SQLite em memória numa porta livre), sem respostas inventadas. O relógio é congelado (só `Date`) para as datas
  serem estáveis. Cobertos: navegação entre períodos, escala e visão do Painel (URL e preferência), tempo por categoria no Rendimento, formulário de
  apontamento (horário inválido, gravação) e declaração de chamado (maiúsculas, repetido, aviso de rascunho).
  `npm test` roda os dois; `npm run test:rules` e `npm run test:web` rodam cada um.
- **CI (v0.10):** `.github/workflows/ci.yml` roda, em todo PR e em todo push na `main`, `npm ci`,
  `check:sensitive`, `typecheck`, `test` e `build`, com o Node do `.nvmrc`. A `main` só recebe o que passou nele
  (`docs/decisions/0006`).
- **Versões (v0.10):** Node fixado no `.nvmrc` (26; `engines` guarda o mínimo); dependências com versão exata
  no `package.json` (sem `^`) e `save-exact` no `.npmrc`. Atualização uma vez por mês, uma dependência
  maior por vez, cada uma no seu PR com o CI verde; correções de segurança entram quando saem.

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
| GET | `/api/activities?date=` ou `?from=&to=` | apontamentos de um dia ou de uma faixa de datas (v0.9; até 62 dias) |
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
| GET | `/api/export` | todos os dados em JSON (`app`, `schemaVersion`, `exportedAt` e uma lista de linhas por tabela), como arquivo para baixar (v0.10) |
| POST | `/api/import` | importa uma exportação. Só em banco vazio (sem demandas nem apontamentos); com `?replace=true` substitui o que existe, depois de guardar um backup `pre-importacao-…`. Valida com zod e o `schemaVersion` precisa ser o do aplicativo; roda numa transação (400 e nada muda se algo falhar; 409 sem `replace` em banco com dados). Aceita até 50 MB; as demais rotas, 100 kb |
| GET | `/api/backups` | o último backup diário, quantos há e quantos ficam: `{ last, count, keep }` |
| GET | `/api/storage` | para os lembretes de Seus dados: `{ syncedFolder, hasData, lastExportAt }` (pasta sincronizada do banco, se há dados e a última exportação) |
| GET | `/api/reports/daily?date=` | relatório do dia (sem `date`, o dia útil anterior), v0.11: `done` (`tickets`, `trainings`, `cycles`, `meetings`, `people`, `cycleMinutes`), `blockers` e `next` (`tickets`, `trainings`, `cycles`, `queued`) |
| GET | `/api/reports/period?date=&scale=` | relatório do período (v0.10; sem `date`, o de hoje; `scale` como em `/api/metrics`): ciclos que andaram, tarefas concluídas e trabalhadas, reuniões, impedimentos e o trabalho não planejado (seção 13) |
| GET | `/api/timeline?demandId=` | linha do tempo unificada dos ciclos (eventos e impedimentos), do mais recente ao mais antigo; sem `demandId`, de todos |
| PUT | `/api/demands/:id/events/:eventId/flag`, `/blockers/:blockerId/flag` | marca ou desmarca a bandeira (`{ flagged }`); editar não a apaga |
| GET | `/api/metrics?date=&scale=` | tarefas (concluídas no período da data, na fila, em andamento) e ciclos abertos (última atualização, horas). `scale` opcional: `week` (padrão, sexta → quinta) ou `month` (mês civil); outro valor → 400 |
| GET | `/api/periods/:date?scale=` | resumo do período da data (v0.9): dias úteis com métricas e totais (meta do período, realizado, dias conformes `X/N`, % preenchido). A meta de cada dia é a do ciclo de apontamento a que ele pertence. `scale` como acima |
| GET | `/api/yield?date=&scale=` | rendimento do período (v0.9): `{ period, previous, split, unplanned, cycles }` — tempo por categoria (reuniões, chamados, treinamentos, ciclos e sem demanda) e por família (Tarefas × Ciclos) por dia útil, o trabalho não planejado (v0.10, seção 13) e, por ciclo, horas por dia, total, variação sobre o período anterior e registros da linha do tempo |

## 3. Telas

Toda tela começa por um cabeçalho padrão (`PageHeader`): título, um ⓘ com o texto explicativo
(que não fica fixo na tela) e, à direita, a ação principal.

1. **Painel (`/`)** — no canto superior esquerdo, o seletor de **escala** do período (**Semana** |
   **Mês**, v0.9, guardada na URL como `?escala=mes`) e, ao lado, o seletor da visão (**Dia útil**,
   **Distribuição**, **Ciclos** ou **Rendimento**; a visão **Tarefas** saiu na v0.11); a navegação entre períodos fica à direita (em todas as
   visões). A escala vale para todas as visões; no celular, escala e visões se empilham à esquerda e a
   navegação desce. A semana é sexta → quinta; o mês é o mês civil, com os dias úteis Seg–Sex.
   *Visões no mês (v0.9):* **Dia útil** com uma barra por dia útil do mês (rótulo "dd"; o ícone e o valor só
   aparecem quando cabem, pela largura do gráfico; o resto fica no tooltip), Meta do período, Total realizado
   e Dias conformes `X/N` (a linha de meta é a meta diária mais comum do mês; o popover de meta edita a meta
   diária do ciclo de apontamento de hoje, ou do último/primeiro dia útil num mês passado/futuro);
   **Distribuição** com a rosca do mês inteiro, sem a escolha de dia; **Ciclos** usa o
   período ("no período"). Na semana nada muda.
   - *Dia útil:* faixa fina com o anel de % preenchido, o selo da situação ("Faltam 17h15",
     "Excedeu 1h", "Meta atingida"), total realizado, meta semanal (no mês, "Meta do período") e dias conformes; abaixo, o
     gráfico por dia útil (~340 px), com o valor e o ícone de status em cima de cada barra e
     a linha de meta por cima das barras. Tocar em "Meta semanal" abre a meta diária (5h30,
     8h48 ou outro). O lembrete de dia de apontamento fica no sino. Passar o mouse numa coluna
     mostra o apontado, a diferença, o nº de apontamentos, quantas reuniões, chamados,
     treinamentos e ciclos foram apontados no dia (demandas distintas) e o diagnóstico.
   - *Distribuição:* rosca grande do dia escolhido (Sex–Qui) e legenda com nome, horas e %.
   - *Ciclos:* cada ciclo aberto com o selo de prazo, a última atualização, as horas apontadas
     (como número) e o **mapa da linha do tempo** em serpentina (v0.8, seção 11), no lugar da barra.
   - *Rendimento (v0.9):* em semana e em mês, dois blocos num só cartão: **Tempo por categoria** (horas em
     Tarefas e em Ciclos, quem predominou entre as duas famílias e barras empilhadas por dia útil com chamados, reuniões,
     treinamentos e ciclos) e **Rendimento por ciclo** (uma linha
     por ciclo: total no período, variação sobre o período anterior, registros da linha do tempo e um
     mini-gráfico por dia útil com a média dos dias anteriores). Ver seção 12. Na faixa, o selo **Não planejado**
     (v0.10): a fatia do tempo em ciclos intempestivos (seção 13).
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
4. **Detalhes (`/detalhes`)** — duas abas, **Dia a dia** e **Ciclos** (v0.8, ver seção 11). Dia a dia:
   tabela fiel à planilha: data, dia, meta, horas, diferença, qtd
   apontamentos, conformidade, diagnóstico e linha de total geral. Linhas com listras suaves em
   vez de bordas, números à direita (algarismos tabulares) e cabeçalho fixo; clicar num dia abre
   os apontamentos dele.
5. **Lembretes e agenda (`/lembretes`)** — só pelo sino; seta de voltar ao lado do título.
   Lembretes por gravidade ("Pedem atenção", "Para saber") e a agenda por dia, em listas sem
   molduras. Embaixo, **Seus dados** (`#seus-dados`): último backup, última exportação e "Exportar dados".

6. **Relatório (`/relatorio`, v0.7)** — no canto superior esquerdo, a escala **Dia | Semana | Mês** (v0.10, na URL
   como `?escala=semana` ou `?escala=mes`; sem ela, o dia). Semana e mês: o relatório do período, com a navegação do
   Painel (seção 13). Dia (v0.11): o relatório da daily em dois tópicos, **O que foi feito ontem** (métricas de
   chamados, reuniões e horas em ciclos, a frase de resumo e a de detalhamento) e **O que será feito hoje** (a frase
   de planejamento, os itens do plano com caixa para tirar e os impedimentos em aberto); por padrão, o dia útil
   anterior, com navegação por dia útil. A ação principal é **Copiar** (Markdown); também `Baixar .md` e
   `Imprimir / PDF` (impressão do navegador, sem o menu). Ver seção 10.

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
| 9 | v0.7: status só na demanda, Tarefas, métricas, relatório diário (seção 10) | ✅ (documentação técnica em PDF atualizada na v0.10) |
| 10 | v0.8: linha do tempo dos ciclos: impedimentos dentro dela, bandeira, Detalhes → Ciclos e mapa no Painel (seção 11) | ✅ |
| 11 | v0.9: "Período" no lugar de "ciclo de apontamento", escala Semana \| Mês no Painel e visão Rendimento (seção 12) | ✅ |
| 12 | v0.10: segurança de acesso, backup e exportação, README, CI e testes de tela, organização (rotas por domínio, Painel por visão, `docs/HISTORICO.md`, PDF) e relatório do período com as intempestivas (seção 13) | ✅ (tag `v0.10.0`) |
| 13 | v0.11: relatório diário consolidado (dois tópicos abertos por frases, seção 10); visão Tarefas removida do Painel | ✅ |
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

Sem terminal: dois cliques em **`iniciar.cmd`** (Windows) ou `./iniciar.sh` (macOS e Linux). O script
(`scripts/start-local.mjs`) confere o Node (o mínimo de `engines`), roda `npm ci` quando falta `node_modules` ou o
`package-lock.json` é mais novo que a instalação, e chama `npm start` com `OPEN_BROWSER=1`: o servidor abre o
navegador em `http://127.0.0.1:3001` quando fica pronto. Fechar a janela para o servidor. Com a porta ocupada pelo
próprio app (outra janela; ele responde em `/api/backups`), o servidor abre o navegador nele e sai sem erro; ocupada
por outro programa, avisa e sai com erro.

```bash
npm install
npm run dev     # API em :3001 e web em :5173
npm test        # testes das regras e da API
npm start       # build do front + servidor único em :3001
npm run check:sensitive   # varredura anti-vazamento (planilhas, bancos, chamados reais, e-mails)
```

### Dados e backup (v0.10)

- **Onde ficam:** um arquivo SQLite em `server/data/acompanhamento.db` (`DB_PATH` muda o lugar). A pasta não
  vai para o git.
- **Backup diário:** ao iniciar o servidor e, enquanto ele roda, quando o dia vira, o banco é copiado com
  `VACUUM INTO` (cópia consistente, mesmo em uso) para `server/data/backups/acompanhamento-AAAA-MM-DD.db`
  (`BACKUP_DIR` muda o lugar). O primeiro do dia vale (não se sobrescreve); ficam os **14 mais recentes**.
  A cópia é gravada num arquivo temporário e renomeada, então uma queda no meio não deixa backup pela metade.
  Uma falha de backup é registrada no console e não derruba o servidor.
- **Antes de migrar:** se o banco já existe e há migração pendente, ele é copiado antes como
  `pre-migracao-N.db` (N = a versão de origem do esquema). Todas ficam.
- **Antes de substituir:** `POST /api/import?replace=true` num banco com dados guarda `pre-importacao-…db`
  (as 5 mais recentes ficam).
- **Exportar e importar:** `GET /api/export` e `POST /api/import` (seção 2). O formato é genérico (as
  colunas vêm do próprio banco): uma coluna nova numa migração entra sem mexer na exportação. Importar exige
  a mesma versão do esquema.
- **Na tela:** Lembretes e agenda → **Seus dados**: "Exportar dados" e a data e hora do último backup e da última
  exportação.
- **Lembretes de Seus dados** (`dataNotifications`, em `shared/src/reminders.ts`), no sino e em Lembretes, levando a
  `#seus-dados`:
  - *Pasta sincronizada* (atenção): o banco ou os backups estão numa pasta do OneDrive, Dropbox, Google Drive ou
    iCloud Drive (pelo nome de uma pasta do caminho ou, no Windows, pelas variáveis `OneDrive*`;
    `server/src/storage.ts`). A sincronização pode corromper o SQLite, gravado em mais de um arquivo (.db, -wal,
    -shm). O servidor também avisa no console ao iniciar.
  - *Exportação periódica:* os backups ficam no mesmo disco do banco, então o app pede uma cópia fora da máquina.
    Com dados (demandas ou apontamentos): nunca exportado ou 14 dias ou mais desde a última exportação → atenção;
    de 7 a 13 dias → informativo (`EXPORT_REMINDER_DAYS`, `EXPORT_WARNING_DAYS`). A exportação grava o momento em
    `settings.last_export_at`, que fica **fora** do arquivo exportado e sobrevive a uma importação que substitui
    tudo (é desta máquina, não dos dados).
- **Restaurar um backup:** pare o servidor, copie o arquivo escolhido de `server/data/backups/` por cima de
  `server/data/acompanhamento.db` (apague antes os arquivos `acompanhamento.db-wal` e `-shm`, se existirem) e
  inicie de novo. O passo a passo está no `README.md`.

### Acesso e segurança (v0.10)

A aplicação não tem login: quem alcança a porta lê e altera tudo. Por isso:

- **Só a própria máquina.** O servidor escuta em `127.0.0.1` (variável `HOST`). Expor na rede exige definir
  `HOST` explicitamente (ex.: `HOST=0.0.0.0`) e listar os nomes de acesso em `ALLOWED_HOSTS` (separados por
  vírgula, sem porta, ex.: `ALLOWED_HOSTS=meu-pc,192.168.0.10`); o servidor avisa no início. **O risco é seu:**
  numa rede compartilhada, qualquer pessoa nela acessa os dados. Prefira uma VPN ou um túnel com login.
- **Host e Origin.** Toda requisição precisa de `Host` da própria máquina (ou liberado em `ALLOWED_HOSTS`), o
  que barra o "DNS rebinding"; e, quando o navegador envia `Origin`, ele precisa ser igual ao `Host` (a
  página da própria aplicação, inclusive o Vite em desenvolvimento, que repassa o `Host`). Uma página de
  outro site chamando a API local recebe 403. Sem `Origin` (curl, testes) a requisição segue.
- **Corpo e cabeçalhos.** JSON de até 100 kb por requisição (413 acima disso), sem `X-Powered-By`, com
  `X-Content-Type-Options: nosniff` e `Referrer-Policy: no-referrer`.
- **Varredura anti-vazamento** (`scripts/check-sensitive.mjs`): falha se o git rastrear `.xlsx`, `.csv`,
  `.db`, `.sqlite` ou a pasta `server/data/`, se um arquivo de texto trouxer número de chamado com cara de
  real (prefixo + 6 dígitos significativos ou mais; os fictícios do projeto são curtos, como
  `SCTASK0000001`) ou um e-mail que não seja de exemplo. O relatório mostra arquivo e linha, nunca o valor.

## 6. Sobreposição, prazo e distribuição (regras vigentes desde a v0.2)

O texto original da v0.2 (demandas com meta de horas, gráfico de horas × meta) está em `docs/HISTORICO.md`.

- **Sobreposição:** horários sobrepostos no mesmo dia contam uma única vez (união dos intervalos), tanto no
  total do dia quanto nas horas das demandas.
- **Horas de uma demanda:** a união dos apontamentos ligados a ela. Demanda com apontamentos não pode ser
  excluída (seção 9).
- **Prazo (ciclos):** "No prazo", "Prazo próximo" (até 2 dias úteis, `DEADLINE_WARNING_WORKDAYS`), "Vence hoje"
  ou "Atrasada"; sem data, "Sem prazo"; encerrados, "Concluída" ou "Cancelada". Ritmo necessário e "em risco"
  saíram com a meta de horas (v0.5).
- **Banco:** migrações versionadas por `PRAGMA user_version`; bancos existentes são atualizados ao iniciar o
  servidor (com backup antes, seção 5).
- **Distribuição (Painel):** o tempo de um dia (na semana) ou do mês dividido por demanda; apontamentos sem
  demanda aparecem pelo projeto. Trechos sobrepostos são divididos igualmente entre os apontamentos
  simultâneos, para a soma das fatias bater com o total. Até 6 fatias (o resto vira "Outros"); cores da
  paleta categórica, atribuídas pela identidade e não pelo tamanho.
- **Celular:** barra inferior com as telas principais.

## 7. Painel sob demanda, sino, lembretes e estilo visual

Princípio: o usuário vê apenas o que escolher, sem poluição. A narrativa das versões v0.3 e v0.6 (fases da
reestilização, auditorias e comparativos) está em `docs/HISTORICO.md`.

- **Visões do painel:** uma por vez, num seletor no topo (lista na seção 3); a escolha fica salva no navegador.
- **Lembretes fora da tela:** apontamento irregular, prazos dos ciclos, o dia de apontamento e os cuidados com os dados não ocupam o
  Painel nem Detalhes.
- **Sino no header:** contador do que pede atenção (vermelho se houver algo urgente); ao passar o mouse ou
  focar, um resumo; ao clicar, a tela de lembretes.
- **Lembretes e agenda (`/lembretes`):** só pelo sino. Lembretes por gravidade e agenda por data (prazos
  vencidos, prazos e inícios dos ciclos, dias de apontamento do período atual e do próximo).

### Estilo visual (regras vigentes, desde a v0.6)

- **Mínimo na tela:** um título, uma ação principal e um filtro por tela; gráficos em destaque.
- **Tokens** em `web/src/index.css`: tipografia (`text-2xs` … `text-display`, sem tamanhos soltos), raios
  (`rounded-control`, `rounded-card`), espaço (`px-gutter`, `gap-section`, `max-w-page`) e cores nos dois
  temas, com uma única cor de destaque (para a ação principal e o foco) e a paleta `--series-*` dos gráficos.
  Cartões quase sem borda e sombra; campos com borda de contraste ≥ 3:1.
- **ⓘ (`InfoHint`):** todo texto explicativo vai para a dica, nunca fixo na tela. Abre ao passar o mouse,
  focar ou tocar; Esc ou tocar fora fecha; ligada ao botão por `aria-describedby`; fica dentro da janela e,
  fechada, sai do layout.
- **`PageHeader`** em todas as telas: título, ⓘ e a ação principal (ou a seta de voltar, `onBack`).
- **Estrutura:** header de 56 px (logo, telas, sino, tema; só a tela atual tem fundo); todas as telas com
  `max-w-page`, `px-gutter` e `space-y-section`; espaço da barra de rolagem sempre reservado.
- **Painel deslizante (`SlideOver`)** para formulários: diálogo modal (foco preso, Esc fecha, foco volta a
  quem abriu, rolagem travada); com algo digitado, fechar pede confirmação; no celular ocupa a tela.
- **Listas compactas:** o essencial na linha; detalhes ao expandir; editar e excluir no hover (no celular,
  dentro da linha expandida).
- **Gráficos:** rótulos diretos, detalhes no hover ou foco; tooltips fechados saem do layout.
- **Acessibilidade:** a cor nunca é a única pista (ícone ou rótulo junto); contraste AA (texto ≥ 4,5:1,
  grande ≥ 3:1) nos dois temas; foco visível em todo controle; sem rolagem horizontal em 390, 360 e 320 px.

## 8. Expansão: gestão do colaborador (v0.4 — em andamento)

Objetivo: transformar o app, de controlador de apontamentos, em organizador completo do dia a dia
do colaborador, incorporando o acompanhamento de demandas que hoje é feito em texto solto
(chamados com status `[X]`/`[80%]` e bullets datados).

### 8.1 Ciclos (as "demandas ampliadas" da v0.4) — ✅ implementado

Decisão em `docs/decisions/0001-demandas-viram-chamados.md`; o texto original da v0.4 (meta de horas,
% de progresso, identificadores e sistema, que saíram na v0.5) está em `docs/HISTORICO.md`.

- **Status:** Novo → Em andamento → Aguardando terceiro → Em homologação → Concluído | Cancelado.
  **Abertas** = novo, em andamento, aguardando terceiro e em homologação; lembretes, agenda, painel e o campo
  "Demanda" do apontamento consideram só as abertas.
- **Tipo** (planejada, intempestiva, preventiva), **prioridade** e **prazo** opcional.
- **Linha do tempo:** eventos datados (ação, decisão, impedimento, validação, deploy), com entrada rápida
  (seção 11).
- **Impedimentos:** responsável (pessoa ou equipe), desde quando e resolução. **Espera** = dias úteis com
  algum impedimento aberto (de `since` até a resolução ou hoje), sem contar duas vezes os simultâneos; fica
  separada das horas apontadas (esforço).
- **Ordenação:** urgência do prazo, depois prioridade (urgente → baixa), depois prazo e título.
- **Vínculos técnicos** (branch, PR, ambiente) opcionais, numa seção recolhível do formulário, aberta só se
  já houver algum preenchido.

### 8.2 Treinamentos — ✅ como Tarefa (v0.5)
Declarados em Demandas → Tarefas → Treinamentos: nome, descrição e status (não iniciado,
iniciado, em andamento, concluído). Sem carga horária: as horas de estudo são apontadas.
Vínculo com metas fica para a seção 8.3.

### 8.3 Metas
Objetivo com prazo, progresso mensurável (manual ou calculado a partir de demandas,
atividades e treinamentos vinculados) e status. Não confundir com a "meta diária de horas",
que continua pertencendo ao módulo de Apontamento.

### 8.4 Relatórios — ✅ diário (v0.7), semanal e mensal (v0.10)
Status diário (consolidado em dois tópicos na v0.11, seção 10), semanal e mensal exportável (Markdown/PDF), no formato do acompanhamento
original: demanda, status, linha do tempo resumida e impedimentos. Inclui o indicador de
demandas intempestivas (quanto do tempo foi consumido por trabalho não planejado). Ver seções 10 e 13.

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
- **Apontar (v0.12, `docs/decisions/0010`):** cada apontamento mostra "Apontar X", o que lançar no Azure. O trecho em
  que horários se sobrepõem é dividido em partes iguais entre os apontamentos simultâneos (`loggableMinutes`, em
  `shared/src/breakdown.ts`), em minutos inteiros: a soma dos "Apontar" do dia é o total do dia. Sem sobreposição,
  é a duração; quando difere, aparece em destaque. Na visão por demanda, o cabeçalho do grupo soma os do grupo.
  Calculado na tela: nada é gravado e as horas, a meta e a conformidade não mudam.
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
  - Desde a v0.11 nenhuma tela mostra essas métricas (a visão Tarefas saiu do Painel); `GET /api/metrics`
    continua devolvendo `tasks`.
- **Métricas de ciclos abertos:** última atualização, dias úteis sem atualização (**parado** a partir
  de 3, `STALLED_WORKDAYS`), horas apontadas no total e no ciclo de apontamento.
- **API:** `GET /api/metrics?date=` devolve o período e as duas métricas; as regras ficam em
  `shared/src/overview.ts`.

### Relatório diário (`/relatorio`)

> **v0.11:** o layout abaixo foi substituído pelo relatório consolidado (decisão
> `docs/decisions/0008-relatorio-diario-consolidado.md`, subseção seguinte). O texto da v0.7 fica como registro.

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

### Relatório diário consolidado (v0.11)

Decisão em `docs/decisions/0008-relatorio-diario-consolidado.md`. Regras em `shared/src/report.ts`, testadas com
dados fictícios. Os registros soltos (apontamentos, eventos, trocas de status) viram um item por demanda, com a
digitação arrumada (`tidyText`) e sem repetir. O Markdown sai sem introdução, pronto para colar ou integrar.

1. **O que foi feito ontem** (fora de ontem e hoje, "na terça-feira (27/10)").
   - *Métricas* (na tela, três ou quatro números): chamados atendidos, reuniões, treinamentos (só se houve) e horas
     em ciclos (união dos intervalos; a única medida de tempo do diário).
   - *Frase de resumo:* "Ontem, atendi X chamados, participei de Y reuniões e fiz Z de demandas de Ciclo."
   - *Frase de detalhamento:* "Atendi aos chamados (número – descrição), entrei em reunião com (pessoas, sem
     repetir), e fiz minhas demandas de ciclo: ciclo (ações)". Ações = "o que foi feito" dos apontamentos, eventos
     da linha do tempo e impedimentos resolvidos no dia. Chamado concluído no dia leva "(concluído)".
2. **O que será feito hoje** (ou "na quinta-feira (29/10)").
   - *Frase de planejamento:* "Para hoje, buscarei encerrar os chamados (…), seguirei nos treinamentos (…) e
     atuarei nas demandas (…)". Entram os chamados iniciados ou em andamento, os chamados novos (declarados no dia
     do relatório ou depois, com o selo "novo"), os treinamentos iniciados e os ciclos abertos já começados; os
     demais não iniciados ficam em "Na fila". Sem nada: "Para hoje, não há demandas em aberto."
   - *Itens do plano:* cada um com uma caixa para tirá-lo da frase antes de copiar.
   - *Impedimentos em aberto:* "aguardando {responsável} desde dd/mm (N dias úteis)".
- **Mais de três itens de um tipo** (`REPORT_INLINE_LIMIT`): a frase cita a quantidade ("os 5 chamados da tabela
  abaixo") e os itens vão para uma tabela leve (chamados, ciclos; listras suaves, rola dentro dela no celular) ou
  lista (reuniões, treinamentos).

## 11. Linha do tempo dos ciclos: impedimentos, bandeira, análise e mapa (v0.8)

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
- **Detalhes → Ciclos (`/detalhes?aba=ciclos`):** a análise da linha do tempo dos ciclos.
  - *Filtros* (na URL): ciclo (padrão **Todos os abertos**; também Todos ou um ciclo), tipo (ação,
    decisão, impedimento, validação, deploy; várias ao mesmo tempo, cada um com a quantidade já
    registrada) e **Só marcados**.
  - *Métricas* do ciclo escolhido, antes do filtro de tipo: registros, marcados, impedimentos
    abertos (com a maior espera) e há quantos dias úteis foi o último registro (a resolução de um
    impedimento conta como registro).
  - *Lista* do mais recente ao mais antigo, agrupada por mês, com o nome do ciclo quando há mais
    de um. Aqui só se marca a bandeira; resolver e excluir ficam em Demandas.
  - Vazios: "Nenhum registro na linha do tempo" (com o link para os ciclos) e "Nada com estes
    filtros" (com "Limpar filtros").
- **Painel → Ciclos: o mapa (`TimelineMap`).** Cada ciclo aberto mostra a sua linha do tempo na
  horizontal, como um mapa: **Início** → registros (ação, decisão, impedimento, validação, deploy,
  em ordem cronológica) → **Prazo** (tracejado, se houver).
  - *Serpentina:* começa na esquerda, vai até a direita e, no limite, **desce e volta da direita para
    a esquerda**, e assim por diante. O número de colunas vem da largura (mínimo 2, máximo 8; 2 em
    320 px). A posição de cada nó e a curva saem de `snakeLayout` (`shared/src/layout.ts`, testada).
    O DOM fica em ordem cronológica (ordem de leitura de teclado e leitor de tela).
  - *Nó:* círculo com o ícone do tipo, a data e o nome do tipo embaixo; o texto completo aparece ao
    passar o mouse ou focar (a cor nunca é a única pista: ícone e rótulo sempre acompanham).
    Impedimento em âmbar; **marcado** com anel vermelho e bandeira.
  - *Limite:* os **12 registros mais recentes**; antes deles o nó "+N anteriores" leva a
    Detalhes → Ciclos. Ciclo sem registros mostra só Início e Prazo.
  - Cada ciclo ganha o link **Analisar linha do tempo** (também em Demandas), que abre Detalhes →
    Ciclos já filtrado por ele.

## 12. Períodos, visão mensal e Rendimento (v0.9)

Decisão de vocabulário em `docs/decisions/0005-periodo-no-lugar-de-ciclo-de-apontamento.md`.

- **Período:** na interface, o "ciclo de apontamento" passou a se chamar **Período**; "Ciclo" fica só para
  a demanda de categoria `ciclo`. Código, tabelas e rotas mantêm `cycle`. O período tem duas escalas:
  `week` (sexta → quinta, como sempre) e `month` (mês civil, dias úteis Seg–Sex).
- **Regras** (`shared/src/period.ts`, testadas): `getPeriod`, `shiftPeriod` (±7 dias ou ±1 mês, ancorado no
  dia 1º), `previousPeriod` (o equivalente anterior), `formatPeriodLabel` ("Sex 30/10 → Qui 05/11" ou
  "Outubro de 2026") e `anchorDate` (hoje, se cair no período; senão a ponta mais próxima).
- **Resumo do período** (`buildPeriodSummary`, em `metrics.ts`): reaproveita `dayMetrics` e `weekMetrics`.
  A meta de cada dia é a do ciclo de apontamento a que ele pertence (as metas continuam gravadas por
  `cycle_start`); a meta do período é a soma das metas dos dias. Dias conformes `X/N`; % preenchido
  arredonda para baixo, como na semana.
- **API:** `GET /api/periods/:date?scale=`, `scale` em `GET /api/metrics`, `GET /api/yield` e a faixa
  `?from=&to=` em `GET /api/activities` (seção 2). Sem `scale`, vale a semana, como antes.
- **Revisão (v0.9):** auditoria automática de rolagem horizontal e contraste AA (texto ≥ 4,5:1; grande ≥ 3:1) em
  Painel (5 visões × semana/mês, mais o estado vazio e os ⓘ e a meta abertos), Apontamentos, Demandas, Detalhes
  (as duas abas), Lembretes e Relatório, nos dois temas, em 1280, 390, 360 e 320 px: 152 combinações, sem falhas.
  Achou e corrigiu uma rolagem horizontal do cabeçalho de Detalhes em ≤ 360 px (`PageHeader`).
- **Escala no Painel:** `?escala=mes` na URL (ausente = semana), preservada ao navegar entre telas e entre
  períodos. Apontamentos e Detalhes continuam só com a semana; a visão mensal de Detalhes fica fora desta versão.

### Rendimento (`/` → Rendimento)

Princípio: mostrar para onde o tempo foi (reuniões, chamados, treinamentos ou ciclos) e se cada ciclo rendeu mais ou menos que antes.
Só leitura dos apontamentos: nada é gravado. Regras em `shared/src/yield.ts`.

1. **Tempo por categoria** (`categorySplit`). Um grupo por categoria de demanda: chamados, reuniões,
   treinamentos e ciclos; apontamentos antigos, sem demanda, ficam num quinto grupo, "Sem demanda". As
   famílias saem da soma: Tarefas = chamados + reuniões + treinamentos; Ciclos = a categoria `ciclo`.
   (Até a v0.10 o bloco era só **Tarefas × Ciclos**, `familySplit`.)
   - Dentro de uma categoria, horários sobrepostos contam uma vez (união); o trecho em que categorias
     diferentes se sobrepõem é dividido igualmente entre elas (uma reunião durante um chamado vale metade
     para cada; três ao mesmo tempo, um terço), a mesma ideia da Distribuição (seção 6). A soma por dia
     bate com o total do dia nas métricas; os minutos são inteiros (maior resto).
   - Faixa: horas em Tarefas, horas em Ciclos e quem **predominou** entre as duas famílias ("Mais em
     Ciclos · 62%": a fatia da família maior no total do período; empate ou período vazio não têm
     predominante).
   - Barras empilhadas por dia útil (chamados, reuniões, treinamentos, ciclos e Sem demanda, esta só se
     houver), com legenda escrita (cor, ícone da categoria, nome, horas e %), valor do dia em cima quando
     cabe e tooltip com ícone, horas e % de cada parte. A cor é fixa por categoria (paleta `--series-*`).
   - API: `split` em `GET /api/yield` traz, por dia e no total, `chamado`, `reuniao`, `treinamento`,
     `ciclo`, `semDemanda` e `total`, além de `tarefas` e `ciclos` (as famílias) e `predominant`.
2. **Rendimento por ciclo** (`cycleYield`). Entram os ciclos com apontamento ou registro no período e os
   abertos já iniciados; do maior total para o menor.
   - *Total no período* e *variação* sobre o período anterior equivalente, em minutos e %, com selo de
     seta e texto escrito ("+2h10 vs. período anterior"). Sem apontamento no anterior, só os minutos.
   - *Registros da linha do tempo no período:* eventos, mais o início e a resolução de cada impedimento.
   - *Mini-gráfico:* barras com as horas de cada dia útil e uma linha tracejada com a **média dos dias
     anteriores** do período em que o ciclo teve apontamento (o primeiro dia não tem média). Tooltip:
     apontado, média anterior e diferença.
   - Sem nenhum apontamento em ciclos no período: "Nenhum apontamento em ciclos neste período".

## 13. Relatório do período e trabalho não planejado (v0.10)

Decisão em `docs/decisions/0007-relatorio-do-periodo-e-intempestivas.md`.

### Relatório do período (`/relatorio?escala=semana` ou `?escala=mes`)

Foco: o 1:1 e a prestação de contas da semana (sexta → quinta) ou do mês. Como o diário, fala do **trabalho**, não
dos apontamentos. Montado na hora (nada é gravado); regras em `shared/src/periodReport.ts`, testadas com dados
fictícios. Copiar (Markdown), `Baixar .md` e `Imprimir / PDF`, como no diário.

1. **O que foi feito.** Linha-resumo ("2 ciclos · 3 tarefas (1 concluída) · 1 reunião") e:
   - *Ciclos que andaram:* apontados, com troca de status, evento ou impedimento (início ou resolução) no período,
     na ordem habitual. Cada um com o tipo quando não é planejado (selo "Intempestiva"), a troca de status do
     período (do primeiro "de" ao último "para"; ida e volta não conta) ou o status atual, os **dias de trabalho**
     (dias úteis com apontamento) e os **eventos da linha do tempo** do período ("02/12 Deploy: Publicado").
     O "o que foi feito" de cada apontamento não entra: num mês, viraria uma lista longa.
   - *Tarefas concluídas:* chamados e treinamentos com conclusão no período.
   - *Tarefas em andamento:* as demais apontadas ou com troca de status no período.
   - *Reuniões:* cada uma uma vez, com quantos dias aconteceu.
2. **Impedimentos.** Os que estiveram abertos em algum momento do período: abertos no fim dele ou resolvidos nele.
   A espera conta até a resolução, o fim do período ou hoje (o que vier primeiro).
3. **Trabalho não planejado.** A fatia e as horas ("27% do tempo (3h de 11h) em ciclos intempestivos"); sem
   apontamento, "Sem apontamentos no período". É a única medida de tempo do relatório.

### Trabalho não planejado (intempestivas)

- **Regra** (`unplannedTime`, em `shared/src/yield.ts`): tempo em ciclos do tipo **Intempestiva** ÷ tempo apontado
  no período. Só os ciclos têm tipo; tarefas e reuniões entram só no total.
- **Sobreposição:** a mesma do tempo por categoria (`splitDay`): dentro do grupo conta uma vez; o trecho dividido com
  outra demanda vale metade para cada uma. Minutos inteiros; a fatia é arredondada e é nula sem apontamento.
- **Onde aparece:** no relatório do período e no Painel → Rendimento, como o selo **Não planejado** ao lado de
  "Predominou" (âmbar com ícone quando houve; neutro com "Nenhum · 0%" ou "Sem apontamentos").

