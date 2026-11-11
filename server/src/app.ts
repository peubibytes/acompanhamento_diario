import { existsSync } from 'node:fs';
import { join } from 'node:path';
import express, { type ErrorRequestHandler } from 'express';
import { buildDemandSummary, buildTimeline, compareDemands, demandLabel, todayISO, type Demand, type ISODate, type SyncedFolder } from '@acomp/shared';
import type { Repo } from './repo.ts';
import type { BackupService } from './backup.ts';
import type { RouteContext } from './http.ts';
import { registerActivityRoutes } from './routes/activities.ts';
import { registerBoardRoutes } from './routes/board.ts';
import { registerDataRoutes } from './routes/data.ts';
import { registerDemandRoutes } from './routes/demands.ts';
import { registerPeriodRoutes } from './routes/periods.ts';
import { registerReportRoutes } from './routes/reports.ts';
import { registerTimelineRoutes } from './routes/timeline.ts';
import { baseHeaders, IMPORT_LIMIT, JSON_LIMIT, localOnly } from './security.ts';

interface AppOptions {
  repo: Repo;
  /** Injetável para testes. */
  today?: () => ISODate;
  /** Pasta com o build do front, servida em produção. */
  staticDir?: string;
  /** Nomes de host liberados além de localhost (ex.: para expor na rede com HOST definido). */
  allowedHosts?: string[];
  /** Backups do banco: status na tela e cópia de segurança antes de substituir os dados. */
  backups?: Pick<BackupService, 'status' | 'createExtra'>;
  /** Serviço que sincroniza a pasta do banco (ver storage.ts); a tela avisa em Lembretes. */
  syncedFolder?: SyncedFolder | null;
}

export function createApp({ repo, today = () => todayISO(), staticDir, allowedHosts, backups, syncedFolder = null }: AppOptions) {
  const app = express();
  app.disable('x-powered-by');
  app.use(baseHeaders);
  app.use(localOnly(allowedHosts));
  // A importação traz o banco inteiro: só ela tem limite maior (a de cima vale para o resto).
  const importJson = express.json({ limit: IMPORT_LIMIT });
  const commonJson = express.json({ limit: JSON_LIMIT });
  app.use((req, res, next) => (req.path === '/api/import' ? importJson(req, res, next) : commonJson(req, res, next)));

  /** Métricas das demandas (horas apontadas e prazo) e o resumo da linha do tempo e dos impedimentos. */
  const summarize = (demands: Demand[]) => {
    const now = today();
    const linked = repo.listLinkedActivities();
    const history = {
      events: repo.listAllEvents(),
      blockers: repo.listAllBlockers(),
      statusChanges: repo.listAllStatusChanges(),
      boardRanks: repo.boardRanks(),
    };
    return demands.map((d) => buildDemandSummary(d, linked, now, history)).sort(compareDemands);
  };

  /**
   * Linha do tempo unificada dos ciclos (eventos e impedimentos), do mais recente ao mais antigo.
   * Sem `demandId`, a de todos os ciclos.
   */
  const timelineOf = (demandId?: number) => {
    const labels = new Map<number, string>();
    for (const d of repo.listDemands()) if (d.category === 'ciclo') labels.set(d.id, demandLabel(d));
    return buildTimeline(
      demandId ? repo.listDemandEvents(demandId) : repo.listAllEvents(),
      demandId ? repo.listDemandBlockers(demandId) : repo.listAllBlockers(),
      today(),
      (id) => labels.get(id),
    );
  };

  // As rotas, por domínio (server/src/routes). Nenhum caminho de um grupo cobre o de outro: a ordem não importa.
  const ctx: RouteContext = { repo, today, summarize, timelineOf, backups, syncedFolder };
  registerPeriodRoutes(app, ctx);
  registerReportRoutes(app, ctx);
  registerTimelineRoutes(app, ctx);
  registerActivityRoutes(app, ctx);
  registerDemandRoutes(app, ctx);
  registerBoardRoutes(app, ctx);
  registerDataRoutes(app, ctx);

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Rota não encontrada.' });
  });

  if (staticDir && existsSync(staticDir)) {
    app.use(express.static(staticDir));
    app.get('/{*path}', (_req, res) => res.sendFile(join(staticDir, 'index.html')));
  }

  const onError: ErrorRequestHandler = (err, req, res, _next) => {
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'JSON inválido.' });
    }
    if (err?.type === 'entity.too.large') {
      return res.status(413).json({ error: `Corpo da requisição grande demais (máximo ${req.path === '/api/import' ? IMPORT_LIMIT : JSON_LIMIT}).` });
    }
    console.error(err);
    res.status(500).json({ error: 'Erro interno no servidor.' });
  };
  app.use(onError);

  return app;
}
