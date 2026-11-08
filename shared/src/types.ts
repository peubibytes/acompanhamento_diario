import type { ISODate } from './cycle.ts';

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
  /** Reunião (v0.14): com quem foi esta ocorrência; vazio nas demais demandas e nos apontamentos antigos. */
  participants: string;
  /** Reunião (v0.14): assunto desta ocorrência. */
  subject: string;
  /** Demanda apontada; nula só nos apontamentos anteriores à v0.5. */
  demandId: number | null;
}

/** O que se informa ao apontar: a demanda é obrigatória e o "projeto" vem dela. */
export type ActivityInput = Omit<Activity, 'id' | 'project' | 'demandId' | 'participants' | 'subject'> & {
  demandId: number;
  participants?: string;
  subject?: string;
};

export const GOAL_PRESETS = [
  { label: '5h30', minutes: 330 },
  { label: '9h', minutes: 540 },
] as const;

export const DEFAULT_DAILY_GOAL = 330;
export const WORKDAYS_PER_CYCLE = 5;
