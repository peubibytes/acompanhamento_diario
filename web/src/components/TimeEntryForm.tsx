import { useEffect, useId, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import {
  DEMAND_CATEGORY_LABEL,
  formatDuration,
  formatHM,
  parseHM,
  statusesOf,
  statusLabel,
  type Activity,
  type DemandSummary,
  type ISODate,
} from '@acomp/shared';
import { useDemand, useDemands, useSaveActivity } from '../api/client';
import { CategoryAvatar, LoggedSummary } from './DemandVisuals';
import { DemandPicker } from './DemandPicker';
import { Field } from './Field';
import { AlertIcon, ArrowRight, ClockIcon } from './icons';
import { useToast } from './Toast';

interface Props {
  date: ISODate;
  /** Apontamento em edição; ausente = novo apontamento. */
  editing?: Activity;
  /** Sugestão de início para um novo apontamento (fim do último do dia). */
  suggestedStart: string;
  /** `keepOpen`: salvou com "Adicionar e continuar"; o painel fica aberto para o próximo. */
  onDone: (saved?: Activity, keepOpen?: boolean) => void;
  /** Avisa o painel quando há algo digitado que se perderia ao fechar. */
  onDirtyChange?: (dirty: boolean) => void;
}

/** Texto de exemplo do "o que foi feito", conforme o tipo da demanda escolhida. */
const DONE_PLACEHOLDER: Record<DemandSummary['category'], string> = {
  ciclo: 'Ex.: Ajuste das consultas e testes',
  chamado: 'Ex.: Análise do log e correção aplicada',
  reuniao: 'Ex.: Pontos discutidos e combinados',
  treinamento: 'Ex.: Módulo 2 concluído',
  atividade: 'Ex.: Rascunho da documentação revisado',
};

/** Apontar = escolher uma demanda já declarada e registrar o horário em que ela foi feita. */
export function TimeEntryForm({ date, editing, suggestedStart, onDone, onDirtyChange }: Props) {
  const save = useSaveActivity();
  const toast = useToast();
  const demands = useDemands();

  const [demandId, setDemandId] = useState<number | null>(editing?.demandId ?? null);
  const [start, setStart] = useState(editing ? formatHM(editing.startMinute) : suggestedStart);
  const [end, setEnd] = useState(editing ? formatHM(editing.endMinute) : '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [participants, setParticipants] = useState(editing?.participants ?? '');
  const [subject, setSubject] = useState(editing?.subject ?? '');
  // Status novo para a demanda (v0.14): nulo = não mexer. Gravado na demanda, junto com o apontamento.
  const [statusChoice, setStatusChoice] = useState<string | null>(null);
  const peopleListId = useId();

  // O status mostrado precisa ser o de agora, mesmo que a lista de demandas esteja em cache.
  const queryClient = useQueryClient();
  useEffect(() => {
    void queryClient.invalidateQueries({ queryKey: ['demands'] });
  }, [queryClient]);

  const chooseDemand = (id: number | null) => {
    setDemandId(id);
    setStatusChoice(null);
  };

  const all = demands.data ?? [];
  const chosen = all.find((d) => d.id === demandId);
  const isMeeting = chosen?.category === 'reuniao';
  const chosenStatuses = chosen ? statusesOf(chosen.category) : [];
  const currentStatus = chosen && 'status' in chosen ? (chosen.status as string) : null;
  const effectiveStatus = statusChoice ?? currentStatus;
  // Sugestões de "com quem": as pessoas já informadas nesta reunião.
  const meetingDetail = useDemand(chosen?.id ?? 0, isMeeting);
  const knownPeople = [
    ...new Set(
      (meetingDetail.data?.activities ?? [])
        .flatMap((a) => (a.participants ? [a.participants] : []))
        .concat(chosen?.category === 'reuniao' && chosen.participants ? [chosen.participants] : []),
    ),
  ];
  const startMin = parseHM(start);
  const endMin = parseHM(end);
  const duration = startMin !== null && endMin !== null ? endMin - startMin : null;
  const invalidRange = duration !== null && duration <= 0;

  // Novo: sujo quando algo foi preenchido (o início sugerido não conta). Edição: quando difere do salvo.
  const dirty = editing
    ? demandId !== editing.demandId ||
      start !== formatHM(editing.startMinute) ||
      end !== formatHM(editing.endMinute) ||
      description !== editing.description ||
      notes !== editing.notes ||
      participants !== editing.participants ||
      subject !== editing.subject ||
      statusChoice !== null
    : demandId !== null || end !== '' || description !== '' || notes !== '' || participants !== '' || subject !== '';
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  const persist = (keepOpen: boolean) => {
    if (demandId === null) return toast('Escolha a demanda apontada.', 'error');
    if (startMin === null || endMin === null) return toast('Informe os horários de início e fim.', 'error');
    if (invalidRange) return toast('O horário de fim deve ser depois do início.', 'error');

    save.mutate(
      {
        id: editing?.id,
        input: {
          date,
          startMinute: startMin,
          endMinute: endMin,
          demandId,
          description,
          notes,
          ...(isMeeting ? { participants, subject } : {}),
          ...(statusChoice !== null && statusChoice !== currentStatus ? { demandStatus: statusChoice } : {}),
        },
      },
      {
        onSuccess: ({ activity, warnings }) => {
          toast(editing ? 'Apontamento atualizado.' : 'Apontamento registrado.');
          warnings.forEach((w) => toast(w, 'warning'));
          if (!editing) {
            chooseDemand(null);
            setStart(end);
            setEnd('');
            setDescription('');
            setNotes('');
            setParticipants('');
            setSubject('');
          }
          onDone(activity, keepOpen);
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
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        persist(false);
      }}
      className="space-y-4"
    >
      {editing && editing.demandId === null && (
        <p className="flex items-start gap-2 rounded-xl bg-warning-soft px-3 py-2.5 text-sm text-warning-text">
          <AlertIcon size={16} className="mt-0.5 shrink-0" />
          <span>
            Apontamento antigo, sem demanda (projeto “{editing.project}”). Escolha a demanda declarada para salvar.
          </span>
        </p>
      )}

      <DemandPicker demands={all} value={demandId} onChange={chooseDemand} />

      {chosen && (
        <div className="-mt-1 flex items-start gap-2.5 rounded-xl bg-surface-2 px-3 py-2.5">
          <CategoryAvatar category={chosen.category} size={28} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">
              {chosen.label}
              <span className="ml-1.5 text-xs font-normal text-ink-3">{DEMAND_CATEGORY_LABEL[chosen.category]}</span>
            </p>
            <LoggedSummary metrics={chosen.metrics} compact />
          </div>
          {chosen.category !== 'reuniao' && (
            <div className="flex shrink-0 flex-col items-end gap-1">
              <label className="sr-only" htmlFor="demand-status">
                Status da demanda
              </label>
              <select
                id="demand-status"
                value={effectiveStatus ?? ''}
                onChange={(e) => setStatusChoice(e.target.value)}
                className="field font-medium"
                style={{ width: "auto", minWidth: "9rem", padding: "0.35rem 0.6rem", fontSize: "var(--text-xs)" }}
              >
                {chosenStatuses.map((s) => (
                  <option key={s} value={s}>
                    {statusLabel(s)}
                  </option>
                ))}
              </select>
              <Link
                to={`/demandas#demanda-${chosen.id}`}
                className="text-2xs font-medium text-ink-3 hover:text-ink hover:underline"
              >
                Alterar em Demandas
              </Link>
            </div>
          )}
        </div>
      )}

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

      {isMeeting && (
        <>
          <Field label="Com quem" optional>
            <input
              list={peopleListId}
              value={participants}
              onChange={(e) => setParticipants(e.target.value)}
              placeholder="Ex.: Equipe de dados"
              maxLength={200}
              className="field"
            />
            <datalist id={peopleListId}>
              {knownPeople.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </Field>
          <Field label="Assunto" optional>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Ex.: Status do dia"
              maxLength={200}
              className="field"
            />
          </Field>
        </>
      )}

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

      <div className="space-y-2 pt-1">
        <button type="submit" disabled={save.isPending} className="btn-primary w-full">
          {save.isPending ? 'Salvando…' : editing ? 'Salvar alterações' : 'Adicionar apontamento'}
        </button>
        <div className="flex items-center justify-center gap-1">
          {!editing && (
            <button
              type="button"
              onClick={() => persist(true)}
              disabled={save.isPending}
              className="rounded-full px-4 py-2 text-sm font-semibold text-ink-2 outline-none transition hover:bg-surface-2 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60"
            >
              Adicionar e continuar
            </button>
          )}
          <button
            type="button"
            onClick={() => onDone()}
            className="rounded-full px-4 py-2 text-sm font-semibold text-ink-3 outline-none transition hover:bg-surface-2 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"
          >
            Cancelar
          </button>
        </div>
      </div>
    </form>
  );
}
