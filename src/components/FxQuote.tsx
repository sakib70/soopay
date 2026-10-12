import { RefreshCw, Clock } from 'lucide-react'
import { relativeTime } from '@/lib/utils'
import type { FxRates } from '@/hooks/useFx'
import type { CurrencyCode } from '@/lib/constants'

interface FxQuoteProps {
  localAmount: string
  currency: CurrencyCode
  asset: 'USDC' | 'cirBTC'
  rates: FxRates | null
  loading: boolean
  error: string | null
  lastFetched: number | null
  onRefresh?: () => void
}

export function FxQuote({
  localAmount,
  currency,
  asset,
  rates,
  loading,
  error,
  lastFetched,
  onRefresh,
}: FxQuoteProps) {
  const amount = parseFloat(localAmount)
  const valid = !isNaN(amount) && amount > 0 && !!rates

  const formatQuote = () => {
    if (!valid || !rates) return null
    if (asset === 'USDC') {
      const usdc = amount * rates.localToUsd
      return {
        value: usdc < 0.01 ? usdc.toFixed(6) : usdc.toFixed(2),
        suffix: 'USDC',
        rate: `1 ${currency} ≈ ${rates.localToUsd.toFixed(4)} USDC`,
      }
    } else {
      const btc = amount * rates.localToBtc
      return {
        value: btc.toFixed(8),
        suffix: 'cirBTC',
        rate: `1 ${currency} ≈ ${rates.localToBtc.toFixed(10)} BTC`,
      }
    }
  }

  const quote = formatQuote()

  if (loading) {
    return (
      <div
        className="rounded-2xl px-4 py-3"
        style={{ background: 'var(--surface-muted)' }}
      >
        <div className="flex items-center gap-2 animate-pulse">
          <RefreshCw className="size-3.5 animate-spin" style={{ color: 'var(--subtle)' }} />
          <span className="text-xs" style={{ color: 'var(--subtle)' }}>
            Fetching live rates...
          </span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div
        className="rounded-2xl px-4 py-3"
        style={{ background: 'rgba(192,41,63,0.06)' }}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs" style={{ color: 'var(--danger)' }}>
            Rate unavailable: {error}
          </span>
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="rounded-lg p-1 hover:bg-black/5"
            >
              <RefreshCw className="size-3" style={{ color: 'var(--muted)' }} />
            </button>
          )}
        </div>
      </div>
    )
  }

  if (!quote || !valid) {
    return (
      <div
        className="rounded-2xl px-4 py-3"
        style={{ background: 'var(--surface-muted)' }}
      >
        <span className="text-xs" style={{ color: 'var(--subtle)' }}>
          {rates ? `Enter an amount to see ${asset} equivalent` : 'Rates not yet loaded'}
        </span>
      </div>
    )
  }

  return (
    <div
      className="rounded-2xl px-4 py-3"
      style={{ background: 'var(--surface-muted)' }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-1.5">
          <span className="display text-xl font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
            {quote.value}
          </span>
          <span className="text-sm font-medium" style={{ color: 'var(--muted)' }}>
            {quote.suffix}
          </span>
        </div>
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="rounded-lg p-1 hover:bg-black/5 transition-all"
            title="Refresh rates"
          >
            <RefreshCw className="size-3.5" style={{ color: 'var(--subtle)' }} />
          </button>
        )}
      </div>
      <div className="mt-1.5 flex items-center justify-between">
        <span className="text-xs" style={{ color: 'var(--subtle)' }}>
          {quote.rate}
        </span>
        {lastFetched && (
          <span className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--subtle)' }}>
            <Clock className="size-2.5" />
            {relativeTime(lastFetched)}
          </span>
        )}
      </div>
    </div>
  )
}
