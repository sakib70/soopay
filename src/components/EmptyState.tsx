import type { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  Icon: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
}

export function EmptyState({ Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-6">
      <div
        className="size-12 rounded-2xl flex items-center justify-center"
        style={{ background: 'var(--surface-muted)' }}
      >
        <Icon className="size-5" style={{ color: 'var(--subtle)' }} />
      </div>
      <div>
        <p className="font-semibold text-sm" style={{ color: 'var(--ink-2)' }}>{title}</p>
        {description && (
          <p className="text-xs mt-1 max-w-xs" style={{ color: 'var(--subtle)' }}>{description}</p>
        )}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
