import type { PeriodScale } from '@acomp/shared';
import { useOverview } from '../../api/client';
import { ErrorState, Skeleton } from '../../components/States';
import { TasksOverview } from '../../components/TasksOverview';

/** Painel → Tarefas: concluídas no período, na fila e em andamento. */
export function TasksView({ date, scale }: { date: string; scale: PeriodScale }) {
  const overview = useOverview(date, scale);
  if (overview.isPending) return <Skeleton className="h-96" />;
  if (overview.isError) return <ErrorState message={overview.error.message} onRetry={() => overview.refetch()} />;
  return <TasksOverview tasks={overview.data.tasks} />;
}
