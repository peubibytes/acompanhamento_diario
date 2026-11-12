import { AlertIcon } from './icons';

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton rounded-card ${className}`} />;
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
          className="btn-primary mt-1"
        >
          Tentar novamente
        </button>
      )}
    </div>
  );
}
