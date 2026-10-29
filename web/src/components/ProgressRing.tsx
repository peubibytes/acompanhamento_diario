/** `exceeded`: horas acima da meta — o anel fica vermelho (irregular) em vez de verde. */
export function ProgressRing({ percent, exceeded = false, size = 72 }: { percent: number; exceeded?: boolean; size?: number }) {
  const stroke = Math.max(5, Math.round(size / 10));
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const shown = Math.min(percent, 100);
  const complete = percent >= 100;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        role="img"
        aria-label={`${percent}% das horas da semana apontadas`}
      >
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--grid)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={exceeded ? 'var(--critical)' : complete ? 'var(--good)' : 'var(--accent)'}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - shown / 100)}
          style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(.2,.8,.2,1)' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <p className="tabular text-lg font-bold tracking-tight text-ink">
          {percent}
          <span className="text-xs font-semibold text-ink-3">%</span>
        </p>
      </div>
    </div>
  );
}
