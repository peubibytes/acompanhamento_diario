import type { PeriodScale } from '@acomp/shared';
import { useDemands, useOverview, useTimeline } from '../../api/client';
import { CyclesChart } from '../../components/CyclesChart';
import { ErrorState, Skeleton } from '../../components/States';

/** Painel → Ciclos: cada ciclo aberto com prazo, horas e o mapa da linha do tempo. */
export function CyclesView({ date, scale }: { date: string; scale: PeriodScale }) {
  const demands = useDemands('abertas');
  const overview = useOverview(date, scale);
  const timeline = useTimeline();
  if (demands.isPending || overview.isPending || timeline.isPending) return <Skeleton className="h-96" />;
  if (demands.isError) return <ErrorState message={demands.error.message} onRetry={() => demands.refetch()} />;
  if (overview.isError) return <ErrorState message={overview.error.message} onRetry={() => overview.refetch()} />;
  if (timeline.isError) return <ErrorState message={timeline.error.message} onRetry={() => timeline.refetch()} />;
  return <CyclesChart demands={demands.data} progress={overview.data.cycles} timeline={timeline.data} />;
}
