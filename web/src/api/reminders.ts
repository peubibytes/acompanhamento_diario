import { attentionCount, buildAgenda, buildNotifications, todayISO, type ReminderTarget } from '@acomp/shared';
import { useCycle, useDemands, useStorageStatus } from './client';

/**
 * Lembretes e agenda do momento. Usa sempre o ciclo de hoje (não o ciclo navegado no
 * painel) e as demandas abertas; os dados vêm do mesmo cache das outras telas. Os cuidados
 * com os dados (pasta sincronizada, exportação) entram quando chegam, sem segurar o resto.
 */
export function useReminders() {
  const today = todayISO();
  const cycle = useCycle(today);
  const demands = useDemands('abertas');
  const storage = useStorageStatus();
  const notifications =
    cycle.data && demands.data ? buildNotifications(cycle.data, demands.data, today, storage.data) : [];

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

/** Âncora da seção Seus dados, em Lembretes e agenda. */
export const YOUR_DATA_ID = 'seus-dados';

/** Rota de destino de um lembrete ou item da agenda. */
export function targetHref(target: ReminderTarget): string {
  if (target.screen === 'apontamentos') return `/apontamentos?data=${target.date}`;
  if (target.screen === 'demandas') return `/demandas#demanda-${target.demandId}`;
  if (target.screen === 'dados') return `/lembretes#${YOUR_DATA_ID}`;
  return '/';
}
