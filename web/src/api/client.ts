import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getCycle,
  type Activity,
  type ActivityInput,
  type CycleSummary,
  type DemandBlocker,
  type DemandBlockerInput,
  type DemandEvent,
  type DemandEventInput,
  type DemandFilter,
  type DemandInput,
  type DemandSummary,
  type ISODate,
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
  demands: (filter?: DemandFilter) => ['demands', 'list', filter ?? 'todas'] as const,
  demand: (id: number) => ['demands', 'detail', id] as const,
};

export type DemandDetail = DemandSummary & {
  activities: Activity[];
  events: DemandEvent[];
  blockers: DemandBlocker[];
};

export function useCycle(date: ISODate) {
  return useQuery({
    queryKey: keys.cycle(date),
    queryFn: () => request<CycleSummary>('GET', `/cycles/${date}`),
  });
}

export function useDayActivities(date: ISODate) {
  return useQuery({
    queryKey: keys.activities(date),
    queryFn: () => request<Activity[]>('GET', `/activities?date=${date}`),
  });
}

export function useDemands(filter?: DemandFilter) {
  return useQuery({
    queryKey: keys.demands(filter),
    queryFn: () => request<DemandSummary[]>('GET', `/demands${filter ? `?status=${filter}` : ''}`),
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
 * Atualiza listas e métricas depois de qualquer alteração. Atividades e demandas se
 * afetam mutuamente (horas apontadas, vínculo removido ao excluir), então tudo é revalidado.
 */
function useInvalidate() {
  const client = useQueryClient();
  return () =>
    Promise.all(
      ['cycle', 'activities', 'demands'].map((key) => client.invalidateQueries({ queryKey: [key] })),
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
