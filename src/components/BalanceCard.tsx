import { Loader2, RefreshCw } from 'lucide-react'
import { formatUsdcAmount, formatCirBtcAmount } from '@/lib/utils'
import type { FxRates } from '@/hooks/useFx'
import type { CurrencyCode } from '@/lib/constants'
import { CURRENCIES, CIRBTC_CONFIGURED } from '@/lib/constants'
import { cn } from '@/lib/utils'

interface BalanceCardProps {
  usdc: bigint | undefined
  usdcLoading: boolean
  cirBtc: bigint | undefined
  cirBtcLoading: boolean
  cirBtcDecimals?: number
  rates: FxRates | null
  currency: CurrencyCode
  isConnected: boolean
  onRefresh?: () => void
  className?: string
}

export function BalanceCard({
  usdc,
  usdcLoading,
  cirBtc,
  cirBtcLoading,
  cirBtcDecimals = 8,
  rates,
  currency,
  isConnected,
  onRefresh,
  className,
}: BalanceCardProps) {
  const currencyInfo = CURRENCIES.find((c) => c.code === currency)!

  const usdcDisplay = usdc !== undefined ? formatUsdcAmount(usdc) : null
  const cirBtcDisplay = cirBtc !== undefined && CIRBTC_CONFIGURED ? formatCirBtcAmount(cirBtc, cirBtcDecimals) : null

  // Local currency equivalents
  const usdcLocalEquiv =
    usdcDisplay && rates
      ? ((parseFloat(usdcDisplay) * rates.usdToLocal)).toFixed(2)
      : null

  const cirBtcLocalEquiv =
    cirBtcDisplay && rates && rates.btcToUsd
      ? (parseFloat(cirBtcDisplay) * rates.btcToUsd * rates.usdToLocal).toFixed(2)
      : null

  if (!isConnected) {
    return (
      <div
        className={cn('rounded-3xl p-5', className)}
        style={{
          background: 'var(--surface)',
          backdropFilter: 'blur(20px)',
          border: '1px solid var(--border)',
        }}
      >
        <div className="text-center py-4">
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            Connect your wallet to view balances
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn('rounded-3xl p-5', className)}
      style={{
        background: 'var(--surface)',
        backdropFilter: 'blur(20px)',
        border: '1px solid var(--border)',
      }}
    >
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
          Portfolio
        </span>
        {onRefresh && (
          <button onClick={onRefresh} className="rounded-lg p-1.5 hover:bg-black/5 transition-all">
            <RefreshCw className="size-3.5" style={{ color: 'var(--subtle)' }} />
          </button>
        )}
      </div>

      {/* USDC row */}
      <div className="space-y-3">
        <div
          className="rounded-2xl p-4"
          style={{ background: 'var(--surface-muted)' }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div
                className="size-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
                style={{ background: '#2775CA' }}
              >
                $
              </div>
              <div>
                <div className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>USDC</div>
                <div className="text-[10px]" style={{ color: 'var(--subtle)' }}>Arc Testnet</div>
              </div>
            </div>
            <div className="text-right">
              {usdcLoading ? (
                <Loader2 className="size-4 animate-spin ml-auto" style={{ color: 'var(--subtle)' }} />
              ) : (
                <>
                  <div className="display text-lg font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                    {usdcDisplay ?? '0.00'}
                  </div>
                  {usdcLocalEquiv && (
                    <div className="text-xs tabular-nums" style={{ color: 'var(--subtle)' }}>
                      {currencyInfo.symbol}{usdcLocalEquiv}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* cirBTC row */}
        <div
          className="rounded-2xl p-4"
          style={{
            background: CIRBTC_CONFIGURED ? 'var(--surface-muted)' : 'rgba(15,32,53,0.03)',
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div
                className="size-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
                style={{ background: CIRBTC_CONFIGURED ? '#F7931A' : '#aaa' }}
              >
                ₿
              </div>
              <div>
                <div className="text-xs font-semibold" style={{ color: CIRBTC_CONFIGURED ? 'var(--muted)' : 'var(--subtle)' }}>
                  cirBTC
                </div>
                {CIRBTC_CONFIGURED ? (
                  <div className="text-[10px]" style={{ color: 'var(--subtle)' }}>Circle BTC</div>
                ) : (
                  <div className="text-[10px]" style={{ color: 'var(--warning)' }}>Address not configured</div>
                )}
              </div>
            </div>
            <div className="text-right">
              {!CIRBTC_CONFIGURED ? (
                <span className="text-xs" style={{ color: 'var(--subtle)' }}>—</span>
              ) : cirBtcLoading ? (
                <Loader2 className="size-4 animate-spin ml-auto" style={{ color: 'var(--subtle)' }} />
              ) : (
                <>
                  <div className="display text-lg font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                    {cirBtcDisplay ?? '0.00000000'}
                  </div>
                  {cirBtcLocalEquiv && (
                    <div className="text-xs tabular-nums" style={{ color: 'var(--subtle)' }}>
                      {currencyInfo.symbol}{cirBtcLocalEquiv}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
