import { ExternalLink } from 'lucide-react'
import { buildArcScanTxUrl, truncateHash } from '@/lib/utils'

interface ExplorerLinkProps {
  txHash: string
  label?: string
  compact?: boolean
}

export function ExplorerLink({ txHash, label, compact = false }: ExplorerLinkProps) {
  const url = buildArcScanTxUrl(txHash)

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all hover:bg-black/5"
      style={{ color: 'var(--accent-hover)' }}
    >
      <span className="mono">{label || truncateHash(txHash)}</span>
      {!compact && <ExternalLink className="size-3" />}
    </a>
  )
}
