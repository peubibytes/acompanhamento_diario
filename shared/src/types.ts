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

export interface Activity {
  id: number;
  date: ISODate;
  startMinute: number;
  endMinute: number;
  project: string;
  description: string;
  notes: string;
  status: ActivityStatus;
}

export type ActivityInput = Omit<Activity, 'id'>;

export const GOAL_PRESETS = [
  { label: '5h30', minutes: 330 },
  { label: '8h48', minutes: 528 },
] as const;

export const DEFAULT_DAILY_GOAL = 330;
export const WORKDAYS_PER_CYCLE = 5;
