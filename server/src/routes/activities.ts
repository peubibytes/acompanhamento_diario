// Apontamentos: o tempo gasto numa demanda declarada.

import type { Express } from 'express';
import { z } from 'zod';
import { daysBetween, demandLabel, formatHM, isWorkday, type ISODate } from '@acomp/shared';
import { badRequest, idSchema, isoDate, type RouteContext } from '../http.ts';
import type { Repo } from '../repo.ts';

const activitySchema = z
  .object({
    date: isoDate.refine(isWorkday, 'Lançamentos são permitidos apenas em dias úteis.'),
    startMinute: z.int().min(0).max(24 * 60 - 1),
    endMinute: z.int().min(1).max(24 * 60),
    // Só se aponta o que já foi declarado em Demandas.
    demandId: z.int('Escolha a demanda apontada.').positive('Escolha a demanda apontada.'),
    description: z.string().trim().max(2000).default(''),
    notes: z.string().trim().max(2000).default(''),
  })
  .refine((a) => a.endMinute > a.startMinute, {
    message: 'O horário de fim deve ser depois do início.',
    path: ['endMinute'],
  });

const rangeSchema = z
  .object({ from: isoDate, to: isoDate })
  .refine((r) => r.to >= r.from, { message: 'O fim não pode ser anterior ao início.', path: ['to'] })
  .refine((r) => daysBetween(r.from, r.to) <= 61, { message: 'Intervalo muito longo (máximo 62 dias).', path: ['to'] });

function overlapWarnings(repo: Repo, a: { date: ISODate; startMinute: number; endMinute: number }, id?: number) {
  return repo
    .findOverlaps(a, id)
    .map(
      (o) =>
        `Sobrepõe "${o.project}" (${formatHM(o.startMinute)}–${formatHM(o.endMinute)}). O período em comum conta uma única vez.`,
    );
}

export function registerActivityRoutes(app: Express, { repo }: RouteContext) {
  app.get('/api/activities', (req, res) => {
    // Faixa de datas (Painel, distribuição do mês): `from` e `to`, no máximo 62 dias.
    if (req.query.from !== undefined || req.query.to !== undefined) {
      const range = rangeSchema.safeParse(req.query);
      if (!range.success) return badRequest(res, range.error);
      return res.json(repo.listActivities(range.data.from, range.data.to));
    }
    const date = isoDate.safeParse(req.query.date);
    if (!date.success) return badRequest(res, date.error);
    res.json(repo.listActivities(date.data, date.data));
  });

  app.post('/api/activities', (req, res) => {
    const body = activitySchema.safeParse(req.body);
    if (!body.success) return badRequest(res, body.error);
    const demand = repo.getDemand(body.data.demandId);
    if (!demand) return res.status(400).json({ error: 'Demanda não encontrada.' });

    const warnings = overlapWarnings(repo, body.data);
    res.status(201).json({ activity: repo.createActivity({ ...body.data, project: demandLabel(demand) }), warnings });
  });

  app.put('/api/activities/:id', (req, res) => {
    const id = idSchema.safeParse(req.params.id);
    if (!id.success) return badRequest(res, id.error);
    const body = activitySchema.safeParse(req.body);
    if (!body.success) return badRequest(res, body.error);
    const demand = repo.getDemand(body.data.demandId);
    if (!demand) return res.status(400).json({ error: 'Demanda não encontrada.' });

    const activity = repo.updateActivity(id.data, { ...body.data, project: demandLabel(demand) });
    if (!activity) return res.status(404).json({ error: 'Atividade não encontrada.' });
    res.json({ activity, warnings: overlapWarnings(repo, body.data, id.data) });
  });

  app.delete('/api/activities/:id', (req, res) => {
    const id = idSchema.safeParse(req.params.id);
    if (!id.success) return badRequest(res, id.error);
    if (!repo.deleteActivity(id.data)) return res.status(404).json({ error: 'Atividade não encontrada.' });
    res.status(204).end();
  });
}
