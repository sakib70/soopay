/**
 * FxTickerBar — live USDC → local currency rates, auto-scrolling.
 * Shows 1 USDC = X <currency> for every supported currency, refreshes every 60 s.
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import { RefreshCw, TrendingUp } from 'lucide-react'
import { CURRENCIES } from '@/lib/constants'
import type { CurrencyCode } from '@/lib/constants'

interface TickerRate {
  code: CurrencyCode
  symbol: string
  flag: string
  rate: number   // 1 USDC = X local
}

const CACHE_TTL = 60_000

let cachedRates: TickerRate[] | null = null
let cacheAt = 0

async function fetchAllRates(): Promise<TickerRate[]> {
  const now = Date.now()
  if (cachedRates && now - cacheAt < CACHE_TTL) return cachedRates

  // Fetch USD base rates (1 USD = X currency) from our proxy
  // We call /api/fx?currency=USD to get all rates relative to USD.
  // Since USDC ≈ 1 USD, 1 USDC = 1/localToUsd local units per the FX data.
  // We batch by calling for each currency in parallel.
  const results = await Promise.allSettled(
    CURRENCIES.map(async (c) => {
      const res = await fetch(`/api/fx?currency=${c.code}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as { usdToLocal?: number; localToUsd?: number }
      return {
        code: c.code,
        symbol: c.symbol,
        flag: c.flag,
        rate: data.usdToLocal ?? (data.localToUsd ? 1 / data.localToUsd : 0),
      }
    })
  )

  const rates: TickerRate[] = results
    .flatMap(r => r.status === 'fulfilled' ? [r.value] : [])

  if (rates.length > 0) {
    cachedRates = rates
    cacheAt = Date.now()
  }
  return rates.length > 0 ? rates : (cachedRates ?? [])
}

// Format rate nicely: round to 0 or 2 decimal places depending on magnitude
function formatRate(rate: number, code: string): string {
  if (rate === 0) return '—'
  // High-value currencies (IDR, VND) show as integers
  if (rate >= 1000) return rate.toLocaleString('en-US', { maximumFractionDigits: 0 })
  if (rate >= 1)    return rate.toFixed(2)
  return rate.toFixed(4)
}

export function FxTickerBar() {
  const [rates, setRates]     = useState<TickerRate[]>([])
  const [loading, setLoading] = useState(false)
  const [lastAt, setLastAt]   = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const animRef = useRef<number | null>(null)
  const posRef = useRef(0)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetchAllRates()
      setRates(r)
      setLastAt(Date.now())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const id = setInterval(() => void load(), CACHE_TTL)
    return () => clearInterval(id)
  }, [load])

  // Smooth auto-scroll
  useEffect(() => {
    const el = containerRef.current
    if (!el || rates.length === 0) return

    const speed = 0.4 // px per frame

    const tick = () => {
      posRef.current += speed
      const maxScroll = el.scrollWidth / 2 // we duplicate the list
      if (posRef.current >= maxScroll) posRef.current = 0
      el.scrollLeft = posRef.current
      animRef.current = requestAnimationFrame(tick)
    }

    animRef.current = requestAnimationFrame(tick)
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }
  }, [rates])

  // Pause scroll on hover
  const pauseScroll = () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  const resumeScroll = () => {
    const el = containerRef.current
    if (!el) return
    const speed = 0.4
    const tick = () => {
      posRef.current += speed
      const maxScroll = el.scrollWidth / 2
      if (posRef.current >= maxScroll) posRef.current = 0
      el.scrollLeft = posRef.current
      animRef.current = requestAnimationFrame(tick)
    }
    animRef.current = requestAnimationFrame(tick)
  }

  const items = [...rates, ...rates] // duplicate for seamless loop

  const timeAgo = lastAt ? Math.round((Date.now() - lastAt) / 1000) : null

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      {/* Header row */}
      <div className="flex items-center justify-between px-4 py-2.5"
        style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2">
          <TrendingUp className="size-3.5" style={{ color: 'var(--accent)' }} />
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
            1 USDC =
          </span>
        </div>
        <div className="flex items-center gap-2">
          {timeAgo !== null && (
            <span className="text-[10px]" style={{ color: 'var(--subtle)' }}>
              {timeAgo < 5 ? 'just now' : `${timeAgo}s ago`}
            </span>
          )}
          <button
            onClick={() => void load()}
            disabled={loading}
            className="p-1 rounded-lg transition-all hover:bg-black/5 disabled:opacity-40"
            title="Refresh rates"
          >
            <RefreshCw className={`size-3 ${loading ? 'animate-spin' : ''}`} style={{ color: 'var(--subtle)' }} />
          </button>
        </div>
      </div>

      {/* Scrolling ticker */}
      <div
        ref={containerRef}
        onMouseEnter={pauseScroll}
        onMouseLeave={resumeScroll}
        onTouchStart={pauseScroll}
        onTouchEnd={resumeScroll}
        className="flex overflow-x-hidden select-none py-3 px-4 gap-0"
        style={{ scrollbarWidth: 'none' }}
      >
        {items.length === 0 ? (
          /* Loading skeleton */
          <div className="flex gap-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2 shrink-0">
                <div className="h-4 w-20 rounded bg-black/5 animate-pulse" />
              </div>
            ))}
          </div>
        ) : (
          items.map((r, i) => (
            <div key={`${r.code}-${i}`} className="flex items-center gap-2 shrink-0 pr-8">
              <span className="text-base leading-none" role="img" aria-label={r.code}>
                {getFlagEmoji(r.flag)}
              </span>
              <span className="text-xs font-medium tabular-nums" style={{ color: 'var(--ink)' }}>
                <span className="font-semibold">{r.code}</span>
                {' '}
                <span style={{ color: 'var(--muted)' }}>{r.symbol}{formatRate(r.rate, r.code)}</span>
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function getFlagEmoji(countryCode: string): string {
  if (countryCode === 'EU') return '🇪🇺'
  const codePoints = [...countryCode.toUpperCase()].map(
    c => 0x1F1E6 - 65 + c.charCodeAt(0)
  )
  return String.fromCodePoint(...codePoints)
}
