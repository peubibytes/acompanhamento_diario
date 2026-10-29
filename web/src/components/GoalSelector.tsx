import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { formatDuration, formatHM, GOAL_PRESETS, parseHM, type ISODate } from '@acomp/shared';
import { useSetGoal } from '../api/client';
import { PencilIcon } from './icons';
import { useToast } from './Toast';

/** Meta diária: 5h30, 8h48 ou "Outro" (valor livre em hh:mm). */
export function GoalSelector({
  date,
  dailyGoal,
  onSaved,
}: {
  date: ISODate;
  dailyGoal: number;
  /** Chamado depois que a meta é gravada (ex.: para fechar o painel que contém o seletor). */
  onSaved?: () => void;
}) {
  const setGoal = useSetGoal();
  const toast = useToast();
  const isPreset = GOAL_PRESETS.some((p) => p.minutes === dailyGoal);
  const [customOpen, setCustomOpen] = useState(!isPreset);
  const [custom, setCustom] = useState(isPreset ? '' : formatHM(dailyGoal));

  useEffect(() => {
    setCustomOpen(!isPreset);
    setCustom(isPreset ? '' : formatHM(dailyGoal));
  }, [dailyGoal, isPreset]);

  const save = (minutes: number) => {
    if (minutes === dailyGoal) return;
    setGoal.mutate(
      { date, minutes },
      {
        onSuccess: (r) => {
          toast(
            r.appliesToNextCycles
              ? `Meta diária de ${formatHM(minutes)} definida para este ciclo e os próximos.`
              : `Meta diária de ${formatHM(minutes)} definida apenas para este ciclo.`,
          );
          onSaved?.();
        },
        onError: (err) => toast(err.message, 'error'),
      },
    );
  };

  const submitCustom = (e: FormEvent) => {
    e.preventDefault();
    const minutes = parseHM(custom);
    if (minutes === null || minutes <= 0 || minutes > 24 * 60) {
      toast('Informe a meta no formato hh:mm, por exemplo 07:30.', 'error');
      return;
    }
    save(minutes);
  };

  const segment = (active: boolean) =>
    `rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
      active ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:text-ink'
    }`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-ink-2">Meta diária</span>
      <div className="flex items-center rounded-full bg-surface-2 p-1" role="group" aria-label="Meta diária">
        {GOAL_PRESETS.map((p) => (
          <button
            key={p.minutes}
            className={segment(!customOpen && dailyGoal === p.minutes)}
            aria-pressed={!customOpen && dailyGoal === p.minutes}
            onClick={() => {
              setCustomOpen(false);
              save(p.minutes);
            }}
          >
            {p.label}
          </button>
        ))}
        <button className={segment(customOpen)} aria-pressed={customOpen} onClick={() => setCustomOpen(true)}>
          Outro
        </button>
      </div>
      {customOpen && (
        <form onSubmit={submitCustom} className="flex items-center gap-1.5">
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="hh:mm"
            inputMode="numeric"
            aria-label="Meta diária personalizada (hh:mm)"
            className="field tabular w-24 py-1.5! text-center"
            autoFocus={isPreset}
          />
          <button
            type="submit"
            disabled={setGoal.isPending}
            className="rounded-full bg-accent px-3.5 py-1.5 text-sm font-semibold text-on-accent transition hover:bg-accent-hover disabled:opacity-60"
          >
            Aplicar
          </button>
        </form>
      )}
    </div>
  );
}

/**
 * "Meta semanal" que, ao ser tocada, abre o seletor da meta diária: a meta é um ajuste raro,
 * então não ocupa uma linha de controles na tela. O painel é posicionado pelo ancestral
 * `relative` mais próximo (no Painel, a faixa de indicadores), para não vazar no celular.
 */
export function GoalPopover({
  date,
  dailyGoal,
  weekGoal,
  className = '',
}: {
  date: ISODate;
  dailyGoal: number;
  weekGoal: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!panel.current?.contains(target) && !button.current?.contains(target)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className={className}>
      <button
        ref={button}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
        title="Alterar a meta diária"
        className="group -m-1 rounded-lg p-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <span className="flex items-center gap-1 text-2xs font-semibold tracking-wider text-ink-3 uppercase">
          Meta semanal
          <PencilIcon size={11} className="transition group-hover:text-ink" />
        </span>
        <span className="tabular mt-1 block text-2xl font-semibold tracking-tight text-ink sm:text-display sm:font-bold">
          {formatDuration(weekGoal)}
        </span>
      </button>
      {open && (
        <div
          ref={panel}
          id={id}
          role="dialog"
          aria-label="Meta diária"
          className="tip-surface hint-in absolute inset-x-0 top-full z-30 mt-2 p-4 sm:left-auto sm:w-[26rem]"
        >
          <GoalSelector date={date} dailyGoal={dailyGoal} onSaved={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
