import { useState, type FormEvent, type ReactNode } from 'react';
import {
  DEMAND_DEFAULTS,
  DEMAND_ENVIRONMENT_LABEL,
  DEMAND_ENVIRONMENTS,
  DEMAND_KIND_LABEL,
  DEMAND_KINDS,
  DEMAND_PRIORITIES,
  DEMAND_PRIORITY_LABEL,
  DEMAND_STATUS_LABEL,
  DEMAND_STATUSES,
  formatHM,
  parseExternalIds,
  parseHM,
  todayISO,
  type DemandEnvironment,
  type DemandKind,
  type DemandPriority,
  type DemandStatus,
  type DemandSummary,
} from '@acomp/shared';
import { useSaveDemand } from '../api/client';
import { ChevronDown } from './icons';
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
  const initial = editing ?? { ...DEMAND_DEFAULTS, status: 'novo' as DemandStatus };

  const [title, setTitle] = useState(editing?.title ?? '');
  const [externalIds, setExternalIds] = useState(initial.externalIds.join(', '));
  const [system, setSystem] = useState(initial.system);
  const [kind, setKind] = useState<DemandKind>(initial.kind);
  const [priority, setPriority] = useState<DemandPriority>(initial.priority);
  const [status, setStatus] = useState<DemandStatus>(initial.status);
  const [progress, setProgress] = useState(initial.progressPercent);
  const [description, setDescription] = useState(editing?.description ?? '');
  const [target, setTarget] = useState(editing?.targetMinutes ? formatHM(editing.targetMinutes) : '');
  const [startDate, setStartDate] = useState(editing?.startDate ?? todayISO());
  const [dueDate, setDueDate] = useState(editing?.dueDate ?? '');
  const [branch, setBranch] = useState(initial.branch);
  const [prUrl, setPrUrl] = useState(initial.prUrl);
  const [environment, setEnvironment] = useState<DemandEnvironment | null>(initial.environment);

  const targetMinutes = target.trim() === '' ? null : parseTarget(target);
  const invalidTarget = target.trim() !== '' && (targetMinutes === null || targetMinutes <= 0);
  const invalidDue = dueDate !== '' && dueDate < startDate;

  const reset = () => {
    setTitle('');
    setExternalIds('');
    setSystem('');
    setKind(DEMAND_DEFAULTS.kind);
    setPriority(DEMAND_DEFAULTS.priority);
    setStatus('novo');
    setProgress(0);
    setDescription('');
    setTarget('');
    setStartDate(todayISO());
    setDueDate('');
    setBranch('');
    setPrUrl('');
    setEnvironment(null);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (invalidTarget) return toast('Meta de horas inválida. Use, por exemplo, 40 ou 37:30, ou deixe em branco.', 'error');
    if (invalidDue) return toast('O prazo não pode ser anterior ao início.', 'error');

    save.mutate(
      {
        id: editing?.id,
        input: {
          title,
          description,
          externalIds: parseExternalIds(externalIds),
          system,
          kind,
          priority,
          progressPercent: progress,
          targetMinutes,
          startDate,
          dueDate: dueDate || null,
          status,
          branch,
          prUrl,
          environment,
        },
      },
      {
        onSuccess: () => {
          toast(editing ? 'Demanda atualizada.' : 'Demanda criada.');
          if (!editing) reset();
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
          placeholder="Ex.: Ajuste no relatório de vendas"
          maxLength={200}
          className="field"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Identificadores" optional>
          <input
            value={externalIds}
            onChange={(e) => setExternalIds(e.target.value)}
            placeholder="SCTASK…, RITM…"
            className="field tabular"
          />
        </Field>
        <Field label="Sistema / projeto" optional>
          <input value={system} onChange={(e) => setSystem(e.target.value)} maxLength={200} className="field" />
        </Field>
      </div>

      <fieldset>
        <legend className="mb-1.5 block text-xs font-semibold text-ink-2">Tipo</legend>
        <div className="flex rounded-full bg-surface-2 p-1" role="radiogroup">
          {DEMAND_KINDS.map((k) => (
            <label
              key={k}
              className={`flex-1 cursor-pointer rounded-full px-2 py-1.5 text-center text-xs font-medium transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent ${
                kind === k ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:text-ink'
              }`}
            >
              <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="sr-only" />
              {DEMAND_KIND_LABEL[k]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Status">
          <select value={status} onChange={(e) => setStatus(e.target.value as DemandStatus)} className="field">
            {DEMAND_STATUSES.map((s) => (
              <option key={s} value={s}>
                {DEMAND_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Prioridade">
          <select value={priority} onChange={(e) => setPriority(e.target.value as DemandPriority)} className="field">
            {DEMAND_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {DEMAND_PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label={`Progresso: ${progress}%`}>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={progress}
          onChange={(e) => setProgress(Number(e.target.value))}
          className="w-full accent-[var(--accent)]"
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

      <Field label="Meta de horas totais" optional>
        <input
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
        <Field label="Prazo" optional>
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
        Com prazo, a aplicação avisa quando estiver próximo; com meta de horas, calcula também o ritmo necessário.
      </p>

      <details className="group rounded-xl border border-line" open={Boolean(branch || prUrl || environment)}>
        <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-xs font-semibold text-ink-2">
          Vínculos técnicos <span className="font-normal text-ink-3">· opcional</span>
          <ChevronDown size={15} className="ml-auto transition group-open:rotate-180" />
        </summary>
        <div className="space-y-3 border-t border-line px-3 py-3">
          <Field label="Branch">
            <input value={branch} onChange={(e) => setBranch(e.target.value)} maxLength={200} className="field tabular" />
          </Field>
          <Field label="Link do PR">
            <input
              type="url"
              value={prUrl}
              onChange={(e) => setPrUrl(e.target.value)}
              placeholder="https://…"
              maxLength={500}
              className="field"
            />
          </Field>
          <Field label="Ambiente">
            <select
              value={environment ?? ''}
              onChange={(e) => setEnvironment((e.target.value || null) as DemandEnvironment | null)}
              className="field"
            >
              <option value="">Nenhum</option>
              {DEMAND_ENVIRONMENTS.map((env) => (
                <option key={env} value={env}>
                  {DEMAND_ENVIRONMENT_LABEL[env]}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </details>

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

export function Field({ label, optional, children }: { label: string; optional?: boolean; children: ReactNode }) {
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
