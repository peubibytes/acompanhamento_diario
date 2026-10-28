import type { ISODate } from './cycle.ts';

export const ACTIVITY_STATUSES = [
  'concluido',
  'nao_concluido',
  'pendente_aprovacao',
  'nao_iniciado',
] as const;

export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];

export const STATUS_LABEL: Record<ActivityStatus, string> = {
  concluido: 'Concluído',
  nao_concluido: 'Não concluído',
  pendente_aprovacao: 'Pendente de aprovação',
  nao_iniciado: 'Não iniciado',
};

/**
 * Apontamento: um intervalo de tempo gasto em uma demanda declarada. No código e no banco
 * mantém o nome histórico "activity" (tabela `activities`, rota `/api/activities`).
 */
export interface Activity {
  id: number;
  date: ISODate;
  startMinute: number;
  endMinute: number;
  /**
   * Nome da demanda, mantido em dia pelo servidor (coluna da planilha "projeto/demanda").
   * Nos apontamentos antigos, sem demanda, é o projeto digitado na época.
   */
  project: string;
  description: string;
  notes: string;
  status: ActivityStatus;
  /** Demanda apontada; nula só nos apontamentos anteriores à v0.5. */
  demandId: number | null;
}

/** O que se informa ao apontar: a demanda é obrigatória e o "projeto" vem dela. */
export type ActivityInput = Omit<Activity, 'id' | 'project' | 'demandId'> & { demandId: number };

export const GOAL_PRESETS = [
  { label: '5h30', minutes: 330 },
  { label: '8h48', minutes: 528 },
] as const;

export const DEFAULT_DAILY_GOAL = 330;
export const WORKDAYS_PER_CYCLE = 5;
