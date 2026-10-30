import { existsSync } from 'node:fs';
import { join } from 'node:path';
import express, { type ErrorRequestHandler, type Response } from 'express';
import { z } from 'zod';
import {
  buildCycleSummary,
  buildDailyReport,
  buildDemandSummary,
  buildOverview,
  buildTimeline,
  compareDemands,
  CYCLE_STATUSES,
  DEMAND_CATEGORIES,
  DEMAND_ENVIRONMENTS,
  DEMAND_EVENT_KINDS,
  DEMAND_KINDS,
  DEMAND_PRIORITIES,
  DEMAND_STATUS_GROUPS,
  demandLabel,
  formatHM,
  matchesStatusGroup,
  normalizeTicketNumber,
  previousWorkday,
  TASK_STATUSES,
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
    // Só se aponta o que já foi declarado em Demandas.
    demandId: z.int('Escolha a demanda apontada.').positive('Escolha a demanda apontada.'),
    description: z.string().trim().max(2000).default(''),
    notes: z.string().trim().max(2000).default(''),
  })
  .refine((a) => a.endMinute > a.startMinute, {
    message: 'O horário de fim deve ser depois do início.',
    path: ['endMinute'],
  });

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

  /** Métricas das demandas (horas apontadas e prazo) e o resumo da linha do tempo e dos impedimentos. */
  const summarize = (demands: Demand[]) => {
    const now = today();
    const linked = repo.listLinkedActivities();
    const history = {
      events: repo.listAllEvents(),
      blockers: repo.listAllBlockers(),
      statusChanges: repo.listAllStatusChanges(),
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

  /** Métricas de acompanhamento do ciclo de apontamento da data: tarefas e ciclos. */
  app.get('/api/metrics', (req, res) => {
    const date = isoDate.default(today()).safeParse(req.query.date);
    if (!date.success) return badRequest(res, date.error);
    const { start, end } = getCycle(date.data);
    res.json(buildOverview(summarize(repo.listDemands()), repo.listLinkedActivities(), { start, end }, today()));
  });

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

  app.get('/api/timeline', (req, res) => {
    const filter = timelineFilterSchema.safeParse(req.query);
    if (!filter.success) return badRequest(res, filter.error);
    res.json(timelineOf(filter.data.demandId));
  });

  app.get('/api/activities', (req, res) => {
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
