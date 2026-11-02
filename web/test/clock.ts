import { vi } from 'vitest';

/** Congela só o relógio (Date), no meio do dia local: timers e fetch seguem reais. */
export function freezeToday(iso: string) {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(`${iso}T12:00:00`) });
}

export const restoreClock = () => vi.useRealTimers();
