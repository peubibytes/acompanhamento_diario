// Demandas: declaração de chamados, reuniões, treinamentos e ciclos.

import type { Express } from 'express';
import { z } from 'zod';
import {
  CYCLE_STATUSES,
  DEMAND_CATEGORIES,
  DEMAND_ENVIRONMENTS,
  DEMAND_KINDS,
  DEMAND_PRIORITIES,
  DEMAND_STATUS_GROUPS,
  matchesStatusGroup,
  normalizeTicketNumber,
  TASK_STATUSES,
  type ISODate,
} from '@acomp/shared';
import { badRequest, idSchema, isoDate, type RouteContext } from '../http.ts';

/** Letras, números e - _ . # / (ex.: SCTASK0012345, RITM0001, INC-42). */
const TICKET_NUMBER = /^[A-Z0-9][A-Z0-9_.#/-]{0,59}$/;
const taskStatus = z.enum(TASK_STATUSES, 'Status inválido.').default('nao_iniciado');

/**
 * Declaração de demanda, por categoria. Nenhuma tem campo de horas: o tempo é registrado
 * nos apontamentos.
 */
const demandSchema = (defaultStart: ISODate) =>
  z.discriminatedUnion(
    'category',
    [
      z
        .object({
          category: z.literal('ciclo'),
          title: z.string().trim().min(1, 'Informe o nome do projeto.').max(200),
          description: z.string().trim().max(4000).default(''),
          kind: z.enum(DEMAND_KINDS, 'Tipo inválido.').default('planejada'),
          status: z.enum(CYCLE_STATUSES, 'Status inválido.').default('novo'),
          priority: z.enum(DEMAND_PRIORITIES, 'Prioridade inválida.').default('media'),
          startDate: isoDate.default(defaultStart),
          dueDate: isoDate.nullable().default(null),
          branch: z.string().trim().max(200).default(''),
          prUrl: z
            .string()
            .trim()
            .max(500)
            .refine((u) => u === '' || /^https?:\/\/\S+$/.test(u), 'Link do PR inválido (use http:// ou https://).')
            .default(''),
          environment: z.enum(DEMAND_ENVIRONMENTS, 'Ambiente inválido.').nullable().default(null),
        })
        .refine((d) => d.dueDate === null || d.dueDate >= d.startDate, {
          message: 'O prazo não pode ser anterior ao início.',
          path: ['dueDate'],
        }),
      z.object({
        category: z.literal('chamado'),
        ticketNumber: z
          .string('Informe o número do chamado.')
          .trim()
          .min(1, 'Informe o número do chamado.')
          .max(60)
          .transform(normalizeTicketNumber)
          .refine((n) => TICKET_NUMBER.test(n), 'Número do chamado inválido (use letras, números e - _ . # /).'),
        description: z
          .string('Descreva o chamado.')
          .trim()
          .min(1, 'Descreva o chamado: qual o problema, quem solicitou e outras informações relevantes.')
          .max(4000),
        status: taskStatus,
      }),
      z.object({
        category: z.literal('reuniao'),
        meetingType: z.string('Informe o tipo da reunião.').trim().min(1, 'Informe o tipo da reunião (ex.: Daily).').max(60),
        participants: z.string('Informe com quem é a reunião.').trim().min(1, 'Informe com quem é a reunião.').max(200),
        subject: z.string('Informe o assunto da reunião.').trim().min(1, 'Informe o assunto da reunião.').max(200),
      }),
      z.object({
        category: z.literal('treinamento'),
        title: z.string('Informe o nome do treinamento.').trim().min(1, 'Informe o nome do treinamento.').max(200),
        description: z.string().trim().max(4000).default(''),
        status: taskStatus,
      }),
    ],
    { error: 'Tipo de demanda inválido (use ciclo, chamado, reuniao ou treinamento).' },
  );

const demandFilterSchema = z.object({
  status: z.enum(DEMAND_STATUS_GROUPS, 'Filtro de status inválido (use abertas ou encerradas).').optional(),
  category: z.enum(DEMAND_CATEGORIES, 'Filtro de categoria inválido.').optional(),
});

export function registerDemandRoutes(app: Express, { repo, today, summarize, timelineOf }: RouteContext) {
  /** Mesma declaração já existente: chamado com o mesmo número ou reunião idêntica. */
  const duplicateOf = (d: z.infer<ReturnType<typeof demandSchema>>, ignoreId = 0): string | null => {
    if (d.category === 'chamado' && repo.findTicketNumber(d.ticketNumber, ignoreId)) {
      return `O chamado ${d.ticketNumber} já está declarado.`;
    }
    if (d.category === 'reuniao') {
      const key = (m: { meetingType: string; participants: string; subject: string }) =>
        [m.meetingType, m.participants, m.subject].map((x) => x.toLocaleLowerCase('pt-BR')).join('|');
      const same = repo
        .listDemands()
        .some((x) => x.category === 'reuniao' && x.id !== ignoreId && key(x) === key(d));
      if (same) return 'Esta reunião já está declarada (mesmo tipo, participantes e assunto).';
    }
    return null;
  };

  app.get('/api/demands', (req, res) => {
    const filter = demandFilterSchema.safeParse(req.query);
    if (!filter.success) return badRequest(res, filter.error);
    const { status, category } = filter.data;
    const demands = repo
      .listDemands()
      .filter((d) => (!status || matchesStatusGroup(d, status)) && (!category || d.category === category));
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
      statusChanges: repo.listDemandStatusChanges(id.data),
      timeline: timelineOf(id.data),
    });
  });

  app.post('/api/demands', (req, res) => {
    const body = demandSchema(today()).safeParse(req.body);
    if (!body.success) return badRequest(res, body.error);
    const duplicate = duplicateOf(body.data);
    if (duplicate) return res.status(409).json({ error: duplicate });
    res.status(201).json(summarize([repo.createDemand(body.data, today())])[0]);
  });

  app.put('/api/demands/:id', (req, res) => {
    const id = idSchema.safeParse(req.params.id);
    if (!id.success) return badRequest(res, id.error);
    const current = repo.getDemand(id.data);
    if (!current) return res.status(404).json({ error: 'Demanda não encontrada.' });
    const body = demandSchema(current.category === 'ciclo' ? current.startDate : today()).safeParse(req.body);
    if (!body.success) return badRequest(res, body.error);
    if (body.data.category !== current.category) {
      return res.status(400).json({ error: 'O tipo de uma demanda não muda depois de declarado. Declare uma nova.' });
    }
    const duplicate = duplicateOf(body.data, id.data);
    if (duplicate) return res.status(409).json({ error: duplicate });

    res.json(summarize([repo.updateDemand(id.data, body.data, today())!])[0]);
  });

  app.delete('/api/demands/:id', (req, res) => {
    const id = idSchema.safeParse(req.params.id);
    if (!id.success) return badRequest(res, id.error);
    if (!repo.getDemand(id.data)) return res.status(404).json({ error: 'Demanda não encontrada.' });
    // Apontamentos só existem sobre demandas: excluir a demanda deixaria horas sem dono.
    const count = repo.countDemandActivities(id.data);
    if (count > 0) {
      return res.status(409).json({
        error: `Esta demanda tem ${count === 1 ? '1 apontamento' : `${count} apontamentos`}. Exclua-os ou aponte-os em outra demanda antes de excluir.`,
      });
    }
    repo.deleteDemand(id.data);
    res.status(204).end();
  });
}
