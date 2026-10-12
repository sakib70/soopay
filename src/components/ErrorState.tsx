import { AlertCircle, RefreshCw } from 'lucide-react'

interface ErrorStateProps {
  message: string
  onRetry?: () => void
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3 text-center px-4">
      <div
        className="size-10 rounded-full flex items-center justify-center"
        style={{ background: 'rgba(192,41,63,0.08)' }}
      >
        <AlertCircle className="size-5" style={{ color: 'var(--danger)' }} />
      </div>
      <p className="text-sm max-w-xs" style={{ color: 'var(--muted)' }}>{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium transition-all hover:bg-black/5"
          style={{ color: 'var(--accent)' }}
        >
          <RefreshCw className="size-3.5" />
          Try again
        </button>
      )}
    </div>
  )
}
