import { Loader2, CheckCircle2, XCircle, ExternalLink } from 'lucide-react'
import { buildArcScanTxUrl, truncateHash } from '@/lib/utils'
import { motion } from 'framer-motion'

export type TxStatus = 'idle' | 'pending' | 'confirming' | 'success' | 'error'

interface TransactionStatusProps {
  status: TxStatus
  txHash?: string
  error?: string
  onReset?: () => void
  successMessage?: string
}

export function TransactionStatus({
  status,
  txHash,
  error,
  onReset,
  successMessage = 'Transaction confirmed',
}: TransactionStatusProps) {
  if (status === 'idle') return null

  const states = {
    pending: {
      Icon: Loader2,
      spin: true,
      color: 'var(--accent)',
      bg: 'rgba(15,32,53,0.06)',
      message: 'Confirm in your wallet...',
    },
    confirming: {
      Icon: Loader2,
      spin: true,
      color: 'var(--accent-hover)',
      bg: 'rgba(26,90,175,0.08)',
      message: 'Waiting for confirmation...',
    },
    success: {
      Icon: CheckCircle2,
      spin: false,
      color: 'var(--success)',
      bg: 'rgba(22,120,74,0.08)',
      message: successMessage,
    },
    error: {
      Icon: XCircle,
      spin: false,
      color: 'var(--danger)',
      bg: 'rgba(192,41,63,0.08)',
      message: error || 'Transaction failed',
    },
  }

  const state = states[status]
  const { Icon, spin, color, bg, message } = state

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl p-4"
      style={{ background: bg }}
    >
      <div className="flex items-start gap-3">
        <Icon
          className={`size-5 shrink-0 mt-0.5 ${spin ? 'animate-spin' : ''}`}
          style={{ color }}
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            {message}
          </p>
          {txHash && status !== 'pending' && (
            <a
              href={buildArcScanTxUrl(txHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1.5 inline-flex items-center gap-1 text-xs"
              style={{ color: 'var(--accent-hover)' }}
            >
              <span className="mono">{truncateHash(txHash)}</span>
              <ExternalLink className="size-2.5" />
            </a>
          )}
        </div>
        {(status === 'success' || status === 'error') && onReset && (
          <button
            onClick={onReset}
            className="text-xs font-medium rounded-lg px-2.5 py-1 hover:bg-black/5 transition-all shrink-0"
            style={{ color: 'var(--muted)' }}
          >
            {status === 'success' ? 'New' : 'Retry'}
          </button>
        )}
      </div>
    </motion.div>
  )
}
