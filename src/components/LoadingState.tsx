import { Loader2 } from 'lucide-react'

interface LoadingStateProps {
  message?: string
  compact?: boolean
}

export function LoadingState({ message = 'Loading...', compact = false }: LoadingStateProps) {
  if (compact) {
    return (
      <div className="flex items-center gap-2 py-2">
        <Loader2 className="size-4 animate-spin" style={{ color: 'var(--subtle)' }} />
        <span className="text-sm" style={{ color: 'var(--subtle)' }}>{message}</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <Loader2 className="size-6 animate-spin" style={{ color: 'var(--subtle)' }} />
      <p className="text-sm" style={{ color: 'var(--subtle)' }}>{message}</p>
    </div>
  )
}
