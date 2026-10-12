import { cn } from '@/lib/utils'
import { CIRBTC_CONFIGURED } from '@/lib/constants'

export type Asset = 'USDC' | 'cirBTC'

interface AssetSelectorProps {
  value: Asset
  onChange: (asset: Asset) => void
  disableBridge?: boolean
}

export function AssetSelector({ value, onChange, disableBridge = false }: AssetSelectorProps) {
  void disableBridge // used by parent to filter bridge option

  const assets: { id: Asset; label: string; desc: string }[] = [
    { id: 'USDC', label: 'USDC', desc: 'USD Coin' },
    { id: 'cirBTC', label: 'cirBTC', desc: CIRBTC_CONFIGURED ? 'Circle BTC' : 'Not configured' },
  ]

  return (
    <div
      className="flex gap-1 rounded-xl p-1"
      style={{ background: 'var(--surface-muted)' }}
    >
      {assets.map(({ id, label, desc }) => (
        <button
          key={id}
          onClick={() => { if (id !== 'cirBTC' || CIRBTC_CONFIGURED) onChange(id) }}
          disabled={id === 'cirBTC' && !CIRBTC_CONFIGURED}
          className={cn(
            'flex flex-1 flex-col items-center rounded-lg px-3 py-2 text-xs font-medium transition-all',
            value === id ? 'text-white shadow-sm' : 'hover:bg-black/5 disabled:opacity-40 disabled:cursor-not-allowed',
          )}
          style={value === id ? { background: 'var(--accent)' } : { color: 'var(--ink-2)' }}
        >
          <span className="font-semibold">{label}</span>
          <span className="text-[10px] opacity-75">{desc}</span>
        </button>
      ))}
    </div>
  )
}
