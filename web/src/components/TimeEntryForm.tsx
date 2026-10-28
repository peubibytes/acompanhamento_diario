import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import {
  ACTIVITY_STATUSES,
  DEMAND_CATEGORIES,
  DEMAND_CATEGORY_LABEL,
  DEMAND_CATEGORY_PLURAL,
  formatDuration,
  formatHM,
  isOpenDemand,
  parseHM,
  STATUS_LABEL,
  type Activity,
  type ActivityStatus,
  type DemandSummary,
  type ISODate,
} from '@acomp/shared';
import { useDemands, useSaveActivity } from '../api/client';
import { statusStyle } from './Badges';
import { CategoryAvatar, categoryIcon, LoggedSummary } from './DemandVisuals';
import { Field } from './Field';
import { AlertIcon, ArrowRight, ClockIcon } from './icons';
import { useToast } from './Toast';

interface Props {
  date: ISODate;
  /** Apontamento em edição; ausente = novo apontamento. */
  editing?: Activity;
  /** Sugestão de início para um novo apontamento (fim do último do dia). */
  suggestedStart: string;
  onDone: (saved?: Activity) => void;
}

const MAX_RECENT = 5;
const shorten = (text: string, max = 48) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** Texto de exemplo do "o que foi feito", conforme o tipo da demanda escolhida. */
const DONE_PLACEHOLDER: Record<DemandSummary['category'], string> = {
  ciclo: 'Ex.: Ajuste das consultas e testes',
  chamado: 'Ex.: Análise do log e correção aplicada',
  reuniao: 'Ex.: Pontos discutidos e combinados',
  treinamento: 'Ex.: Módulo 2 concluído',
};

