// Linha do tempo dos ciclos: eventos, impedimentos e a bandeira da análise.

import type { Express, Response } from 'express';
import { z } from 'zod';
import { DEMAND_EVENT_KINDS, type ISODate } from '@acomp/shared';
import { badRequest, idSchema, isoDate, type RouteContext } from '../http.ts';

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

const flagSchema = z.object({ flagged: z.boolean('Informe flagged (true ou false).') });

const timelineFilterSchema = z.object({
  demandId: z.coerce.number().int().positive().optional(),
});

export function registerTimelineRoutes(app: Express, { repo, today, timelineOf }: RouteContext) {
  app.get('/api/timeline', (req, res) => {
    const filter = timelineFilterSchema.safeParse(req.query);
    if (!filter.success) return badRequest(res, filter.error);
    res.json(timelineOf(filter.data.demandId));
  });

  /** Valida o par demanda/item das sub-rotas; responde 400/404 e devolve null em caso de erro. */
  const subIds = (res: Response, params: { id?: string; itemId?: string }) => {
    const id = idSchema.safeParse(params.id);
    const itemId = idSchema.safeParse(params.itemId ?? 1);
    if (!id.success || !itemId.success) {
      badRequest(res, (id.error ?? itemId.error)!);
      return null;
    }
    const demand = repo.getDemand(id.data);
    if (!demand) {
      res.status(404).json({ error: 'Demanda não encontrada.' });
      return null;
    }
    if (demand.category !== 'ciclo') {
      res.status(400).json({ error: 'Linha do tempo e impedimentos existem só nos ciclos.' });
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

  app.put('/api/demands/:id/events/:itemId/flag', (req, res) => {
    const ids = subIds(res, req.params);
    if (!ids) return;
    const body = flagSchema.safeParse(req.body);
    if (!body.success) return badRequest(res, body.error);
    const event = repo.flagEvent(ids.demandId, ids.itemId, body.data.flagged);
    if (!event) return res.status(404).json({ error: 'Evento não encontrado.' });
    res.json(event);
  });

  app.put('/api/demands/:id/blockers/:itemId/flag', (req, res) => {
    const ids = subIds(res, req.params);
    if (!ids) return;
    const body = flagSchema.safeParse(req.body);
    if (!body.success) return badRequest(res, body.error);
    const blocker = repo.flagBlocker(ids.demandId, ids.itemId, body.data.flagged);
    if (!blocker) return res.status(404).json({ error: 'Impedimento não encontrado.' });
    res.json(blocker);
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
}
