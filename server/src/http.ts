// Peças comuns às rotas: validação das entradas mais usadas, resposta 400 e o contexto que
// createApp entrega a cada grupo de rotas.

import type { Response } from 'express';
import { z } from 'zod';
import { isValidISODate, PERIOD_SCALES, type DemandSummary, type SyncedFolder, type Demand, type ISODate, type TimelineEntry } from '@acomp/shared';
import type { BackupService } from './backup.ts';
import type { Repo } from './repo.ts';

/** Escala do período; sem ela vale a semana (sexta → quinta), como antes da v0.9. */
export const scaleSchema = z.enum(PERIOD_SCALES, 'Escala inválida (use week ou month).').default('week');

export const isoDate = z.string().refine(isValidISODate, 'Data inválida (use AAAA-MM-DD).');

export const idSchema = z.coerce.number().int().positive();

export function badRequest(res: Response, error: z.ZodError) {
  res.status(400).json({ error: error.issues[0]?.message ?? 'Dados inválidos.', issues: error.issues });
}

/** O que as rotas recebem de createApp. */
export interface RouteContext {
  repo: Repo;
  today: () => ISODate;
  /** Métricas das demandas (horas apontadas e prazo) e o resumo da linha do tempo e dos impedimentos. */
  summarize: (demands: Demand[]) => DemandSummary[];
  /** Linha do tempo unificada dos ciclos; sem `demandId`, a de todos. */
  timelineOf: (demandId?: number) => TimelineEntry[];
  backups?: Pick<BackupService, 'status' | 'createExtra'>;
  /** Serviço que sincroniza a pasta do banco (OneDrive, Dropbox…), ou nulo. */
  syncedFolder: SyncedFolder | null;
}
