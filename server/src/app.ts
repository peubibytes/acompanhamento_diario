import { existsSync } from 'node:fs';
import { join } from 'node:path';
import express, { type ErrorRequestHandler, type Response } from 'express';
import { z } from 'zod';
import {
  ACTIVITY_STATUSES,
  buildCycleSummary,
  buildDemandSummary,
  compareDemands,
  DEMAND_DEFAULTS,
  DEMAND_ENVIRONMENTS,
  DEMAND_EVENT_KINDS,
  DEMAND_KINDS,
  DEMAND_PRIORITIES,
  DEMAND_STATUS_GROUPS,
  DEMAND_STATUSES,
  formatHM,
  matchesDemandFilter,
  normalizeExternalId,
  getCycle,
  isValidISODate,
  isWorkday,
  todayISO,
  type Demand,
  type ISODate,
} from '@acomp/shared';
import type { Repo } from './repo.ts';

const isoDate = z.string().refine(isValidISODate, 'Data inválida (use AAAA-MM-DD).');

const activitySchema = z
  .object({
    date: isoDate.refine(isWorkday, 'Lançamentos são permitidos apenas em dias úteis.'),
    startMinute: z.int().min(0).max(24 * 60 - 1),
    endMinute: z.int().min(1).max(24 * 60),
    project: z.string().trim().min(1, 'Informe o projeto.').max(200),
    description: z.string().trim().max(2000).default(''),
    notes: z.string().trim().max(2000).default(''),
    status: z.enum(ACTIVITY_STATUSES, 'Status inválido.'),
    demandId: z.int('Demanda inválida.').positive('Demanda inválida.').nullable().default(null),
  })
  .refine((a) => a.endMinute > a.startMinute, {
    message: 'O horário de fim deve ser depois do início.',
    path: ['endMinute'],
  });

/** Até 999h59 — o mesmo limite do campo hh:mm da interface. */
const MAX_DEMAND_MINUTES = 999 * 60 + 59;

