# Acompanhamento Diário

Gestor de tempo e atividades para colaboradores: demandas (chamados, reuniões, treinamentos e ciclos),
apontamentos de horas, linha do tempo dos ciclos, painel com rendimento e relatório para a daily ou o 1:1.
Roda na sua máquina, sem login e sem nuvem.

A fonte da verdade (visão, regras, arquitetura, API e telas) é o [docs/PLANO.md](docs/PLANO.md); as
decisões ficam em [docs/decisions](docs/decisions).

## Requisitos

- Node.js 26 (a versão do [.nvmrc](.nvmrc); o mínimo aceito é o de `engines` no `package.json`).
- npm 11.

## Como rodar

Sem terminal: dois cliques em **`iniciar.cmd`** (Windows) ou `./iniciar.sh` (macOS e Linux). Ele confere o Node,
instala as dependências na primeira vez (e depois de uma atualização), sobe o servidor e abre o navegador em
http://127.0.0.1:3001. Feche a janela para parar.

Pelo terminal:

```bash
npm install
npm run dev               # API em http://127.0.0.1:3001 e tela em http://localhost:5173
npm start                 # build da tela + servidor único em http://127.0.0.1:3001
```

## Verificações

```bash
npm run typecheck         # tipos de shared, server e web
npm test                  # regras (shared), API (server), varredura e telas (web, Vitest)
npm run check:sensitive   # anti-vazamento: planilhas, bancos, chamados reais, e-mails
```

As três rodam no CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) em todo PR e em todo push na `main`.

## Acesso e segurança

A aplicação **não tem login**: quem alcança a porta lê e altera tudo. Por isso o servidor escuta só em
`127.0.0.1`.

| Variável | Padrão | Uso |
|---|---|---|
| `PORT` | `3001` | porta do servidor |
| `HOST` | `127.0.0.1` | interface em que o servidor escuta |
| `ALLOWED_HOSTS` | vazio | nomes de acesso liberados além da própria máquina, separados por vírgula, sem porta |
| `DB_PATH` | `server/data/acompanhamento.db` | arquivo do banco |
| `BACKUP_DIR` | `server/data/backups` | pasta dos backups |

Expor na rede exige `HOST` e `ALLOWED_HOSTS` explícitos (ex.: `HOST=0.0.0.0 ALLOWED_HOSTS=meu-pc`), e o
servidor avisa ao iniciar. **O risco é seu:** numa rede compartilhada, qualquer pessoa nela acessa os dados.
Prefira uma VPN ou um túnel com login.

## Dados e backup

- O banco é um arquivo SQLite em `server/data/` (fora do git).
- **Backup diário automático** em `server/data/backups/acompanhamento-AAAA-MM-DD.db`, ao iniciar e quando o
  dia vira; ficam os 14 mais recentes.
- Cópias extras: `pre-migracao-N.db` antes de atualizar o esquema e `pre-importacao-….db` antes de uma
  importação que substitui os dados.
- **Exportar:** Lembretes e agenda (sino) → **Seus dados** → "Exportar dados", ou `GET /api/export`.
- **Importar:** `POST /api/import` com o JSON exportado (só em banco vazio; `?replace=true` substitui, depois
  de guardar um backup). A versão do esquema precisa ser a mesma.

### Restaurar um backup

1. Pare o servidor (Ctrl+C no terminal do `npm run dev` ou `npm start`).
2. Escolha o arquivo em `server/data/backups/`.
3. Apague `server/data/acompanhamento.db-wal` e `server/data/acompanhamento.db-shm`, se existirem.
4. Copie o backup por cima de `server/data/acompanhamento.db`.
5. Inicie o servidor de novo. Se o backup for de uma versão anterior, as migrações rodam sozinhas (com
   `pre-migracao-N.db` antes).

## Dados reais

Planilhas, bancos, nomes, números de chamado e e-mails reais **nunca** entram no repositório, nem em testes,
capturas ou commits. O `.gitignore` e o `npm run check:sensitive` ajudam, mas não substituem o cuidado.

## Estrutura

```
shared/   regras de negócio em TypeScript puro, com testes
server/   Node + Express + SQLite (node:sqlite)
web/      React + Vite + Tailwind
scripts/  utilitários do repositório (varredura anti-vazamento)
docs/     plano, decisões e documentação técnica
```
