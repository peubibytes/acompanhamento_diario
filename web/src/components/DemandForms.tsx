import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import {
  CYCLE_STATUS_LABEL,
  CYCLE_STATUSES,
  DEMAND_ENVIRONMENT_LABEL,
  DEMAND_ENVIRONMENTS,
  DEMAND_KIND_LABEL,
  DEMAND_KINDS,
  DEMAND_PRIORITIES,
  DEMAND_PRIORITY_LABEL,
  MEETING_TYPE_SUGGESTIONS,
  TASK_STATUS_LABEL,
  TASK_STATUSES,
  todayISO,
  type CycleDemand,
  type CycleStatus,
  type DemandCategory,
  type DemandEnvironment,
  type DemandInput,
  type DemandKind,
  type DemandPriority,
  type DemandSummary,
  type MeetingDemand,
  type TaskStatus,
  type TicketDemand,
  type TrainingDemand,
} from '@acomp/shared';
import { useSaveDemand } from '../api/client';
import { taskStatusStyle } from './DemandVisuals';
import { Field } from './Field';
import { ChevronDown } from './icons';
import { InfoHint } from './InfoHint';
import { useToast } from './Toast';

type Editing<C extends DemandCategory> = Extract<DemandSummary, { category: C }>;

/** Formulário de declaração da categoria escolhida (nenhum tem campo de horas). */
export function DemandForm({
  category,
  editing,
  onDone,
  onDirtyChange,
}: {
  category: DemandCategory;
  editing?: DemandSummary;
  /** Chamado ao salvar ou ao cancelar: quem abriu o painel o fecha. */
  onDone: () => void;
  /** Avisa o painel quando há algo digitado que se perderia ao fechar. */
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const same = editing?.category === category ? editing : undefined;
  const shared = { onDone, onDirtyChange };
  switch (category) {
    case 'ciclo':
      return <CycleForm editing={same as Editing<'ciclo'> | undefined} {...shared} />;
    case 'chamado':
      return <TicketForm editing={same as Editing<'chamado'> | undefined} {...shared} />;
    case 'reuniao':
      return <MeetingForm editing={same as Editing<'reuniao'> | undefined} {...shared} />;
    case 'treinamento':
      return <TrainingForm editing={same as Editing<'treinamento'> | undefined} {...shared} />;
  }
}

interface FormProps<T> {
  editing?: T;
  onDone: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

/**
 * Sujo = o conteúdo atual difere do inicial (o da demanda editada ou o formulário vazio). Compara
 * um retrato dos campos, então vale para qualquer formulário sem listar campo a campo.
 */
function useDirty(snapshot: unknown, onDirtyChange?: (dirty: boolean) => void) {
  const initial = useRef<string | null>(null);
  const current = JSON.stringify(snapshot);
  initial.current ??= current;
  const dirty = current !== initial.current;
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);
}

const CREATED: Record<DemandCategory, string> = {
  ciclo: 'Ciclo declarado.',
  chamado: 'Chamado declarado.',
  reuniao: 'Reunião declarada.',
  treinamento: 'Treinamento declarado.',
};

/** Grava a declaração e fecha o painel. */
function useSubmit(editing: { id: number; category: DemandCategory } | undefined, onDone: () => void) {
  const save = useSaveDemand();
  const toast = useToast();
  const submit = (input: DemandInput) =>
    save.mutate(
      { id: editing?.id, input },
      {
        onSuccess: () => {
          toast(editing ? 'Alterações salvas.' : CREATED[input.category]);
          onDone();
        },
        onError: (err) => toast(err.message, 'error'),
      },
    );
  return { submit, pending: save.isPending };
}

function CycleForm({ editing, onDone, onDirtyChange }: FormProps<CycleDemand>) {
  const [title, setTitle] = useState(editing?.title ?? '');
  const [kind, setKind] = useState<DemandKind>(editing?.kind ?? 'planejada');
  const [status, setStatus] = useState<CycleStatus>(editing?.status ?? 'novo');
  const [priority, setPriority] = useState<DemandPriority>(editing?.priority ?? 'media');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [startDate, setStartDate] = useState(editing?.startDate ?? todayISO());
  const [dueDate, setDueDate] = useState(editing?.dueDate ?? '');
  const [branch, setBranch] = useState(editing?.branch ?? '');
  const [prUrl, setPrUrl] = useState(editing?.prUrl ?? '');
  const [environment, setEnvironment] = useState<DemandEnvironment | null>(editing?.environment ?? null);
  const toast = useToast();
  const invalidDue = dueDate !== '' && dueDate < startDate;

  const { submit, pending } = useSubmit(editing, onDone);
  useDirty({ title, kind, status, priority, description, startDate, dueDate, branch, prUrl, environment }, onDirtyChange);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (invalidDue) return toast('O prazo não pode ser anterior ao início.', 'error');
    submit({
      category: 'ciclo',
      title,
      kind,
      status,
      priority,
      description,
      startDate,
      dueDate: dueDate || null,
      branch,
      prUrl,
      environment,
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Nome do projeto">
        <input
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex.: Migração dos relatórios"
          maxLength={200}
          className="field"
        />
      </Field>

      <fieldset>
        <legend className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-ink-2">
          Tipo
          <InfoHint label="Sobre o tipo do ciclo">
            <span className="block">
              <strong className="font-semibold text-ink">Planejada:</strong> estava no planejamento.
            </span>
            <span className="mt-1.5 block">
              <strong className="font-semibold text-ink">Intempestiva:</strong> não estava planejada e interrompeu o que
              estava previsto.
            </span>
            <span className="mt-1.5 block">
              <strong className="font-semibold text-ink">Preventiva:</strong> feita para evitar um problema futuro.
            </span>
          </InfoHint>
        </legend>
        <div className="flex rounded-full bg-surface-2 p-1">
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
          <select value={status} onChange={(e) => setStatus(e.target.value as CycleStatus)} className="field">
            {CYCLE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {CYCLE_STATUS_LABEL[s]}
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

      <Field label="Descrição" optional>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Escopo, entregáveis, contexto"
          rows={3}
          maxLength={4000}
          className="field resize-y"
        />
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

      <details className="group rounded-xl border border-line" open={Boolean(branch || prUrl || environment)}>
        <summary className="flex cursor-pointer list-none items-center gap-1 px-3 py-2.5 text-xs font-semibold text-ink-2">
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

      <Actions editing={Boolean(editing)} pending={pending} onCancel={onDone} create="Declarar ciclo" />
    </form>
  );
}

function TicketForm({ editing, onDone, onDirtyChange }: FormProps<TicketDemand>) {
  const [ticketNumber, setTicketNumber] = useState(editing?.ticketNumber ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [status, setStatus] = useState<TaskStatus>(editing?.status ?? 'nao_iniciado');
  const { submit, pending } = useSubmit(editing, onDone);
  useDirty({ ticketNumber, description, status }, onDirtyChange);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit({ category: 'chamado', ticketNumber, description, status });
      }}
      className="space-y-4"
    >
      <Field label="Número do chamado">
        <input
          required
          value={ticketNumber}
          onChange={(e) => setTicketNumber(e.target.value.toUpperCase())}
          placeholder="Ex.: SCTASK0012345"
          maxLength={60}
          autoComplete="off"
          className="field tabular font-medium tracking-wide"
        />
      </Field>
      <Field label="Descrição">
        <textarea
          required
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Qual o problema, quem solicitou e outras informações relevantes"
          rows={5}
          maxLength={4000}
          className="field resize-y"
        />
      </Field>
      <TaskStatusPicker value={status} onChange={setStatus} />
      <Actions editing={Boolean(editing)} pending={pending} onCancel={onDone} create="Declarar chamado" />
    </form>
  );
}

function MeetingForm({ editing, onDone, onDirtyChange }: FormProps<MeetingDemand>) {
  const [meetingType, setMeetingType] = useState(editing?.meetingType ?? '');
  const [participants, setParticipants] = useState(editing?.participants ?? '');
  const [subject, setSubject] = useState(editing?.subject ?? '');
  const listId = useId();
  const { submit, pending } = useSubmit(editing, onDone);
  useDirty({ meetingType, participants, subject }, onDirtyChange);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit({ category: 'reuniao', meetingType, participants, subject });
      }}
      className="space-y-4"
    >
      <Field label="Tipo de reunião">
        <input
          required
          list={listId}
          value={meetingType}
          onChange={(e) => setMeetingType(e.target.value)}
          placeholder="Ex.: Daily"
          maxLength={60}
          className="field"
        />
        <datalist id={listId}>
          {MEETING_TYPE_SUGGESTIONS.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </Field>
      <div className="-mt-2 flex flex-wrap gap-1.5">
        {MEETING_TYPE_SUGGESTIONS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setMeetingType(t)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              meetingType === t ? 'border-accent bg-accent-soft text-accent' : 'border-line text-ink-2 hover:bg-surface-2'
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      <Field label="Com quem">
        <input
          required
          value={participants}
          onChange={(e) => setParticipants(e.target.value)}
          placeholder="Ex.: Equipe de dados"
          maxLength={200}
          className="field"
        />
      </Field>
      <Field label="Assunto">
        <input
          required
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Ex.: Status do dia"
          maxLength={200}
          className="field"
        />
      </Field>
      <Actions editing={Boolean(editing)} pending={pending} onCancel={onDone} create="Declarar reunião" />
    </form>
  );
}

