import { AlertIcon } from './icons';

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-surface-2 ${className}`} />;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-12 text-center">
      <span className="grid size-11 place-items-center rounded-full bg-critical-soft text-critical-text">
        <AlertIcon size={22} />
      </span>
      <p className="font-semibold text-ink">Não foi possível carregar os dados</p>
      <p className="max-w-sm text-sm text-ink-2">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-1 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-on-accent hover:bg-accent-hover"
        >
          Tentar novamente
        </button>
      )}
    </div>
  );
}
