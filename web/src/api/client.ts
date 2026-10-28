import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getCycle,
  type Activity,
  type ActivityInput,
  type CycleSummary,
  type DemandInput,
  type DemandStatus,
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
  demands: (status?: DemandStatus) => ['demands', 'list', status ?? 'todas'] as const,
  demand: (id: number) => ['demands', 'detail', id] as const,
};

export type DemandDetail = DemandSummary & { activities: Activity[] };

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

export function useDemands(status?: DemandStatus) {
  return useQuery({
    queryKey: keys.demands(status),
    queryFn: () => request<DemandSummary[]>('GET', `/demands${status ? `?status=${status}` : ''}`),
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