function TrainingForm({ editing, onDone, onDirtyChange }: FormProps<TrainingDemand>) {
  const [title, setTitle] = useState(editing?.title ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [status, setStatus] = useState<TaskStatus>(editing?.status ?? 'nao_iniciado');
  const { submit, pending } = useSubmit(editing, onDone);
  useDirty({ title, description, status }, onDirtyChange);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit({ category: 'treinamento', title, description, status });
      }}
      className="space-y-4"
    >
      <Field label="Nome do treinamento">
        <input
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex.: Curso de SQL"
          maxLength={200}
          className="field"
        />
      </Field>
      <Field label="Descrição" optional>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Instituição ou plataforma, conteúdo, certificado…"
          rows={3}
          maxLength={4000}
          className="field resize-y"
        />
      </Field>
      <TaskStatusPicker value={status} onChange={setStatus} />
      <Actions editing={Boolean(editing)} pending={pending} onCancel={onDone} create="Declarar treinamento" />
    </form>
  );
}

function TaskStatusPicker({ value, onChange }: { value: TaskStatus; onChange: (s: TaskStatus) => void }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-xs font-semibold text-ink-2">Status</legend>
      <div className="grid grid-cols-2 gap-2">
        {TASK_STATUSES.map((s) => {
          const active = value === s;
          return (
            <label
              key={s}
              className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent ${
                active ? `${taskStatusStyle[s].badge} border-transparent font-semibold` : 'border-line text-ink-2 hover:bg-surface-2'
              }`}
            >
              <input type="radio" name="status" value={s} checked={active} onChange={() => onChange(s)} className="sr-only" />
              {taskStatusStyle[s].icon(15)}
              {TASK_STATUS_LABEL[s]}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function Actions({
  editing,
  pending,
  onCancel,
  create,
}: {
  editing: boolean;
  pending: boolean;
  onCancel: () => void;
  create: string;
}) {
  return (
    <div className="space-y-2 pt-1">
      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? 'Salvando…' : editing ? 'Salvar alterações' : create}
      </button>
      <div className="flex justify-center">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full px-4 py-2 text-sm font-semibold text-ink-3 outline-none transition hover:bg-surface-2 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
