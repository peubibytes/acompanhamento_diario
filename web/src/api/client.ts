import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getCycle, type Activity, type ActivityInput, type CycleSummary, type ISODate } from '@acomp/shared';

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

/** Atualiza a lista e as métricas depois de qualquer alteração. */
function useInvalidate() {
  const client = useQueryClient();
  return () => Promise.all([
    client.invalidateQueries({ queryKey: ['cycle'] }),
    client.invalidateQueries({ queryKey: ['activities'] }),
  ]);
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