/** Letras, números e - _ . # / (ex.: SCTASK0012345, RITM0001, US-42). */
const EXTERNAL_ID = /^[A-Z0-9][A-Z0-9_.#/-]{0,39}$/;

const externalIdsSchema = z
  .array(z.string('Identificador inválido.'))
  .max(20, 'Informe no máximo 20 identificadores.')
  .transform((ids) => [...new Set(ids.map(normalizeExternalId).filter(Boolean))])
  .refine((ids) => ids.every((id) => EXTERNAL_ID.test(id)), 'Identificador externo inválido (use letras, números e - _ . # /).');

const demandSchema = (defaultStart: ISODate) =>
  z
    .object({
      title: z.string().trim().min(1, 'Informe o título da demanda.').max(200),
      description: z.string().trim().max(2000).default(''),
      externalIds: externalIdsSchema.default(DEMAND_DEFAULTS.externalIds),
      system: z.string().trim().max(200).default(DEMAND_DEFAULTS.system),
      kind: z.enum(DEMAND_KINDS, 'Tipo inválido.').default(DEMAND_DEFAULTS.kind),
      priority: z.enum(DEMAND_PRIORITIES, 'Prioridade inválida.').default(DEMAND_DEFAULTS.priority),
      progressPercent: z
        .int('Progresso inválido.')
        .min(0, 'O progresso deve ficar entre 0 e 100%.')
        .max(100, 'O progresso deve ficar entre 0 e 100%.')
        .default(DEMAND_DEFAULTS.progressPercent),
      targetMinutes: z
        .int('Meta de horas inválida.')
        .min(1, 'A meta de horas deve ser maior que zero.')
        .max(MAX_DEMAND_MINUTES, 'A meta de horas deve ser de no máximo 999h59.')
        .nullable()
        .default(null),
      startDate: isoDate.default(defaultStart),
      dueDate: isoDate.nullable().default(null),
      status: z.enum(DEMAND_STATUSES, 'Status inválido.').default('novo'),
      branch: z.string().trim().max(200).default(DEMAND_DEFAULTS.branch),
      prUrl: z
        .string()
        .trim()
        .max(500)
        .refine((u) => u === '' || /^https?:\/\/\S+$/.test(u), 'Link do PR inválido (use http:// ou https://).')
        .default(DEMAND_DEFAULTS.prUrl),
      environment: z.enum(DEMAND_ENVIRONMENTS, 'Ambiente inválido.').nullable().default(DEMAND_DEFAULTS.environment),
    })
    .refine((d) => d.dueDate === null || d.dueDate >= d.startDate, {
      message: 'A data de conclusão não pode ser anterior ao início.',
      path: ['dueDate'],
    });

const demandFilterSchema = z
  .enum([...DEMAND_STATUSES, ...DEMAND_STATUS_GROUPS], 'Filtro de status inválido.')
  .optional();

const eventSchema = (defaultDate: ISODate) =>
  z.object({
    date: isoDate.default(defaultDate),
    kind: z.enum(DEMAND_EVENT_KINDS, 'Tipo de evento inválido.').default('acao'),
    text: z.string().trim().min(1, 'Descreva o evento.').max(2000),
  });

const blockerSchema = (defaultDate: ISODate) =>
  z
    .object({
      owner: z.string().trim().min(1, 'Informe o responsável pelo impedimento.').max(200),
      description: z.string().trim().max(2000).default(''),
      since: isoDate.default(defaultDate),
      resolvedAt: isoDate.nullable().default(null),
    })
    .refine((b) => b.resolvedAt === null || b.resolvedAt >= b.since, {
      message: 'A resolução não pode ser anterior ao início do impedimento.',
      path: ['resolvedAt'],
    });

const goalSchema = z.object({
  dailyGoalMinutes: z.int('Meta inválida.').min(1, 'A meta deve ser maior que zero.').max(24 * 60),
});

const idSchema = z.coerce.number().int().positive();

function badRequest(res: Response, error: z.ZodError) {
  res.status(400).json({ error: error.issues[0]?.message ?? 'Dados inválidos.', issues: error.issues });
}

function overlapWarnings(repo: Repo, a: { date: ISODate; startMinute: number; endMinute: number }, id?: number) {
  return repo
    .findOverlaps(a, id)
    .map(
      (o) =>
        `Sobrepõe "${o.project}" (${formatHM(o.startMinute)}–${formatHM(o.endMinute)}). O período em comum conta uma única vez.`,
    );
}

interface AppOptions {
  repo: Repo;
  /** Injetável para testes. */
  today?: () => ISODate;
  /** Pasta com o build do front, servida em produção. */
  staticDir?: string;
}

export function createApp({ repo, today = () => todayISO(), staticDir }: AppOptions) {
  const app = express();
  app.use(express.json());

  /**
   * Métricas das demandas: horas apontadas, prazo e ritmo (com a meta diária do ciclo atual),
   * mais o resumo da linha do tempo e dos impedimentos.
   */
  const summarize = (demands: Demand[]) => {
    const now = today();
    const linked = repo.listLinkedActivities();
    const dailyGoal = repo.goalForCycle(getCycle(now).start);
    const history = { events: repo.listAllEvents(), blockers: repo.listAllBlockers() };
    return demands.map((d) => buildDemandSummary(d, linked, now, dailyGoal, history)).sort(compareDemands);
  };

  /** Rejeita o vínculo com uma demanda inexistente. */
  const unknownDemand = (demandId: number | null) => demandId !== null && !repo.getDemand(demandId);

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

  app.get('/api/activities', (req, res) => {
    const date = isoDate.safeParse(req.query.date);
    if (!date.success) return badRequest(res, date.error);
    res.json(repo.listActivities(date.data, date.data));
  });

  app.post('/api/activities', (req, res) => {
    const body = activitySchema.safeParse(req.body);
    if (!body.success) return badRequest(res, body.error);
    if (unknownDemand(body.data.demandId)) return res.status(400).json({ error: 'Demanda não encontrada.' });

    const warnings = overlapWarnings(repo, body.data);
    res.status(201).json({ activity: repo.createActivity(body.data), warnings });
  });

  app.put('/api/activities/:id', (req, res) => {
    const id = idSchema.safeParse(req.params.id);
    if (!id.success) return badRequest(res, id.error);
    const body = activitySchema.safeParse(req.body);
    if (!body.success) return badRequest(res, body.error);
    if (unknownDemand(body.data.demandId)) return res.status(400).json({ error: 'Demanda não encontrada.' });

    const activity = repo.updateActivity(id.data, body.data);
    if (!activity) return res.status(404).json({ error: 'Atividade não encontrada.' });
    res.json({ activity, warnings: overlapWarnings(repo, body.data, id.data) });
  });

  app.delete('/api/activities/:id', (req, res) => {
    const id = idSchema.safeParse(req.params.id);
    if (!id.success) return badRequest(res, id.error);
    if (!repo.deleteActivity(id.data)) return res.status(404).json({ error: 'Atividade não encontrada.' });
    res.status(204).end();
  });

  app.get('/api/demands', (req, res) => {
    const status = demandFilterSchema.safeParse(req.query.status);
    if (!status.success) return badRequest(res, status.error);
    const demands = repo.listDemands().filter((d) => !status.data || matchesDemandFilter(d, status.data));
    res.json(summarize(demands));
  });

  app.get('/api/demands/:id', (req, res) => {
    const id = idSchema.safeParse(req.params.id);
    if (!id.success) return badRequest(res, id.error);
    const demand = repo.getDemand(id.data);
    if (!demand) return res.status(404).json({ error: 'Demanda não encontrada.' });
    res.json({
      ...summarize([demand])[0],
      activities: repo.listDemandActivities(id.data),
      events: repo.listDemandEvents(id.data),
      blockers: repo.listDemandBlockers(id.data),
    });
  });

  app.post('/api/demands', (req, res) => {
    const body = demandSchema(today()).safeParse(req.body);
    if (!body.success) return badRequest(res, body.error);
    res.status(201).json(summarize([repo.createDemand(body.data)])[0]);
  });

  app.put('/api/demands/:id', (req, res) => {
    const id = idSchema.safeParse(req.params.id);
    if (!id.success) return badRequest(res, id.error);
    const current = repo.getDemand(id.data);
    if (!current) return res.status(404).json({ error: 'Demanda não encontrada.' });
    const body = demandSchema(current.startDate).safeParse(req.body);
    if (!body.success) return badRequest(res, body.error);

    res.json(summarize([repo.updateDemand(id.data, body.data)!])[0]);
  });

  app.delete('/api/demands/:id', (req, res) => {
    const id = idSchema.safeParse(req.params.id);
    if (!id.success) return badRequest(res, id.error);
    if (!repo.deleteDemand(id.data)) return res.status(404).json({ error: 'Demanda não encontrada.' });
    res.status(204).end();
  });

  /** Valida o par demanda/item das sub-rotas; responde 400/404 e devolve null em caso de erro. */
  const subIds = (res: Response, params: { id?: string; itemId?: string }) => {
    const id = idSchema.safeParse(params.id);
    const itemId = idSchema.safeParse(params.itemId ?? 1);
    if (!id.success || !itemId.success) {
      badRequest(res, (id.error ?? itemId.error)!);
      return null;
    }
    if (!repo.getDemand(id.data)) {
      res.status(404).json({ error: 'Demanda não encontrada.' });
      return null;
    }
    return { demandId: id.data, itemId: itemId.data };
  };

  app.post('/api/demands/:id/events', (req, res) => {
    const ids = subIds(res, req.params);
    if (!ids) return;
    const body = eventSchema(today()).safeParse(req.body);
    if (!body.success) return badRequest(res, body.error);
    res.status(201).json(repo.createEvent(ids.demandId, body.data));
  });

  app.put('/api/demands/:id/events/:itemId', (req, res) => {
    const ids = subIds(res, req.params);
    if (!ids) return;
    const body = eventSchema(today()).safeParse(req.body);
    if (!body.success) return badRequest(res, body.error);
    const event = repo.updateEvent(ids.demandId, ids.itemId, body.data);
    if (!event) return res.status(404).json({ error: 'Evento não encontrado.' });
    res.json(event);
  });

  app.delete('/api/demands/:id/events/:itemId', (req, res) => {
    const ids = subIds(res, req.params);
    if (!ids) return;
    if (!repo.deleteEvent(ids.demandId, ids.itemId)) return res.status(404).json({ error: 'Evento não encontrado.' });
    res.status(204).end();
  });

  app.post('/api/demands/:id/blockers', (req, res) => {
    const ids = subIds(res, req.params);
    if (!ids) return;
    const body = blockerSchema(today()).safeParse(req.body);
    if (!body.success) return badRequest(res, body.error);
    res.status(201).json(repo.createBlocker(ids.demandId, body.data));
  });

  app.put('/api/demands/:id/blockers/:itemId', (req, res) => {
    const ids = subIds(res, req.params);
    if (!ids) return;
    const body = blockerSchema(today()).safeParse(req.body);
    if (!body.success) return badRequest(res, body.error);
    const blocker = repo.updateBlocker(ids.demandId, ids.itemId, body.data);
    if (!blocker) return res.status(404).json({ error: 'Impedimento não encontrado.' });
    res.json(blocker);
  });

  app.delete('/api/demands/:id/blockers/:itemId', (req, res) => {
    const ids = subIds(res, req.params);
    if (!ids) return;
    if (!repo.deleteBlocker(ids.demandId, ids.itemId)) {
      return res.status(404).json({ error: 'Impedimento não encontrado.' });
    }
    res.status(204).end();
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Rota não encontrada.' });
  });

  if (staticDir && existsSync(staticDir)) {
    app.use(express.static(staticDir));
    app.get('/{*path}', (_req, res) => res.sendFile(join(staticDir, 'index.html')));
  }

  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'JSON inválido.' });
    }
    console.error(err);
    res.status(500).json({ error: 'Erro interno no servidor.' });
  };
  app.use(onError);

  return app;
}