/** Apontar = escolher uma demanda já declarada e registrar o horário em que ela foi feita. */
export function TimeEntryForm({ date, editing, suggestedStart, onDone }: Props) {
  const save = useSaveActivity();
  const toast = useToast();
  const demands = useDemands();

  const [demandId, setDemandId] = useState<number | null>(editing?.demandId ?? null);
  const [showClosed, setShowClosed] = useState(false);
  const [start, setStart] = useState(editing ? formatHM(editing.startMinute) : suggestedStart);
  const [end, setEnd] = useState(editing ? formatHM(editing.endMinute) : '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [status, setStatus] = useState<ActivityStatus>(editing?.status ?? 'concluido');

  const all = demands.data ?? [];
  const chosen = all.find((d) => d.id === demandId);
  // Abertas; as encerradas só a pedido (ou se já forem a escolhida).
  const options = all.filter((d) => isOpenDemand(d) || showClosed || d.id === demandId);
  const hasClosed = all.some((d) => !isOpenDemand(d));
  const recent = all
    .filter((d) => isOpenDemand(d) && d.metrics.lastActivityDate)
    .sort(
      (a, b) =>
        b.metrics.lastActivityDate!.localeCompare(a.metrics.lastActivityDate!) || b.metrics.activityCount - a.metrics.activityCount,
    )
    .slice(0, MAX_RECENT);

  const startMin = parseHM(start);
  const endMin = parseHM(end);
  const duration = startMin !== null && endMin !== null ? endMin - startMin : null;
  const invalidRange = duration !== null && duration <= 0;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (demandId === null) return toast('Escolha a demanda apontada.', 'error');
    if (startMin === null || endMin === null) return toast('Informe os horários de início e fim.', 'error');
    if (invalidRange) return toast('O horário de fim deve ser depois do início.', 'error');

    save.mutate(
      { id: editing?.id, input: { date, startMinute: startMin, endMinute: endMin, demandId, description, notes, status } },
      {
        onSuccess: ({ activity, warnings }) => {
          toast(editing ? 'Apontamento atualizado.' : 'Apontamento registrado.');
          warnings.forEach((w) => toast(w, 'warning'));
          if (!editing) {
            setDemandId(null);
            setStart(end);
            setEnd('');
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

  if (demands.isSuccess && all.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line px-5 py-8 text-center">
        <p className="font-semibold text-ink">Nada declarado ainda</p>
        <p className="mx-auto mt-1 max-w-xs text-sm text-ink-2">
          Os apontamentos são feitos sobre o que você declarou: chamados, reuniões, treinamentos ou ciclos.
        </p>
        <Link
          to="/demandas"
          className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-on-accent hover:bg-accent-hover"
        >
          Declarar em Demandas <ArrowRight size={15} />
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {editing && editing.demandId === null && (
        <p className="flex items-start gap-2 rounded-xl bg-warning-soft px-3 py-2.5 text-sm text-warning-text">
          <AlertIcon size={16} className="mt-0.5 shrink-0" />
          <span>
            Apontamento antigo, sem demanda (projeto “{editing.project}”). Escolha a demanda declarada para salvar.
          </span>
        </p>
      )}

      <Field label="Demanda">
        <select
          required
          value={demandId ?? ''}
          onChange={(e) => setDemandId(e.target.value ? Number(e.target.value) : null)}
          className="field"
        >
          <option value="">Escolha o que foi feito…</option>
          {DEMAND_CATEGORIES.map((c) => {
            const group = options.filter((d) => d.category === c);
            return (
              group.length > 0 && (
                <optgroup key={c} label={DEMAND_CATEGORY_PLURAL[c]}>
                  {group.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                      {d.subtitle && d.category !== 'reuniao' ? ` — ${shorten(d.subtitle)}` : ''}
                      {d.category === 'reuniao' ? ` (${d.subtitle})` : ''}
                      {isOpenDemand(d) ? '' : ' · encerrada'}
                    </option>
                  ))}
                </optgroup>
              )
            );
          })}
        </select>
      </Field>

      {chosen ? (
        <div className="-mt-1 flex items-start gap-2.5 rounded-xl bg-surface-2 px-3 py-2.5">
          <CategoryAvatar category={chosen.category} size={28} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">
              {chosen.label}
              <span className="ml-1.5 text-xs font-normal text-ink-3">{DEMAND_CATEGORY_LABEL[chosen.category]}</span>
            </p>
            <LoggedSummary metrics={chosen.metrics} compact />
          </div>
        </div>
      ) : (
        recent.length > 0 && (
          <div className="-mt-1">
            <p className="mb-1.5 text-[11px] font-semibold tracking-wider text-ink-3 uppercase">Recentes</p>
            <div className="flex flex-wrap gap-1.5">
              {recent.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setDemandId(d.id)}
                  title={d.subtitle || d.label}
                  className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs font-medium text-ink-2 transition hover:border-accent hover:bg-accent-soft hover:text-accent"
                >
                  <span className="shrink-0">{categoryIcon[d.category](13)}</span>
                  <span className="truncate">{shorten(d.label, 32)}</span>
                </button>
              ))}
            </div>
          </div>
        )
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        {hasClosed ? (
          <label className="inline-flex cursor-pointer items-center gap-2 text-ink-2">
            <input
              type="checkbox"
              checked={showClosed}
              onChange={(e) => setShowClosed(e.target.checked)}
              className="size-3.5 accent-[var(--accent)]"
            />
            Mostrar encerradas
          </label>
        ) : (
          <span />
        )}
        <Link to="/demandas" className="font-semibold text-accent hover:underline">
          Declarar nova demanda
        </Link>
      </div>

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

      <Field label="O que foi feito" optional>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={chosen ? DONE_PLACEHOLDER[chosen.category] : 'Descreva o que foi feito neste horário'}
          rows={3}
          maxLength={2000}
          className="field resize-y"
        />
      </Field>

      <Field label="Observações / entregáveis" optional>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Ex.: Certificado enviado, PR aberto"
          maxLength={2000}
          className="field"
        />
      </Field>

      <fieldset>
        <legend className="mb-1.5 text-xs font-semibold text-ink-2">Status do apontamento</legend>
        <div className="grid grid-cols-2 gap-2">
          {ACTIVITY_STATUSES.map((s) => {
            const active = status === s;
            return (
              <label
                key={s}
                className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent ${
                  active ? `${statusStyle[s].badge} border-transparent font-semibold` : 'border-line text-ink-2 hover:bg-surface-2'
                }`}
              >
                <input type="radio" name="status" value={s} checked={active} onChange={() => setStatus(s)} className="sr-only" />
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
          {save.isPending ? 'Salvando…' : editing ? 'Salvar alterações' : 'Adicionar apontamento'}
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
