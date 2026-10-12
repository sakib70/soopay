import { ConnectKitButton } from 'connectkit'
import { useAccount } from 'wagmi'
import { Copy, Check, AlertTriangle } from 'lucide-react'
import { useState } from 'react'
import { formatAddress, copyToClipboard } from '@/lib/utils'
import { ARC_TESTNET_CHAIN_ID } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { useSafeChainSwitch } from '@/hooks/useSafeChainSwitch'

export function WalletButton() {
  const { address, isConnected, chainId } = useAccount()
  const { safeSwitch, isPending: isSwitching } = useSafeChainSwitch()
  const [copied, setCopied] = useState(false)

  const isWrongChain = isConnected && chainId !== ARC_TESTNET_CHAIN_ID

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!address) return
    copyToClipboard(address).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => undefined)
  }

  if (!isConnected) {
    return (
      <ConnectKitButton.Custom>
        {({ show }) => (
          <button
            onClick={show}
            className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white transition-all hover:scale-[1.02] active:scale-[0.98]"
            style={{ background: 'var(--accent)' }}
          >
            Connect Wallet
          </button>
        )}
      </ConnectKitButton.Custom>
    )
  }

  if (isWrongChain) {
    return (
      <button
        onClick={() => void safeSwitch(ARC_TESTNET_CHAIN_ID)}
        disabled={isSwitching}
        className={cn(
          'flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition-all',
          'hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60',
        )}
        style={{ background: 'rgba(192,41,63,0.12)', color: 'var(--danger)' }}
      >
        <AlertTriangle className="size-3.5" />
        {isSwitching ? 'Switching...' : 'Switch to Arc Testnet'}
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <ConnectKitButton.Custom>
        {({ show }) => (
          <button
            onClick={show}
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition-all hover:bg-black/5"
            style={{ color: 'var(--ink-2)' }}
          >
            <span
              className="size-2 rounded-full"
              style={{ background: 'var(--success)' }}
            />
            <span className="mono">{formatAddress(address ?? '')}</span>
          </button>
        )}
      </ConnectKitButton.Custom>
      <button
        onClick={handleCopy}
        className="rounded-lg p-1.5 transition-all hover:bg-black/5 active:scale-95"
        title="Copy address"
      >
        {copied ? (
          <Check className="size-3.5" style={{ color: 'var(--success)' }} />
        ) : (
          <Copy className="size-3.5" style={{ color: 'var(--muted)' }} />
        )}
      </button>
    </div>
  )
}
