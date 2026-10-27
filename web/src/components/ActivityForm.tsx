import { useState, type FormEvent, type ReactNode } from 'react';
import {
  ACTIVITY_STATUSES,
  formatDuration,
  formatHM,
  parseHM,
  STATUS_LABEL,
  type Activity,
  type ActivityStatus,
  type ISODate,
} from '@acomp/shared';
import { useSaveActivity } from '../api/client';
import { statusStyle } from './Badges';
import { ClockIcon } from './icons';
import { useToast } from './Toast';

interface Props {
  date: ISODate;
  /** Atividade em edição; ausente = nova atividade. */
  editing?: Activity;
  /** Sugestão de início para uma nova atividade (fim da última do dia). */
  suggestedStart: string;
  onDone: (saved?: Activity) => void;
}

export function ActivityForm({ date, editing, suggestedStart, onDone }: Props) {
  const save = useSaveActivity();
  const toast = useToast();

  const [start, setStart] = useState(editing ? formatHM(editing.startMinute) : suggestedStart);
  const [end, setEnd] = useState(editing ? formatHM(editing.endMinute) : '');
  const [project, setProject] = useState(editing?.project ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [status, setStatus] = useState<ActivityStatus>(editing?.status ?? 'concluido');

  const startMin = parseHM(start);
  const endMin = parseHM(end);
  const duration = startMin !== null && endMin !== null ? endMin - startMin : null;
  const invalidRange = duration !== null && duration <= 0;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (startMin === null || endMin === null) return toast('Informe os horários de início e fim.', 'error');
    if (invalidRange) return toast('O horário de fim deve ser depois do início.', 'error');

    save.mutate(
      {
        id: editing?.id,
        input: { date, startMinute: startMin, endMinute: endMin, project, description, notes, status },
      },
      {
        onSuccess: ({ activity, warnings }) => {
          toast(editing ? 'Atividade atualizada.' : 'Atividade registrada.');
          warnings.forEach((w) => toast(w, 'warning'));
          if (!editing) {
            setStart(end);
            setEnd('');
            setProject('');
            setDescription('');
            setNotes('');
            setStatus('concluido');
          }
          onDone(activity);
        },
        onError: (err) => toast(err.message, 'error'),
      },
    );
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-3">
        <Field label="Início">
          <input type="time" required value={start} onChange={(e) => setStart(e.target.value)} className="field tabular" />
        </Field>
        <Field label="Fim">
          <input
            type="time"
            required
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="field tabular"
            aria-invalid={invalidRange}
            style={invalidRange ? { borderColor: 'var(--critical)' } : undefined}
          />
        </Field>
        <div
          className={`tabular flex h-[42px] items-center gap-1.5 rounded-xl px-3 text-sm font-semibold ${
            invalidRange ? 'bg-critical-soft text-critical-text' : 'bg-accent-soft text-accent'
          }`}
          aria-live="polite"
          title="Duração"
        >
          <ClockIcon size={15} />
          {duration === null ? '—' : invalidRange ? 'inválido' : formatDuration(duration)}
        </div>
      </div>

      <Field label="Projeto / demanda">
        <input
          required
          value={project}
          onChange={(e) => setProject(e.target.value)}
          placeholder="Ex.: Projeto Alfa"
          maxLength={200}
          className="field"
        />
      </Field>

      <Field label="O que foi feito">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descreva a atividade"
          rows={3}
          maxLength={2000}
          className="field resize-y"
        />
      </Field>

      <Field label="Observações / entregáveis" optional>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Ex.: Curso concluído, certificado enviado"
          maxLength={2000}
          className="field"
        />
      </Field>

      <fieldset>
        <legend className="mb-1.5 text-xs font-semibold text-ink-2">Status</legend>
        <div className="grid grid-cols-2 gap-2">
          {ACTIVITY_STATUSES.map((s) => {
            const active = status === s;
            return (
              <label
                key={s}
                className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
                  active ? `${statusStyle[s].badge} border-transparent font-semibold` : 'border-line text-ink-2 hover:bg-surface-2'
                }`}
              >
                <input
                  type="radio"
                  name="status"
                  value={s}
                  checked={active}
                  onChange={() => setStatus(s)}
                  className="sr-only"
                />
                {statusStyle[s].icon(15)}
                {STATUS_LABEL[s]}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={save.isPending}
          className="flex-1 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent shadow-sm transition hover:bg-accent-hover disabled:opacity-60"
        >
          {save.isPending ? 'Salvando…' : editing ? 'Salvar alterações' : 'Adicionar atividade'}
        </button>
        {editing && (
          <button
            type="button"
            onClick={() => onDone()}
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
