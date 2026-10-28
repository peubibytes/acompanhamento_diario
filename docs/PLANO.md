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
| Apontamento de horas | Existente (seções 1–7) | Ciclo sex→qui, meta, atividades, métricas, conformidade |
| Demandas | Existente, a expandir (seção 6 e 8) | Passa a cobrir chamados: identificadores, status, %, linha do tempo, impedimentos |
| Treinamentos | Novo (seção 8) | Capacitações planejadas e realizadas |
| Metas | Novo (seção 8) | Objetivos com prazo e progresso, ligados a atividades/demandas/treinamentos |
| Relatórios | Novo (seção 8) | Status diário/semanal/mensal exportável |
| Integração Azure | Futuro | Fora de escopo por enquanto |

### Glossário
- **Atividade:** unidade de trabalho diária (início, fim, projeto, status).
- **Apontamento:** registro de tempo gasto; é o conjunto de atividades do ciclo.
- **Demanda / Chamado:** trabalho acompanhado ao longo do tempo (pode ter SCTASK, RITM, user story).
- **Evento:** linha datada na linha do tempo de uma demanda.
- **Impedimento:** bloqueio com responsável externo e data de início.
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

### Atividade
- Campos: data, início, fim, duração (calculada), projeto/demanda, descrição,
  observações/entregáveis, status.
- `duração = fim − início`, com `fim > início`.
- Status: **Concluído, Não concluído, Pendente de aprovação, Não iniciado**.
- Horários sobrepostos no mesmo dia geram aviso (não bloqueiam).

### Métricas por dia (replicadas da planilha)
| Métrica | Regra |
|---|---|
| Horas apontadas | soma das durações do dia |
| Diferença | vazio se 0h · `00:00` se igual à meta · `+hh:mm` se excedeu · `-hh:mm` se faltou |
| Qtd atividades | atividades do dia com duração > 0 |
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
activities(id, date, start_minute, end_minute, project, description, notes, status,
           demand_id → demands (ON DELETE SET NULL), created_at, updated_at)
cycle_goals(cycle_start PRIMARY KEY, daily_goal_minutes)
settings(key PRIMARY KEY, value)          -- default_daily_goal_minutes
demands(id, title, description, external_ids (JSON), system, kind, priority, progress_percent,
        target_minutes (opcional), start_date, due_date, status, branch, pr_url, environment,
        created_at, updated_at)
demand_events(id, demand_id → demands (ON DELETE CASCADE), date, kind, text, created_at)
demand_blockers(id, demand_id → demands (ON DELETE CASCADE), owner, description, since,
                resolved_at, created_at)
```
O esquema evolui por migrações numeradas em `server/src/db.ts` (`PRAGMA user_version`).

### API
| Método | Rota | Uso |
|---|---|---|
| GET | `/api/cycles/:date` | ciclo da data: 5 dias com métricas + totais |
| PUT | `/api/cycles/:date/goal` | define a meta diária do ciclo (e o padrão dos próximos) |
| GET | `/api/activities?date=` | atividades de um dia |
| POST | `/api/activities` | cria |
| PUT | `/api/activities/:id` | edita |
| DELETE | `/api/activities/:id` | remove |
| GET | `/api/demands?status=` | demandas com métricas e resumo do acompanhamento, das mais urgentes para as demais; `status` aceita um status, `abertas` ou `encerradas` |
| GET | `/api/demands/:id` | demanda com métricas, atividades vinculadas, eventos e impedimentos |
| POST | `/api/demands` | cria |
| PUT | `/api/demands/:id` | edita |
| DELETE | `/api/demands/:id` | remove (as atividades ficam sem vínculo; eventos e impedimentos vão junto) |
| POST/PUT/DELETE | `/api/demands/:id/events[/:eventId]` | linha do tempo da demanda |
| POST/PUT/DELETE | `/api/demands/:id/blockers[/:blockerId]` | impedimentos da demanda |

## 3. Telas

1. **Painel (`/`)** — visual: KPIs (meta semanal, total realizado, dias conformes,
   % preenchido em anel), gráfico por dia útil com a linha de meta, faixa de status do
   ciclo (na quinta: "Hoje é dia de apontamento"), seletor de meta, navegação entre
   semanas, botão "Registrar atividades" e, mais abaixo, "Mostrar mais".
2. **Atividades (`/atividades`)** — abas Sex/Seg/Ter/Qua/Qui; mostra só o dia escolhido:
   resumo do dia, lista editável e formulário (início, fim, duração ao vivo, projeto,
   descrição, observações, status).
3. **Detalhamento (`/detalhes`)** — tabela fiel à planilha: data, dia, meta, horas,
   diferença, qtd atividades, conformidade, diagnóstico e linha de total geral.

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
  (substituído na v0.4 pelos 6 status da seção 8.1; a meta de horas passou a ser opcional).
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

- **Coluna de métricas no painel:** o usuário escolhe uma visão por vez: *Acompanhamento por
  dia útil* (anel de horas apontadas, meta semanal, total realizado, dias conformes e o gráfico
  diário, juntos), *Distribuição do dia* ou *Demandas em andamento*. A escolha fica salva no
  navegador. No celular, a coluna vira um controle segmentado.
- **Lembretes fora da tela:** os alertas de apontamento irregular, de prazo das demandas e o
  aviso do dia de apontamento saíram do painel e da tela de detalhes.
- **Sino no header:** contador do que pede atenção (vermelho se houver algo urgente); ao passar
  o mouse ou focar pelo teclado, mostra um resumo; ao clicar, abre a tela de lembretes.
- **Tela "Lembretes e agenda" (`/lembretes`):** acessível só pelo sino, sem entrada no seletor
  de telas. Lembretes agrupados por gravidade e agenda por data (prazos vencidos, prazos e
  inícios de demandas, dias de apontamento do ciclo atual e do próximo).

## 8. Expansão: gestão do colaborador (v0.4 — em andamento)

Objetivo: transformar o app, de controlador de apontamentos, em organizador completo do dia a dia
do colaborador, incorporando o acompanhamento de demandas que hoje é feito em texto solto
(chamados com status `[X]`/`[80%]` e bullets datados).

### 8.1 Demandas ampliadas (estende a "Demanda de ciclo" da seção 6) — ✅ implementado
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
  Linha do tempo (entrada rápida: data, tipo e texto), Impedimentos (resolver com um clique) e Apontamentos.
- **Formulário:** vínculos técnicos numa seção recolhível, aberta só se já houver algum preenchido.

### 8.2 Treinamentos
Título, tipo, data/período, carga horária, status (planejado / em curso / concluído),
anotações e vínculo opcional com uma meta. Pode gerar atividades no apontamento.

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

### Fora de escopo (atualizado)
Azure (códigos e apontamento automático), login/múltiplos usuários (roda localmente),
folha de pagamento, cobrança a clientes, controle de ponto oficial.