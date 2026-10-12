/**
 * useConnectedEns
 * Automatically resolves the connected wallet's ENS profile via the
 * ensideas.com public HTTP API — no wagmi ENS hooks, no mainnet RPC required.
 *
 * Returns: displayName, avatar, primary .eth name, and text records.
 * Clears automatically when the wallet disconnects.
 */

import { useState, useEffect, useRef } from 'react'

export interface ConnectedEnsProfile {
  address: string
  name: string | null          // primary .eth name, null if none
  displayName: string          // name or truncated address
  avatar: string | null
  records: {
    'com.twitter'?: string
    'com.github'?: string
    'email'?: string
    'url'?: string
    'description'?: string
    [key: string]: string | undefined
  } | null
}

interface EnsIdeasResponse {
  address: string
  name: string | null
  displayName: string
  avatar: string | null
  records?: Record<string, string | undefined>
}

export function useConnectedEns(address: `0x${string}` | undefined) {
  const [profile, setProfile] = useState<ConnectedEnsProfile | null>(null)
  const [loading, setLoading] = useState(false)
  const lastAddressRef = useRef<string | undefined>(undefined)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!address) {
      setProfile(null)
      setLoading(false)
      return
    }

    // Same address — don't re-fetch
    if (lastAddressRef.current === address) return

    lastAddressRef.current = address
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setLoading(true)

    fetch(`https://api.ensideas.com/ens/resolve/${address}`, { signal: ctrl.signal })
      .then(r => r.ok ? r.json() as Promise<EnsIdeasResponse> : null)
      .then(data => {
        if (!data) { setProfile(null); return }
        setProfile({
          address: data.address,
          name: data.name,
          displayName: data.displayName,
          avatar: data.avatar,
          records: data.records ?? null,
        })
      })
      .catch((err: unknown) => {
        if ((err as { name?: string }).name === 'AbortError') return
        setProfile(null)
      })
      .finally(() => {
        setLoading(false)
      })

    return () => { ctrl.abort() }
  }, [address])

  return { profile, loading }
}
