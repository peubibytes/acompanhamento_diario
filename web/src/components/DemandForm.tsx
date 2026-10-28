import { useState, type FormEvent, type ReactNode } from 'react';
import { formatHM, parseHM, todayISO, type DemandSummary } from '@acomp/shared';
import { useSaveDemand } from '../api/client';
import { useToast } from './Toast';

const QUICK_TARGETS = [8, 16, 24, 40];

/** Aceita "40" (horas) ou "37:30" (h:mm). */
function parseTarget(text: string): number | null {
  const t = text.trim();
  if (/^\d{1,3}$/.test(t)) return Number(t) * 60;
  return parseHM(t);
}

interface Props {
  editing?: DemandSummary;
  onDone: () => void;
}

export function DemandForm({ editing, onDone }: Props) {
  const save = useSaveDemand();
  const toast = useToast();

  const [title, setTitle] = useState(editing?.title ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [target, setTarget] = useState(editing ? formatHM(editing.targetMinutes) : '');
  const [startDate, setStartDate] = useState(editing?.startDate ?? todayISO());
  const [dueDate, setDueDate] = useState(editing?.dueDate ?? '');

  const targetMinutes = parseTarget(target);
  const invalidTarget = target.trim() !== '' && (targetMinutes === null || targetMinutes <= 0);
  const invalidDue = dueDate !== '' && dueDate < startDate;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (targetMinutes === null || targetMinutes <= 0) return toast('Informe a meta de horas, por exemplo 40 ou 37:30.', 'error');
    if (invalidDue) return toast('A data de conclusão não pode ser anterior ao início.', 'error');

    save.mutate(
      {
        id: editing?.id,
        input: {
          title,
          description,
          targetMinutes,
          startDate,
          dueDate: dueDate || null,
          status: editing?.status ?? 'ativa',
        },
      },
      {
        onSuccess: () => {
          toast(editing ? 'Demanda atualizada.' : 'Demanda criada.');
          if (!editing) {
            setTitle('');
            setDescription('');
            setTarget('');
            setStartDate(todayISO());
            setDueDate('');
          }
          onDone();
        },
        onError: (err) => toast(err.message, 'error'),
      },
    );
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Título">
        <input
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex.: Migração dos relatórios"
          maxLength={200}
          className="field"
        />
      </Field>

      <Field label="Descrição" optional>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Escopo, entregáveis, contexto"
          rows={3}
          maxLength={2000}
          className="field resize-y"
        />
      </Field>

      <Field label="Meta de horas totais">
        <input
          required
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder="Ex.: 40 ou 37:30"
          inputMode="numeric"
          aria-invalid={invalidTarget}
          className="field tabular"
          style={invalidTarget ? { borderColor: 'var(--critical)' } : undefined}
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {QUICK_TARGETS.map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => setTarget(`${h}:00`)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                targetMinutes === h * 60 ? 'border-accent bg-accent-soft text-accent' : 'border-line text-ink-2 hover:bg-surface-2'
              }`}
            >
              {h}h
            </button>
          ))}
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Início">
          <input type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} className="field tabular" />
        </Field>
        <Field label="Data de conclusão" optional>
          <input
            type="date"
            value={dueDate}
            min={startDate}
            onChange={(e) => setDueDate(e.target.value)}
            aria-invalid={invalidDue}
            className="field tabular"
            style={invalidDue ? { borderColor: 'var(--critical)' } : undefined}
          />
        </Field>
      </div>
      <p className="-mt-2 text-xs text-ink-3">
        Com data de conclusão, a aplicação calcula o ritmo necessário e avisa quando o prazo estiver próximo.
      </p>

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={save.isPending}
          className="flex-1 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent shadow-sm transition hover:bg-accent-hover disabled:opacity-60"
        >
          {save.isPending ? 'Salvando…' : editing ? 'Salvar alterações' : 'Criar demanda'}
        </button>
        {editing && (
          <button
            type="button"
            onClick={onDone}
            className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold text-ink-2 transition hover:bg-surface-2"
          >
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}

function Field({ label, optional, children }: { label: string; optional?: boolean; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-ink-2">
        {label}
        {optional && <span className="font-normal text-ink-3"> · opcional</span>}
      </span>
      {children}
    </label>
  );
}
