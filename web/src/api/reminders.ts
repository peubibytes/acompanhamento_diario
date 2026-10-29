import { attentionCount, buildAgenda, buildNotifications, todayISO, type ReminderTarget } from '@acomp/shared';
import { useCycle, useDemands } from './client';

/**
 * Lembretes e agenda do momento. Usa sempre o ciclo de hoje (não o ciclo navegado no
 * painel) e as demandas abertas; os dados vêm do mesmo cache das outras telas.
 */
export function useReminders() {
  const today = todayISO();
  const cycle = useCycle(today);
  const demands = useDemands('abertas');
  const notifications = cycle.data && demands.data ? buildNotifications(cycle.data, demands.data, today) : [];

  return {
    today,
    notifications,
    attention: attentionCount(notifications),
    agenda: demands.data ? buildAgenda(demands.data, today) : [],
    isPending: cycle.isPending || demands.isPending,
    error: cycle.error ?? demands.error,
    refetch: () => Promise.all([cycle.refetch(), demands.refetch()]),
  };
}

/** Rota de destino de um lembrete ou item da agenda. */
export function targetHref(target: ReminderTarget): string {
  if (target.screen === 'apontamentos') return `/apontamentos?data=${target.date}`;
  if (target.screen === 'demandas') return `/demandas#demanda-${target.demandId}`;
  return '/';
}
