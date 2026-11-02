import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getPeriod,
  getCycle,
  type Activity,
  type ActivityInput,
  type CycleSummary,
  type DemandBlocker,
  type DemandBlockerInput,
  type DemandEvent,
  type DemandEventInput,
  type DemandInput,
  type DailyReport,
  type TimelineEntry,
  type DemandStatusChange,
  type DemandStatusGroup,
  type DemandSummary,
  type ISODate,
  type Overview,
  type PeriodScale,
  type PeriodReport,
  type PeriodSummary,
  type YieldReport,
} from '@acomp/shared';

export class ApiError extends Error {}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Não foi possível conectar ao servidor. Ele está rodando?');
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(data?.error ?? `Erro ${res.status}`);
  return data as T;
}

interface SaveResult {
  activity: Activity;
  warnings: string[];
}

const keys = {
  cycle: (date: ISODate) => ['cycle', getCycle(date).start] as const,
  activities: (date: ISODate) => ['activities', date] as const,
  demands: (filter?: DemandStatusGroup) => ['demands', 'list', filter ?? 'todas'] as const,
  demand: (id: number) => ['demands', 'detail', id] as const,
  period: (date: ISODate, scale: PeriodScale) => ['period', scale, getPeriod(date, scale).start] as const,
  metrics: (date: ISODate, scale: PeriodScale) => ['metrics', scale, getPeriod(date, scale).start] as const,
};

export type DemandDetail = DemandSummary & {
  activities: Activity[];
  events: DemandEvent[];
  blockers: DemandBlocker[];
  statusChanges: DemandStatusChange[];
  timeline: TimelineEntry[];
};

export function useCycle(date: ISODate) {
  return useQuery({
    queryKey: keys.cycle(date),
    queryFn: () => request<CycleSummary>('GET', `/cycles/${date}`),
  });
}

export function useDayActivities(date: ISODate, enabled = true) {
  return useQuery({
    queryKey: keys.activities(date),
    queryFn: () => request<Activity[]>('GET', `/activities?date=${date}`),
    enabled,
  });
}

export function useDemands(filter?: DemandStatusGroup) {
  return useQuery({
    queryKey: keys.demands(filter),
    queryFn: () => request<DemandSummary[]>('GET', `/demands${filter ? `?status=${filter}` : ''}`),
  });
}

/** Resumo do período da data (semana ou mês): dias úteis com métricas e totais. */
export function usePeriod(date: ISODate, scale: PeriodScale) {
  return useQuery({
    queryKey: keys.period(date, scale),
    queryFn: () => request<PeriodSummary>('GET', `/periods/${date}?scale=${scale}`),
  });
}

export interface BackupStatus {
  last: { file: string; date: string; at: string; sizeBytes: number } | null;
  count: number;
  keep: number;
}

/** O último backup diário do banco (a tela de Lembretes mostra quando foi). */
export function useBackupStatus() {
  return useQuery({
    queryKey: ['backups'] as const,
    queryFn: () => request<BackupStatus>('GET', '/backups'),
  });
}

/** Rendimento do período: Tarefas × Ciclos e o rendimento de cada ciclo contra o período anterior. */
export function useYield(date: ISODate, scale: PeriodScale) {
  return useQuery({
    queryKey: ['yield', scale, getPeriod(date, scale).start] as const,
    queryFn: () => request<YieldReport>('GET', `/yield?date=${date}&scale=${scale}`),
  });
}

/** Apontamentos de uma faixa de datas (a distribuição do mês). */
export function useRangeActivities(from: ISODate, to: ISODate, enabled = true) {
  return useQuery({
    queryKey: ['activities', 'range', from, to] as const,
    queryFn: () => request<Activity[]>('GET', `/activities?from=${from}&to=${to}`),
    enabled,
  });
}

/** Tarefas (concluídas, fila, em andamento) e ciclos abertos, no período da data. */
export function useOverview(date: ISODate, scale: PeriodScale = 'week') {
  return useQuery({
    queryKey: keys.metrics(date, scale),
    queryFn: () => request<Overview>('GET', `/metrics?date=${date}&scale=${scale}`),
  });
}

