# Plano de ação — Acompanhamento Diário

Aplicação web (React + Node + SQLite) que replica a lógica da planilha
`Acompanhamento diário.xlsx` (mantida fora do repositório por conter dados reais), com foco no **acompanhamento do apontamento de horas**.
O usuário registra as atividades ao longo do ciclo (sexta → quinta) e, na quinta-feira,
faz o apontamento no Azure (integração futura). A meta é chegar a quinta com 100% preenchido.

## 1. Regras de negócio

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
           created_at, updated_at)
cycle_goals(cycle_start PRIMARY KEY, daily_goal_minutes)
settings(key PRIMARY KEY, value)          -- default_daily_goal_minutes
```

### API
| Método | Rota | Uso |
|---|---|---|
| GET | `/api/cycles/:date` | ciclo da data: 5 dias com métricas + totais |
| PUT | `/api/cycles/:date/goal` | define a meta diária do ciclo (e o padrão dos próximos) |
| GET | `/api/activities?date=` | atividades de um dia |
| POST | `/api/activities` | cria |
| PUT | `/api/activities/:id` | edita |
| DELETE | `/api/activities/:id` | remove |

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
