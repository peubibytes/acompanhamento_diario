// Kanban: mover um cartão (trocar o status, reordenar a coluna, ou os dois de uma vez).

import type { Express } from 'express';
import { z } from 'zod';
import { statusesOf } from '@acomp/shared';
import { badRequest, idSchema, type RouteContext } from '../http.ts';

const moveSchema = z.object({
  demandId: idSchema,
  /** Novo status (quando o cartão muda de coluna, ou pelo seletor do cartão). */
  status: z.string().optional(),
  /** A coluna de destino inteira, do topo para o fim. */
  order: z
    .array(idSchema)
    .max(2000)
    .refine((ids) => new Set(ids).size === ids.length, 'A ordem tem demandas repetidas.')
    .optional(),
});

export function registerBoardRoutes(app: Express, { repo, today, summarize }: RouteContext) {
  app.put('/api/board', (req, res) => {
    const body = moveSchema.safeParse(req.body);
    if (!body.success) return badRequest(res, body.error);
    const { demandId, status, order } = body.data;

    const demand = repo.getDemand(demandId);
    if (!demand) return res.status(404).json({ error: 'Demanda não encontrada.' });
    if (demand.category === 'reuniao') {
      return res.status(400).json({ error: 'Reuniões não têm status e não entram no Kanban.' });
    }
    if (status !== undefined && !statusesOf(demand.category).includes(status)) {
      return res.status(400).json({ error: 'Status inválido para este tipo de demanda.' });
    }
    if (order) {
      const known = new Set(repo.listDemands().map((d) => d.id));
      if (order.some((id) => !known.has(id))) {
        return res.status(400).json({ error: 'A ordem cita uma demanda que não existe.' });
      }
    }

    // Tudo ou nada: o status (com a troca no histórico) e a ordem da coluna.
    repo.transaction(() => {
      if (status !== undefined) repo.setDemandStatus(demandId, status, today());
      if (order) repo.setBoardOrder(order);
    });
    res.json(summarize([repo.getDemand(demandId)!])[0]);
  });
}