/** Relatório do dia (daily / 1:1): o que foi feito, impedimentos e o que será feito. */
export function useDailyReport(date: ISODate) {
  return useQuery({
    queryKey: ['reports', 'daily', date] as const,
    queryFn: () => request<DailyReport>('GET', `/reports/daily?date=${date}`),
  });
}

/** Relatório do período (semana ou mês) para o 1:1 e a prestação de contas. */
export function usePeriodReport(date: ISODate, scale: PeriodScale) {
  return useQuery({
    queryKey: ['reports', 'period', scale, getPeriod(date, scale).start] as const,
    queryFn: () => request<PeriodReport>('GET', `/reports/period?date=${date}&scale=${scale}`),
  });
}

/** Linha do tempo (eventos e impedimentos) de todos os ciclos, ou de um. */
export function useTimeline(demandId?: number) {
  return useQuery({
    queryKey: ['timeline', demandId ?? 'todos'] as const,
    queryFn: () => request<TimelineEntry[]>('GET', `/timeline${demandId ? `?demandId=${demandId}` : ''}`),
  });
}

export function useDemand(id: number, enabled = true) {
  return useQuery({
    queryKey: keys.demand(id),
    queryFn: () => request<DemandDetail>('GET', `/demands/${id}`),
    enabled,
  });
}

/**
 * Atualiza listas e métricas depois de qualquer alteração. Apontamentos e demandas se
 * afetam mutuamente (horas apontadas, nome da demanda gravado no apontamento), então tudo é revalidado.
 */
function useInvalidate() {
  const client = useQueryClient();
  return () =>
    Promise.all(
      ['cycle', 'period', 'yield', 'activities', 'demands', 'metrics', 'reports', 'timeline'].map((key) => client.invalidateQueries({ queryKey: [key] })),
    );
}

export function useSaveActivity() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, input }: { id?: number; input: ActivityInput }) =>
      id ? request<SaveResult>('PUT', `/activities/${id}`, input) : request<SaveResult>('POST', '/activities', input),
    onSuccess: invalidate,
  });
}

export function useDeleteActivity() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: number) => request<void>('DELETE', `/activities/${id}`),
    onSuccess: invalidate,
  });
}

export function useSetGoal() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ date, minutes }: { date: ISODate; minutes: number }) =>
      request<{ appliesToNextCycles: boolean }>('PUT', `/cycles/${date}/goal`, { dailyGoalMinutes: minutes }),
    onSuccess: invalidate,
  });
}

export function useSaveDemand() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, input }: { id?: number; input: DemandInput }) =>
      id
        ? request<DemandSummary>('PUT', `/demands/${id}`, input)
        : request<DemandSummary>('POST', '/demands', input),
    onSuccess: invalidate,
  });
}

export function useDeleteDemand() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: number) => request<void>('DELETE', `/demands/${id}`),
    onSuccess: invalidate,
  });
}

export function useSaveEvent(demandId: number) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, input }: { id?: number; input: DemandEventInput }) =>
      id
        ? request<DemandEvent>('PUT', `/demands/${demandId}/events/${id}`, input)
        : request<DemandEvent>('POST', `/demands/${demandId}/events`, input),
    onSuccess: invalidate,
  });
}

/** Marca ou desmarca a bandeira de uma entrada da linha do tempo (evento ou impedimento). */
export function useFlagEntry() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ entry, flagged }: { entry: TimelineEntry; flagged: boolean }) =>
      request<unknown>(
        'PUT',
        `/demands/${entry.demandId}/${entry.source === 'evento' ? 'events' : 'blockers'}/${entry.id}/flag`,
        { flagged },
      ),
    onSuccess: invalidate,
  });
}

export function useDeleteEvent(demandId: number) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: number) => request<void>('DELETE', `/demands/${demandId}/events/${id}`),
    onSuccess: invalidate,
  });
}

export function useSaveBlocker(demandId: number) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, input }: { id?: number; input: DemandBlockerInput }) =>
      id
        ? request<DemandBlocker>('PUT', `/demands/${demandId}/blockers/${id}`, input)
        : request<DemandBlocker>('POST', `/demands/${demandId}/blockers`, input),
    onSuccess: invalidate,
  });
}

export function useDeleteBlocker(demandId: number) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: number) => request<void>('DELETE', `/demands/${demandId}/blockers/${id}`),
    onSuccess: invalidate,
  });
}
