/**
 * FX API server — serves live exchange rates via /api/fx
 * The EXCHANGE_RATE_API_KEY never leaves the server.
 *
 * Primary: https://v6.exchangerate-api.com/v6/{key}/latest/USD
 * Fallback: open.er-api.com (no key)
 * BTC price: CoinGecko free API
 */

import { serve } from 'bun'

interface RatesCache {
  usdRates: Record<string, number>
  btcUsd: number
  fetchedAt: number
}

let cache: RatesCache | null = null
const CACHE_TTL = 60_000 // 1 minute

async function fetchUsdRates(): Promise<Record<string, number>> {
  const apiKey = process.env.EXCHANGE_RATE_API_KEY

  if (apiKey) {
    try {
      const url = `https://v6.exchangerate-api.com/v6/${apiKey}/latest/USD`
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
      if (res.ok) {
        const data = await res.json() as { conversion_rates?: Record<string, number>; result?: string }
        if (data.result === 'success' && data.conversion_rates) {
          console.log('[fx] rates loaded from exchangerate-api.com')
          return data.conversion_rates
        }
      } else {
        console.warn(`[fx] exchangerate-api.com responded ${res.status}`)
      }
    } catch (e) {
      console.warn('[fx] exchangerate-api.com failed:', (e as Error).message)
    }
  }

  // Fallback: open.er-api.com
  console.log('[fx] falling back to open.er-api.com')
  const res = await fetch('https://open.er-api.com/v6/latest/USD', {
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`ER API HTTP ${res.status}`)
  const data = await res.json() as { rates: Record<string, number> }
  return data.rates
}

async function fetchBtcUsd(): Promise<number> {
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd',
      { signal: AbortSignal.timeout(8000) },
    )
    if (res.ok) {
      const data = await res.json() as { bitcoin?: { usd?: number } }
      if (data.bitcoin?.usd) return data.bitcoin.usd
    }
  } catch {
    console.warn('[fx] CoinGecko BTC price failed')
  }
  // Fallback BTC price if CoinGecko is down
  return 65_000
}

async function getRates(): Promise<RatesCache> {
  const now = Date.now()
  if (cache && now - cache.fetchedAt < CACHE_TTL) return cache
  const [usdRates, btcUsd] = await Promise.all([fetchUsdRates(), fetchBtcUsd()])
  cache = { usdRates, btcUsd, fetchedAt: now }
  return cache
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const server = serve({
  port: 3001,
  async fetch(req) {
    const url = new URL(req.url)

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    }

    if (url.pathname === '/api/fx') {
      const currency = url.searchParams.get('currency')?.toUpperCase() ?? 'USD'

      try {
        const { usdRates, btcUsd, fetchedAt } = await getRates()

        const usdToLocal = usdRates[currency] ?? 1
        const localToUsd = usdToLocal > 0 ? 1 / usdToLocal : 1
        const localToBtc = btcUsd > 0 ? localToUsd / btcUsd : 0

        return new Response(
          JSON.stringify({ localToUsd, localToBtc, usdToLocal, btcToUsd: btcUsd, timestamp: fetchedAt }),
          {
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'public, max-age=60',
              ...CORS_HEADERS,
            },
          },
        )
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Rate fetch failed'
        console.error('[fx]', msg)
        return new Response(
          JSON.stringify({ error: msg }),
          { status: 503, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
        )
      }
    }

    if (url.pathname === '/health') {
      return new Response('ok', { headers: CORS_HEADERS })
    }

    return new Response('Not found', { status: 404, headers: CORS_HEADERS })
  },
})

console.log(`[fx-server] listening on http://localhost:${server.port}`)
