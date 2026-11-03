import type { PeriodScale } from '@acomp/shared';
import { useYield } from '../../api/client';
import { CycleYieldChart } from '../../components/CycleYieldChart';
import { FamilySplitChart } from '../../components/FamilySplitChart';
import { ErrorState, Skeleton } from '../../components/States';

/** Painel → Rendimento: tempo por categoria (e Tarefas × Ciclos) e o rendimento de cada ciclo (PLANO, seção 12). */
export function YieldView({ date, scale }: { date: string; scale: PeriodScale }) {
  const report = useYield(date, scale);
  if (report.isPending) return <Skeleton className="h-[48rem]" />;
  if (report.isError) return <ErrorState message={report.error.message} onRetry={() => report.refetch()} />;
  return (
    <section className="card rise p-5 sm:p-6">
      <FamilySplitChart split={report.data.split} unplanned={report.data.unplanned} scale={scale} />
      <div className="mt-6 border-t border-line pt-5">
        <CycleYieldChart cycles={report.data.cycles} />
      </div>
    </section>
  );
}
