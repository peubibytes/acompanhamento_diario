import { useEffect, useState, type FormEvent } from 'react';
import { formatHM, GOAL_PRESETS, parseHM, type ISODate } from '@acomp/shared';
import { useSetGoal } from '../api/client';
import { useToast } from './Toast';

/** Meta diária: 5h30, 8h48 ou "Outro" (valor livre em hh:mm). */
export function GoalSelector({ date, dailyGoal }: { date: ISODate; dailyGoal: number }) {
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
        onSuccess: (r) =>
          toast(
            r.appliesToNextCycles
              ? `Meta diária de ${formatHM(minutes)} definida para este ciclo e os próximos.`
              : `Meta diária de ${formatHM(minutes)} definida apenas para este ciclo.`,
          ),
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
