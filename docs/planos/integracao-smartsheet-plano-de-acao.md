# Plano de ação: envio das horas apontadas ao Smartsheet

> Documento de trabalho para execução pelo Claude Code. Ao terminar cada fase, o comportamento vai para
> `docs/PLANO.md` (fonte da verdade; hoje ele diz "Integração Azure: fora de escopo") e a decisão para
> `docs/decisions/0017-envio-de-horas-ao-smartsheet.md` (próximo número livre); este arquivo pode ser removido.
> Valem as regras do projeto: UI, textos e commits em pt-BR; identificadores em inglês; nenhum dado real em código,
> testes ou commits; nada de renomear tabela ou rota sem migração e aprovação; **não expandir o módulo de
> apontamento** (o vínculo com o destino fica na Demanda).
>
> **Segurança deste documento:** o repositório é público. Nenhum token, URL interna, nome de tenant, projeto ou
> pessoa real da empresa entra aqui nem nos commits. Os exemplos são fictícios.

## Contexto

- Objetivo: enviar os registros de horas do app ao sistema de apontamento da empresa, **declarando só uma vez**
  (o app é a origem; o destino só recebe). Sentido único: app → destino. Ler de volta fica fora do escopo inicial.
- Hoje a empresa usa o **7pace** (dentro do Azure DevOps); em **dez/2026** migra para o **Smartsheet**. O foco é o
  Smartsheet; o 7pace serve só de referência de como o processo funciona hoje.
- O app está em fase de demonstração para a gestão (versão na nuvem, sem banco e sem app completo). A integração
  real não precisa funcionar na demonstração.

### Fontes lidas

