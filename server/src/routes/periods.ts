// Períodos (semana e mês), meta diária, métricas de acompanhamento e rendimento.

import type { Express } from 'express';
import { z } from 'zod';
import {
  buildCycleSummary,
  buildOverview,
  buildPeriodSummary,
  cycleYield,
  familySplit,
  getCycle,
  getPeriod,
  previousPeriod,
  unplannedTime,
  type ISODate,
} from '@acomp/shared';
import { badRequest, isoDate, scaleSchema, type RouteContext } from '../http.ts';

const goalSchema = z.object({
  dailyGoalMinutes: z.int('Meta inválida.').min(1, 'A meta deve ser maior que zero.').max(24 * 60),
});

export function registerPeriodRoutes(app: Express, { repo, today, summarize, timelineOf }: RouteContext) {
  app.get('/api/cycles/:date', (req, res) => {
    const date = isoDate.safeParse(req.params.date);
    if (!date.success) return badRequest(res, date.error);

    const cycle = getCycle(date.data);
    const activities = repo.listActivities(cycle.start, cycle.end);
    res.json(buildCycleSummary(date.data, activities, repo.goalForCycle(cycle.start)));
  });

  app.put('/api/cycles/:date/goal', (req, res) => {
    const date = isoDate.safeParse(req.params.date);
    if (!date.success) return badRequest(res, date.error);
    const body = goalSchema.safeParse(req.body);
    if (!body.success) return badRequest(res, body.error);

    const { start } = getCycle(date.data);
    const makeDefault = start >= getCycle(today()).start;
    repo.setCycleGoal(start, body.data.dailyGoalMinutes, makeDefault);
    res.json({ cycleStart: start, dailyGoalMinutes: body.data.dailyGoalMinutes, appliesToNextCycles: makeDefault });
  });

  /** Resumo do período da data (semana ou mês): dias úteis com métricas e totais. */
  app.get('/api/periods/:date', (req, res) => {
    const date = isoDate.safeParse(req.params.date);
    if (!date.success) return badRequest(res, date.error);
    const scale = scaleSchema.safeParse(req.query.scale);
    if (!scale.success) return badRequest(res, scale.error);

    const period = getPeriod(date.data, scale.data);
    const activities = repo.listActivities(period.start, period.end);
    // A meta de cada dia é a do ciclo de apontamento a que ele pertence.
    const goals = new Map<ISODate, number>();
    const goalForDay = (day: ISODate) => {
      const { start } = getCycle(day);
      if (!goals.has(start)) goals.set(start, repo.goalForCycle(start));
      return goals.get(start)!;
    };
    res.json(buildPeriodSummary(period, activities, goalForDay));
  });

  /** Métricas de acompanhamento do período da data (semana por padrão): tarefas e ciclos. */
  app.get('/api/metrics', (req, res) => {
    const date = isoDate.default(today()).safeParse(req.query.date);
    if (!date.success) return badRequest(res, date.error);
    const scale = scaleSchema.safeParse(req.query.scale);
    if (!scale.success) return badRequest(res, scale.error);
    const { start, end } = getPeriod(date.data, scale.data);
    res.json(buildOverview(summarize(repo.listDemands()), repo.listLinkedActivities(), { start, end }, today()));
  });

  /**
   * Rendimento do período: tempo em Tarefas × Ciclos e o rendimento de cada ciclo em relação ao
   * período anterior equivalente.
   */
  app.get('/api/yield', (req, res) => {
    const date = isoDate.default(today()).safeParse(req.query.date);
    if (!date.success) return badRequest(res, date.error);
    const scale = scaleSchema.safeParse(req.query.scale);
    if (!scale.success) return badRequest(res, scale.error);

    const period = getPeriod(date.data, scale.data);
    const previous = previousPeriod(period);
    const demands = summarize(repo.listDemands());
    const cycles = demands.flatMap((d) =>
      d.category === 'ciclo' ? [{ id: d.id, label: d.label, status: d.status, startDate: d.startDate }] : [],
    );
    res.json({
      period,
      previous,
      split: familySplit(repo.listActivities(period.start, period.end), demands, period),
      unplanned: unplannedTime(repo.listActivities(period.start, period.end), demands, period),
      cycles: cycleYield(cycles, repo.listActivities(previous.start, period.end), timelineOf(), period, previous),
    });
  });
}
