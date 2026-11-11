import type { PeriodScale } from '@acomp/shared';
import { useYield } from '../../api/client';
import { FamilySplitChart } from '../../components/FamilySplitChart';
import { ErrorState, Skeleton } from '../../components/States';

/** Painel → Rendimento: tempo por categoria (e Tarefas × Ciclos) e trabalho não planejado (PLANO, seção 12). */
export function YieldView({ date, scale }: { date: string; scale: PeriodScale }) {
  const report = useYield(date, scale);
  if (report.isPending) return <Skeleton className="h-[30rem] lg:max-h-full" />;
  if (report.isError) return <ErrorState message={report.error.message} onRetry={() => report.refetch()} />;
  // Em lg, o cartão encolhe até a altura que o Painel lhe dá (fit-viewport); quem cede é o gráfico.
  return (
    <section className="card rise p-5 sm:p-6 lg:flex lg:min-h-0 lg:flex-col">
      <FamilySplitChart split={report.data.split} unplanned={report.data.unplanned} scale={scale} />
    </section>
  );
}