- **Smartsheet Resource Management (RM):** páginas de introdução, autenticação, limites e paginação em
  `developers.smartsheet.com/api/resource_management/` e a spec OpenAPI (`openapi.yaml`, "Download OpenAPI
  description"). O que vem dela está marcado com ✔.
- **7pace:** a spec não pôde ser lida (o Swagger UI carrega a spec no navegador; o `swagger-config.json` público dá
  404). O que se cita do 7pace vem do resumo do processo atual e está marcado com **[confirmar]**. Para fechar,
  basta o link direto do JSON que o seletor de versões carrega (aba Rede do navegador).
- Nenhuma instrução dirigida a assistentes foi encontrada nas páginas do Smartsheet.

## 1. Estado atual do repositório

- Monorepo npm em TypeScript: `shared/` (regras puras), `server/` (Express 5, `node:sqlite`, zod; TypeScript
  rodado direto pelo Node ≥ 23.6) e `web/` (React, Vite, TanStack Query, Tailwind).
- Apontamento = tabela `activities`: `date`, `start_minute`, `end_minute`, `demand_id → demands`, `description`,
  `notes` e, nas reuniões (v0.14), `participants` e `subject`; sempre em minutos inteiros. A demanda tem uma
  categoria (`ciclo`, `chamado`, `reuniao`, `treinamento` ou `atividade`).
- **O valor a lançar já existe:** `loggableMinutes` (`shared/src/breakdown.ts`, decisão 0010) divide os trechos
  sobrepostos em partes iguais e dá o "Apontar X", feito para lançar no Azure. É o dado certo para enviar, mais do
  que a duração bruta.
- Esquema por migrações em `server/src/db.ts` (`MIGRATIONS`, `PRAGMA user_version`; a última é a 9, da v0.14).
  Configuração por variável de ambiente (`server/src/index.ts`: `PORT`, `HOST`, `DB_PATH`, `BACKUP_DIR`); não há
  `.env` nem leitura de arquivo de segredos.
- Execução só local (`127.0.0.1`, `iniciar.cmd`); o README diz "sem login e sem nuvem". **A demo na nuvem não está
  neste repositório.**
- Testes: `node --test` (`shared`, `server`, `scripts`) e Vitest nas telas com a API real em memória. O CI roda
  `check:sensitive`, `typecheck`, `test` e `build`.
- **Dívidas que afetam a integração:** não há tabela de vínculo externo nem de envio; não há cliente HTTP de saída
  nem suporte a proxy; o `.gitignore` não cobre `.env*`; o `check-sensitive` não procura tokens; o `PLANO.md` põe a
  integração fora de escopo (precisa da decisão 0017).

## 2. Perguntas em aberto (da mais para a menos importante)

Nenhuma bloqueia o **plano**. As perguntas 1 e 2 bloqueiam a **fase 4** (envio real) e se resolvem na fase 0.

| # | Pergunta | Suposição até a resposta |
|---|---|---|
| 1 | **Qual API do Smartsheet a empresa usa:** Resource Management ou planilha clássica? É a que mais muda o desenho (ver D6) | Resource Management |
| 2 | **No RM, você é usuário licenciado ou "managed resource"?** ✔ A spec diz que não se cria time entry confirmada para *managed resources* pela API, e o `user_id` precisa ser de usuário licenciado | Licenciado |
| 3 | **O encarregado aceita entregar um token da organização a um app pessoal?** O token do RM é da organização inteira, não de um usuário. Se não, a saída é exportar CSV para importação manual | Talvez não; por isso o CSV fica como alternativa |
| 4 | **Qual granularidade a empresa exige?** Um lançamento por dia e projeto ou um por apontamento? `task` e `notes` são obrigatórios por regra interna? | Um por dia × projeto × task, com notas curtas |
| 5 | **Como as demandas viram projetos no Smartsheet?** Ex.: chamados num projeto de sustentação, reuniões num projeto interno ou num leave type | Vínculo por demanda, com padrão por categoria |
| 6 | **A aprovação semanal será submetida pelo app ou pela interface do Smartsheet?** | Pela interface do Smartsheet, fora do escopo inicial |
| 7 | **Rede corporativa:** há proxy HTTP? O app rodará na máquina corporativa? | Sim, com proxy |
| 8 | **Onde fica a versão de demonstração na nuvem** (repositório, branch, hospedagem)? | Build do `web/` com dados fictícios |

## 3. Decisões de arquitetura

A direção inicial (modelo único, interface de provedor, adaptadores Simulação e Smartsheet, configuração por
variável de ambiente, log de envio) vale no núcleo, com quatro cortes: o lançamento é derivado e não guardado
(D1), a interface tem duas operações e não três (D2), o 7pace não ganha adaptador (D3) e não há pacote separado
(D8).

| # | Decisão | Alternativas consideradas | Por quê |
|---|---|---|---|
| D1 | **O lançamento não é guardado: é derivado.** `buildTimesheet(activities, demands, links, period)` em `shared/src/timesheet.ts` agrega por dia × destino × task e usa os minutos de `loggableMinutes`. Chave estável: `sha1(date + destino + task)` | Guardar um "lançamento" por apontamento; enviar a duração bruta | A soma por dia bate com o total do dia, com a sobreposição dividida, como o "Apontar". O RM pensa em horas por dia e projeto, com notas de até 256 caracteres. Um registro derivado não fica desatualizado. É função pura, testável sem rede |
| D2 | **Interface do provedor com duas operações:** `preview(entries)` (valida; sem rede na Simulação) e `push(entries, log)`. Sem `list` na v1 | Validar, enviar e listar | Leitura está fora do escopo. Listar a faixa de datas só serve para conciliar depois de uma falha parcial, porque o RM não tem chave de idempotência; isso fica como passo interno do adaptador RM, não da interface |
| D3 | **Dois adaptadores na v1: `simulacao` (padrão) e `smartsheet-rm`.** O export CSV é só uma visão do mesmo modelo, não um provedor | Adaptador 7pace agora; adaptador da planilha clássica | O 7pace sai em dez/2026, então implementar seria desperdício. A planilha clássica entra só se a pergunta 1 apontar para ela. O CSV garante saída mesmo sem token |
| D4 | **Vínculo na Demanda, não no apontamento.** Migração 10 com `demand_links(demand_id, provider, assignable_id, task)` e um padrão por categoria em `settings` | Campo "projeto Smartsheet" no apontamento | Segue o CLAUDE.md ("integre via Demanda"). Declara-se uma vez e o vínculo vale para todos os apontamentos da demanda |
| D5 | **Log de envio** em `sync_log(key, provider, date, assignable_id, task, minutes, payload_hash, remote_id, status, sent_at, error)`. Antes de enviar, cada lançamento cai num de quatro casos: igual ao log → pula; minutos mudaram → `PUT` no `remote_id`; novo → `POST`; demanda sem vínculo → bloqueado | Marcar o apontamento como "enviado" | Sem idempotência do lado de lá, o `remote_id` local é a única defesa contra duplicar. Apontamentos são corrigidos depois do envio, então é preciso atualizar, não só criar |
| D6 | **Se o destino for a planilha clássica:** o adaptador vira `POST /sheets/{id}/rows` com mapeamento de **colunas** (ids de coluna) em vez de `assignable_id`. Token pessoal (Bearer); a idempotência pode ficar numa coluna "ID externo" | — | O modelo de D1 e o log de D5 não mudam. Muda só o adaptador e o que se vincula na Demanda (projeto RM → valor de coluna). Por isso D1 é neutro em relação ao destino |
| D7 | **Segredos só no servidor.** `server/.env.local`, lido com `node --env-file-if-exists` no script `start` do server: `INTEGRATION_PROVIDER`, `SMARTSHEET_RM_BASE_URL`, `SMARTSHEET_RM_TOKEN`, `SMARTSHEET_RM_USER_ID`. O navegador recebe só `{ provider, configured }` | Token no banco ou digitado na tela; cofre do Windows | É o padrão que o projeto já usa (`HOST`, `DB_PATH`), sem dependência nova. O token nunca passa pelo front, pela exportação (`/api/export`) nem pelos backups. Cofre do SO seria superengenharia para um usuário só |
| D8 | **Sem pacote ou serviço separado.** Rotas em `server/src/routes/integration.ts`, rede em `server/src/integration/`, regra pura em `shared/` | Workspace `integration/` | O projeto tem cerca de 5 mil linhas em `server` e `shared`; uma pasta a mais resolve |

## 4. Plano em fases

### Fase 0: validações externas (sem código)

- **Objetivo:** responder as perguntas 1, 2, 3 e 7 antes de escrever o adaptador real.
- **Tarefas:**
  - Com o **encarregado do Smartsheet:** confirmar qual API, o seu tipo de usuário, a política de token e se existe
    conta ou projeto de teste.
  - Com a **TI:** pedir liberação de saída para `api.rm.smartsheet.com` (ou o domínio regional) a partir da máquina
    corporativa e o endereço do proxy. O teste é um `GET` sem token, que deve devolver 401, e não um bloqueio de
    rede. (A máquina corporativa já bloqueou o GitHub numa tentativa de clonar; validar isso cedo.)
  - Pedir ao encarregado **uma cópia ou um projeto de teste** para receber os envios. Nunca testar no real.
- **Aceite:** respostas registradas na decisão 0017 (sem dados reais) e um 401 vindo do domínio da API pela rede
  corporativa.
- **Riscos:** token negado → caminho CSV (fase 3); rede bloqueada → rodar fora da rede ou CSV.
- **Dependências:** encarregado do Smartsheet, TI.

### Fase 1: higiene de segredos (pode começar já)

- **Tarefas:**
  - Adicionar `.env`, `.env.*` e `!.env.example` ao `.gitignore`.
  - Criar `server/.env.example` com valores fictícios.
  - Ampliar `scripts/check-sensitive.mjs` e o teste dele para falhar com: qualquer `.env` rastreado; strings com
    cara de token (`auth:` ou `Bearer` seguidos de 20 ou mais caracteres); domínios de tenant
    (`<qualquer>.timehub.7pace.com` diferente de `timehub`; URLs do Smartsheet com id).
  - **Varrer o histórico:** `git log -p --all` mais o novo `check-sensitive` sobre cada commit; de preferência
    também `gitleaks detect` (binário oficial, baixado com aprovação). Vazamento achado → token revogado, e só
    depois reescrita do histórico.
- **Aceite:** o CI fica vermelho com um `.env` falso commitado num branch de teste; a varredura do histórico sai
  limpa e registrada.

### Fase 2: modelo derivado e Simulação (sem rede)

- **Tarefas:**
  - **`shared/src/timesheet.ts`:** `buildTimesheet` e `toHours(minutes)`. A conversão usa duas casas e maior resto
    por dia, para a soma do dia em horas bater com o total. Gera as notas: as descrições do dia (e o assunto, nas
    reuniões) arrumadas com `tidyText` e cortadas em 256 caracteres. Testes em `shared/test/timesheet.test.ts`.
  - **Migração 10** em `server/src/db.ts`: tabelas `demand_links` e `sync_log` (com o backup `pre-migracao-9`
    automático).
  - **`server/src/integration/`:** `types.ts` (interface `Provider`), `simulation.ts` (só calcula o que seria
    enviado) e `index.ts` (escolhe o adaptador pela variável de ambiente).
  - **Rotas** em `server/src/routes/integration.ts`:
    - `GET /api/integration/preview?date=&scale=week`: lançamentos e o estado de cada um (novo, alterado, enviado,
      sem vínculo);
    - `GET /api/integration/status`: provedor e se está configurado;
    - `GET /api/integration/export.csv`.
  - **Tela:** a aba "Envio de horas" em Relatório ou em Detalhes (não em Apontamentos), e o vínculo com o projeto no
    formulário da Demanda (`DemandForms.tsx`, numa seção recolhível como os vínculos técnicos).
  - **Documentação:** `PLANO.md` (seção nova, API, modelo de dados) e decisão 0017.
- **Aceite:** com dados fictícios, a prévia da semana soma exatamente o total de `/api/periods`, e uma demanda sem
  vínculo aparece como bloqueada.

### Fase 3: CSV e demonstração

- **Tarefas:** o CSV no formato que o encarregado indicar para importação; a tela de prévia com dados fictícios para
  a demo (seção 7).
- **Aceite:** o CSV abre no Excel com acentos e decimais corretos (UTF-8 com BOM; separador `;` em pt-BR
  [confirmar]).

### Fase 4: adaptador Smartsheet RM (depende da fase 0)

- **Tarefas:**
  - **`server/src/integration/smartsheetRm.ts`:** `fetch` com o cabeçalho `auth` (nunca o token na URL, embora a
    API aceite `?auth=`).
    - Antes de enviar, `GET /users/{user_id}/time_entries?from=&to=` para conciliar: o que existe sem estar no log
      aparece como "já lançado fora do app" e não é duplicado.
    - Para cada lançamento, `POST /users/{user_id}/time_entries` ou `PUT /users/{user_id}/time_entries/{id}`,
      **em série**, um de cada vez.
    - Diante de um 429, esperar até `X-RateLimit-Reset` e tentar no máximo 3 vezes (não 25, como no exemplo da
      documentação).
    - Envio parcial: cada item tem o seu status no log.
  - **Lista de projetos para o vínculo:** `GET /assignables` e `GET /projects/{id}/phases`, paginados com
    `per_page=100`.
  - **Proxy:** `NODE_USE_ENV_PROXY=1` mais `HTTPS_PROXY` no `.env.local` [confirmar a versão do Node da máquina].
  - **Confirmação dupla na tela:** a prévia pergunta "Enviar N lançamentos (Xh) ao Smartsheet?".
  - **Trava:** `INTEGRATION_ALLOW_REAL=1` só no `.env.local` da máquina corporativa.
- **Aceite:** no projeto ou cópia de teste, enviar duas vezes a mesma semana cria zero duplicatas, e alterar um
  apontamento gera exatamente um `PUT`.
- **Riscos:** projeto com `timeentry_lockout` ✔ ou entrada já aprovada recusando a gravação; a mensagem de erro deve
  ser clara e o item fica no log.

### Fase 5 (opcional): submeter para aprovação

- **Tarefas:** `POST /approvals` com `status: "pending"` e o `updated_at` de cada entrada ✔ (a API devolve 400 se
  ele estiver desatualizado); `DELETE /approvals/{id}` para revogar enquanto estiver pendente ✔. Pela API só se
  submete; aprovar é de administradores ✔.
- **Condição:** só se a pergunta 6 pedir.

## 5. Estratégia de testes

- **Sem rede, sempre:** o padrão em teste e em CI é `INTEGRATION_PROVIDER=simulacao`. O adaptador RM recebe o
  `fetch` injetado (`createRmProvider({ fetch, baseUrl, token })`).
- **Adaptador** (`server/test/integration.test.ts`), com um `fetch` falso que grava as chamadas:
  - o corpo exato do `POST`;
  - `PUT` em vez de `POST` quando já há `remote_id`;
  - um 429 com `X-RateLimit-Reset` (relógio congelado, sem espera real);
  - a falha parcial;
  - o token ausente da URL e das mensagens de log.
- **Regras** (`shared/test/timesheet.test.ts`): sobreposição dividida; arredondamento com soma igual ao total; dia
  sem apontamento; demanda sem vínculo; apontamentos antigos sem demanda; corte de notas em 256 caracteres; chave
  estável entre execuções.
- **Banco:** a migração 10 em banco vazio e num banco na versão 9 (com o backup `pre-migracao-9` gerado).
- **Tela** (Vitest): a prévia com os estados novo, enviado, alterado e sem vínculo; o botão de envio desabilitado na
  Simulação.
- **Guarda no CI:** um teste falha se algum teste chamar um host diferente de `127.0.0.1` (o `fetch` global é
  substituído no `setup`).
- **Teste real:** à mão, só no projeto ou cópia de teste da fase 0. Uma semana fictícia, um envio, um reenvio; nada
  de laço nem carga (✔ a documentação proíbe teste de estresse sem avisar o suporte, sob risco de suspender a conta).

## 6. Mapeamento de campos

| acompanhamento_diario | Smartsheet RM (`TimeEntryCreateRequest`) | 7pace, só referência **[confirmar tudo]** |
|---|---|---|
| `activities.date` | `date` (YYYY-MM-DD) ✔ | `timestamp` (data **e hora** de início) |
| `start_minute` | — (não existe no RM: perde-se) | parte do `timestamp` |
| `loggableMinutes` somados no dia × destino | `hours` (decimal, ex. 0.5) ✔; minutos ÷ 60 com 2 casas | `length` em **segundos** (minutos × 60, por apontamento) |
| `demand_links.assignable_id` (vínculo da Demanda) | `assignable_id`: projeto, phase ou leave type ✔ | `workItemId` (ou `comment` sem item) |
| categoria da demanda / `demand_links.task` | `task` (texto até 256, "categoria") ✔; valores aceitos **dependem da empresa** | `activityTypeId` |
| `description` + `notes` + `subject` (reunião) + nome da demanda (`demandLabel`) | `notes` (até 256) ✔; formato **depende da pergunta 4** | `comment` |
| — (configuração) | `user_id` (usuário **licenciado**) ✔; sem endpoint `/me`, vai no `.env.local` | `userId` (ou o dono do token) |
| — | `bill_rate_id` (opcional) ✔: não enviar | `billable` / `billableLength` |
| `sync_log.key` | **sem campo equivalente** ✔: idempotência só pelo log local | sem equivalente conhecido |
| `sync_log.remote_id` | `id` da resposta ✔ | `id` do worklog |
| (fase 5) | `POST /approvals`, `status: "pending"` ✔ | aprovação semanal |

### O que a documentação confirma, acrescenta ou deixa em aberto

- **Confirmado (RM):** URL base `https://api.rm.smartsheet.com/api/v1/`; cabeçalho `auth` com o token cru (sem
  "Bearer"); datas em YYYY-MM-DD; resposta 429 ao exceder o limite; o token é da organização, gerado por um
  Resourcing Administrator em Settings → Developer API (até 20 tokens, renováveis por `/api_tokens/renew/{id}`).
- **Acrescentado (RM):** há URLs por região (EU, AU e Gov; Gov exige também o Bearer da API clássica). Não há
  ambiente de teste documentado. Não há cota publicada: o exemplo mostra `X-RateLimit-Limit: 120`, e a documentação
  avisa que os limites mudam sem aviso. Paginação `{ paging, data }` com `per_page` até 1000. Entradas sugeridas
  (`is_suggestion: true`) são só leitura e não vêm por padrão. A API exige plano Pro, Enterprise ou Business.
- **Não confirmado (7pace):** criação em lote (até 500), modo de validação sem gravar e o fluxo de
  envio/revogação de aprovação semanal.

## 7. O que mostrar na demonstração

1. **"Declare uma vez, envie uma vez":** uma Demanda fictícia com o vínculo "Projeto Smartsheet: Sustentação
   (exemplo)".
2. **A aba "Envio de horas" em modo Simulação:** a semana com um lançamento por dia × projeto, em horas decimais. O
   total do dia bate com o Painel e a sobreposição já vem dividida.
3. **Os estados do envio:** "novo", "já enviado", "alterado desde o envio" e "sem vínculo, bloqueado", que mostram
   que não haverá duplicidade.
4. **O CSV baixado:** a saída que funciona mesmo sem token.
5. **Um slide** com o que falta: token, liberação da TI e projeto de teste, as dependências que a gestão pode
   ajudar a destravar.

Na demo, nenhum token, nenhum nome real de projeto e nenhuma chamada externa. Os dados são fictícios em `web/` ou no
build da nuvem (pergunta 8).

## 8. Os três principais riscos

1. **Vazamento do token da organização**, que abre toda a conta de RM da empresa.
   *Mitigação:* o token fica só em `server/.env.local`; `.gitignore` e `check-sensitive` cobrem `.env*` e padrões de
   token; o token nunca vai ao front, à exportação ou aos logs; a varredura do histórico vem antes da fase 2. Se o
   encarregado preferir, um token dedicado, com título próprio, para ser renovado ou revogado sozinho.
2. **Bloqueio de acesso:** a rede bloqueia a API ou o usuário é managed resource.
   *Mitigação:* a fase 0 valida isso antes do código real; as fases 2 e 3 entregam valor (prévia e CSV) mesmo que a
   fase 4 nunca aconteça.
3. **Duplicar ou divergir no destino**, porque o RM não tem chave de idempotência e apontamentos são corrigidos
   depois do envio.
   *Mitigação:* modelo derivado com chave estável; `sync_log` com o `remote_id`, que leva a `PUT` em vez de `POST`;
   conciliação da faixa de datas antes de cada envio; envio serial e com confirmação; só para um projeto de teste
   até o aceite da fase 4.
