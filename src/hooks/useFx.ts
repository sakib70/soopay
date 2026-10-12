/**
 * FX hook — fetches live exchange rates from the /api/fx proxy.
 * The API key is NEVER exposed to the browser; it lives server-side only.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import type { CurrencyCode } from '@/lib/constants'

export interface FxRates {
  /** Rate: 1 local unit = X USD */
  localToUsd: number
  /** Rate: 1 local unit = X BTC */
  localToBtc: number
  /** Rate: 1 USD = X local */
  usdToLocal: number
  /** Rate: 1 BTC = X USD */
  btcToUsd: number
  timestamp: number
}

export interface FxState {
  rates: FxRates | null
  loading: boolean
  error: string | null
  lastFetched: number | null
  refresh: () => void
}

const CACHE_TTL_MS = 60_000 // 1 minute cache

const cache = new Map<string, { rates: FxRates; at: number }>()

export function useFx(currency: CurrencyCode): FxState {
  const [rates, setRates] = useState<FxRates | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastFetched, setLastFetched] = useState<number | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const fetchRates = useCallback(() => {
    const now = Date.now()
    const cached = cache.get(currency)
    if (cached && now - cached.at < CACHE_TTL_MS) {
      setRates(cached.rates)
      setLastFetched(cached.at)
      setError(null)
      return
    }

    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setLoading(true)
    setError(null)

    fetch(`/api/fx?currency=${encodeURIComponent(currency)}`, {
      signal: ctrl.signal,
    })
      .then((res) => {
        if (!res.ok) {
          return res.json()
            .catch(() => ({ error: `HTTP ${res.status}` }))
            .then((body: { error?: string }) => {
              throw new Error(body.error ?? `HTTP ${res.status}`)
            })
        }
        return res.json() as Promise<FxRates>
      })
      .then((data: FxRates) => {
        const at = Date.now()
        cache.set(currency, { rates: data, at })
        setRates(data)
        setLastFetched(at)
      })
      .catch((err: unknown) => {
        if ((err as { name?: string }).name === 'AbortError') return
        const msg = err instanceof Error ? err.message : 'Failed to fetch rates'
        setError(msg)
      })
      .finally(() => {
        setLoading(false)
      })
  }, [currency])

  // eslint-disable-next-line react/set-state-in-effect -- intentional: syncing state with external FX API
  useEffect(() => {
    fetchRates()
    const interval = setInterval(fetchRates, CACHE_TTL_MS)
    return () => {
      clearInterval(interval)
      abortRef.current?.abort()
    }
  }, [fetchRates])

  return { rates, loading, error, lastFetched, refresh: fetchRates }
}

/**
 * Convert a local currency amount to USDC raw bigint (6 decimals).
 * Uses exact integer arithmetic — no float accumulated error on the final bigint.
 */
export function localToUsdcRaw(localAmount: string, localToUsd: number): bigint {
  if (!localAmount || localToUsd <= 0) return 0n
  const num = parseFloat(localAmount)
  if (!isFinite(num) || num <= 0) return 0n
  // USDC = localAmount * localToUsd, scaled to 6 decimals
  const usdcFloat = num * localToUsd
  return BigInt(Math.round(usdcFloat * 1_000_000))
}

/**
 * Convert a local currency amount to cirBTC raw bigint (variable decimals).
 * localToBtc = 1 local unit in BTC
 */
export function localToCirBtcRaw(localAmount: string, localToBtc: number, decimals: number): bigint {
  if (!localAmount || localToBtc <= 0) return 0n
  const num = parseFloat(localAmount)
  if (!isFinite(num) || num <= 0) return 0n
  const btcFloat = num * localToBtc
  return BigInt(Math.round(btcFloat * 10 ** decimals))
}
