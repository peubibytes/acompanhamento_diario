// Relatórios para a daily e o 1:1.

import type { Express } from 'express';
import { buildDailyReport, buildPeriodReport, getPeriod, previousWorkday } from '@acomp/shared';
import { badRequest, isoDate, scaleSchema, type RouteContext } from '../http.ts';

export function registerReportRoutes(app: Express, { repo, today, summarize }: RouteContext) {
  /** Relatório do dia para a daily ou o 1:1; sem `date`, o dia útil anterior a hoje. */
  app.get('/api/reports/daily', (req, res) => {
    const date = isoDate.default(previousWorkday(today())).safeParse(req.query.date);
    if (!date.success) return badRequest(res, date.error);
    res.json(
      buildDailyReport({
        date: date.data,
        activities: repo.listActivities(date.data, date.data),
        demands: summarize(repo.listDemands()),
        events: repo.listAllEvents(),
        blockers: repo.listAllBlockers(),
        statusChanges: repo.listAllStatusChanges(),
      }),
    );
  });

  /** Relatório do período (semana ou mês) da data; sem `date`, o período de hoje. */
  app.get('/api/reports/period', (req, res) => {
    const date = isoDate.default(today()).safeParse(req.query.date);
    if (!date.success) return badRequest(res, date.error);
    const scale = scaleSchema.safeParse(req.query.scale);
    if (!scale.success) return badRequest(res, scale.error);

    const period = getPeriod(date.data, scale.data);
    res.json(
      buildPeriodReport({
        period,
        today: today(),
        activities: repo.listActivities(period.start, period.end),
        demands: summarize(repo.listDemands()),
        events: repo.listAllEvents(),
        blockers: repo.listAllBlockers(),
        statusChanges: repo.listAllStatusChanges(),
      }),
    );
  });
}
