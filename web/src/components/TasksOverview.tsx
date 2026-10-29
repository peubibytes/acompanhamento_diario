import { Link } from 'react-router';
import { DEMAND_CATEGORY_PLURAL, type TaskCounts, type TaskOverview } from '@acomp/shared';
import { CheckIcon, ClockIcon, DashIcon } from './icons';
import { SectionTitle } from './SectionTitle';

const HINT = (
  <>
    <span className="block">Chamados e treinamentos. Reuniões não têm status e não entram.</span>
    <span className="mt-1.5 block">
      <strong className="font-semibold text-ink">Concluídas:</strong> passaram a Concluído dentro do ciclo de
      apontamento escolhido (sexta a quinta).
    </span>
    <span className="mt-1.5 block">
      <strong className="font-semibold text-ink">Na fila:</strong> status Não iniciado, hoje.{' '}
      <strong className="font-semibold text-ink">Em andamento:</strong> Iniciado ou Em andamento, hoje.
    </span>
  </>
);

const LABEL = 'text-2xs font-semibold tracking-wider text-ink-3 uppercase';
const NUMBER = 'tabular mt-1 block text-2xl font-semibold tracking-tight text-ink sm:text-display sm:font-bold';

// A cor acompanha o ícone e o número escrito: nunca é a única pista.
const PARTS = [
  { key: 'completed', label: 'Concluídas', bar: 'bg-good', icon: <CheckIcon size={13} /> },
  { key: 'inProgress', label: 'Em andamento', bar: 'bg-accent', icon: <ClockIcon size={13} /> },
  { key: 'queued', label: 'Na fila', bar: 'bg-neutral', icon: <DashIcon size={13} /> },
] as const satisfies readonly { key: keyof TaskCounts; label: string; bar: string; icon: unknown }[];

/** Painel: tarefas concluídas no ciclo, na fila e em andamento, e a divisão por tipo. */
export function TasksOverview({ tasks }: { tasks: TaskOverview }) {
  const total = tasks.completed + tasks.queued + tasks.inProgress;

  return (
    <section className="card rise p-5 sm:p-6">
      <SectionTitle title="Tarefas" hint={HINT} />

      <dl className="mt-4 grid grid-cols-3 gap-4">
        {PARTS.map((p) => (
          <div key={p.key}>
            <dt className={`${LABEL} flex items-center gap-1.5`}>
              {p.icon}
              {p.label}
            </dt>
            <dd className={NUMBER}>{tasks[p.key]}</dd>
          </div>
        ))}
      </dl>

      {total === 0 ? (
        <p className="mt-6 text-sm text-ink-2">
          Nenhuma tarefa no ciclo.{' '}
          <Link to="/demandas?tipo=chamado" className="font-semibold text-accent hover:underline">
            Declarar tarefa
          </Link>
        </p>
      ) : (
        <ul className="mt-6 space-y-4 border-t border-line pt-5">
          {(['chamado', 'treinamento'] as const).map((c) => (
            <CategoryBar key={c} category={c} counts={tasks.byCategory[c]} />
          ))}
        </ul>
      )}
    </section>
  );
}

function CategoryBar({ category, counts }: { category: 'chamado' | 'treinamento'; counts: TaskCounts }) {
  const total = counts.completed + counts.queued + counts.inProgress;
  const name = DEMAND_CATEGORY_PLURAL[category];
  const summary = PARTS.map((p) => `${counts[p.key]} ${p.label.toLowerCase()}`).join(', ');

  return (
    <li>
      <div className="flex items-baseline justify-between gap-3">
        <Link to={`/demandas?tipo=${category}`} className="text-sm font-medium text-ink hover:underline">
          {name}
        </Link>
        <span className="tabular text-xs text-ink-3">{total === 0 ? 'Nenhum' : summary}</span>
      </div>
      <div
        className="mt-2 flex h-3 overflow-hidden rounded-full bg-grid"
        role="img"
        aria-label={`${name}: ${total === 0 ? 'nenhum' : summary}`}
      >
        {PARTS.map(
          (p) =>
            counts[p.key] > 0 && (
              <div
                key={p.key}
                className={`${p.bar} h-full transition-[width] duration-700 ease-out`}
                style={{ width: `${(counts[p.key] / total) * 100}%` }}
              />
            ),
        )}
      </div>
    </li>
  );
}
