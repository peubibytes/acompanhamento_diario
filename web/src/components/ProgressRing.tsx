import { useEffect, useState } from 'react';
import { motionOK, useCountUp } from '../motion';

/**
 * `exceeded`: horas acima da meta — o anel fica vermelho (irregular) em vez de verde.
 * Ao aparecer, o anel se desenha a partir do zero e o número sobe junto.
 */
export function ProgressRing({ percent, exceeded = false, size = 72 }: { percent: number; exceeded?: boolean; size?: number }) {
  const stroke = Math.max(5, Math.round(size / 10));
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const shown = Math.min(percent, 100);
  const complete = percent >= 100;
  // Começa vazio e, no quadro seguinte, vai ao valor: a transição do traço faz o desenho.
  const [drawn, setDrawn] = useState(() => !motionOK());
  useEffect(() => {
    const frame = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  const counted = useCountUp(percent);

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
          strokeDashoffset={circumference * (1 - (drawn ? shown : 0) / 100)}
          style={{ transition: 'stroke-dashoffset var(--dur-4) var(--ease-out), stroke var(--dur-2)' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <p className="tabular text-lg font-bold tracking-tight text-ink">
          {counted}
          <span className="text-xs font-semibold text-ink-3">%</span>
        </p>
      </div>
    </div>
  );
}
