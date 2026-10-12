import { useAccount } from 'wagmi'
import { ARC_TESTNET_CHAIN_ID } from '@/lib/constants'

export function NetworkBadge() {
  const { isConnected, chainId } = useAccount()

  if (!isConnected) return null

  const onArc = chainId === ARC_TESTNET_CHAIN_ID
  const label = onArc ? 'Arc Testnet' : `Chain ${chainId}`

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{
        background: onArc ? 'rgba(22,120,74,0.10)' : 'rgba(192,41,63,0.10)',
        color: onArc ? 'var(--success)' : 'var(--danger)',
      }}
    >
      <span
        className="size-1.5 rounded-full"
        style={{ background: onArc ? 'var(--success)' : 'var(--danger)' }}
      />
      {label}
    </span>
  )
}
