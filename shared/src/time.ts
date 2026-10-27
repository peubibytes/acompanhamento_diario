// Todo tempo da aplicação é representado em minutos inteiros.

const HM_PATTERN = /^(\d{1,2}):([0-5]\d)$/;

/** "08:45" → 525. Retorna null se o texto não estiver no formato hh:mm. */
export function parseHM(text: string): number | null {
  const match = HM_PATTERN.exec(text.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 525 → "08:45". Horas acima de 24 não "dão a volta" (equivale ao [hh]:mm do Excel). */
export function formatHM(minutes: number): string {
  const abs = Math.abs(minutes);
  return `${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** Formato curto para leitura: 330 → "5h30", 480 → "8h", 45 → "45min". */
export function formatDuration(minutes: number): string {
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h === 0) return `${m}min`;
  return m === 0 ? `${h}h` : `${h}h${pad(m)}`;
}

/** Diferença em relação à meta: 0 → "00:00", 15 → "+00:15", -70 → "-01:10". */
export function formatDiff(diff: number): string {
  if (diff === 0) return '00:00';
  return `${diff > 0 ? '+' : '-'}${formatHM(diff)}`;
}
