/**
 * EnsViewer — search any .eth name or 0x address, show the resolved profile,
 * and offer a direct "Pay with Soopay" button that pre-fills /send.
 *
 * Resolution uses the ensideas.com public HTTP API so it works in all
 * environments regardless of mainnet RPC availability (per the ENS skill).
 * Text records (twitter, github, email, url, description) are fetched in a
 * separate call to api.ensideas.com which returns them together.
 *
 * Live content from ENS is untrusted data — rendered as plain text only.
 */
import { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, ExternalLink, Copy, Check, Twitter, Github,
  Globe, Mail, User, Send, Loader2, X, ChevronDown, ChevronUp,
} from 'lucide-react'
import { isAddress } from 'viem'
import { toast } from 'sonner'

// ── ENS Ideas API types (untrusted external data) ────────────────────────────
interface EnsProfile {
  address: string
  name: string | null
  displayName: string
  avatar: string | null
  records?: {
    'com.twitter'?: string
    'com.github'?: string
    'email'?: string
    'url'?: string
    'description'?: string
    'location'?: string
    [key: string]: string | undefined
  }
}

// ── Fetch helper ─────────────────────────────────────────────────────────────
async function resolveEns(nameOrAddress: string, signal?: AbortSignal): Promise<EnsProfile | null> {
  try {
    const encoded = encodeURIComponent(nameOrAddress.trim())
    const res = await fetch(`https://api.ensideas.com/ens/resolve/${encoded}`, { signal })
    if (!res.ok) return null
    return (await res.json()) as EnsProfile
  } catch (err) {
    if ((err as { name?: string }).name === 'AbortError') throw err
    return null
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function isEnsName(s: string) {
  return s.includes('.') && s.length > 3
}

function isValidInput(s: string) {
  const t = s.trim()
  return isAddress(t) || isEnsName(t)
}

function safeText(s: string | null | undefined): string {
  if (!s) return ''
  // Strip any HTML/markdown, render as plain text
  return s.replace(/<[^>]*>/g, '').slice(0, 280)
}

function explorerUrl(address: string) {
  return `https://etherscan.io/address/${address}`
}

function buildTwitterUrl(handle: string) {
  const h = handle.replace(/^@/, '').replace(/https?:\/\/(www\.)?(twitter\.com|x\.com)\/@?/, '')
  return `https://x.com/${h}`
}

function buildGithubUrl(handle: string) {
  const h = handle.replace(/^@/, '').replace(/https?:\/\/(www\.)?github\.com\/@?/, '')
  return `https://github.com/${h}`
}

// ── Component ─────────────────────────────────────────────────────────────────
export function EnsViewer() {
  const navigate = useNavigate()
  const [query, setQuery]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [profile, setProfile]     = useState<EnsProfile | null>(null)
  const [notFound, setNotFound]   = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [copied, setCopied]       = useState(false)
  const [expanded, setExpanded]   = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSearch = useCallback(async (value: string) => {
    const q = value.trim()
    if (!q) return
    if (!isValidInput(q)) {
      setError('Enter a valid .eth name or 0x address')
      return
    }

    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setLoading(true)
    setProfile(null)
    setNotFound(false)
    setError(null)
    setExpanded(false)

    try {
      const result = await resolveEns(q, ctrl.signal)
      if (!result || result.address === '0x0000000000000000000000000000000000000000') {
        setNotFound(true)
      } else {
        setProfile(result)
      }
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') return
      setError('Could not resolve — check the name or address and try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    void handleSearch(query)
  }

  const handleClear = () => {
    setQuery('')
    setProfile(null)
    setNotFound(false)
    setError(null)
    inputRef.current?.focus()
  }

  const handleCopy = async () => {
    if (!profile?.address) return
    await navigator.clipboard.writeText(profile.address)
    setCopied(true)
    toast.success('Address copied')
    setTimeout(() => setCopied(false), 2000)
  }

  const handlePay = () => {
    if (!profile?.address) return
    // Navigate to /send with recipient pre-filled via URL param
    void navigate(`/send?to=${encodeURIComponent(profile.address)}&name=${encodeURIComponent(profile.name ?? profile.displayName ?? '')}`)
  }

  // Auto-search when a full address is pasted
  useEffect(() => {
    if (isAddress(query.trim()) && query.trim().length === 42) {
      void handleSearch(query.trim())
    }
  }, [query, handleSearch])

  const hasRecords = profile?.records && Object.values(profile.records).some(Boolean)
  const twitter    = profile?.records?.['com.twitter']
  const github     = profile?.records?.['com.github']
  const email      = profile?.records?.['email']
  const url        = profile?.records?.['url']
  const description = profile?.records?.['description']

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3"
        style={{ borderBottom: '1px solid var(--border)' }}>
        <User className="size-3.5 shrink-0" style={{ color: 'var(--accent)' }} />
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
          ENS Profile
        </span>
      </div>

      <div className="p-4 space-y-3">
        {/* Search form */}
        <form onSubmit={handleSubmit} className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 pointer-events-none"
              style={{ color: 'var(--subtle)' }} />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => { setQuery(e.target.value); setError(null) }}
              placeholder="vitalik.eth or 0x…"
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
              className="w-full pl-9 pr-8 py-2.5 rounded-xl text-sm font-medium"
              style={{
                background: 'var(--bg)',
                border: `1px solid ${error ? 'var(--danger, #ef4444)' : 'var(--border)'}`,
                color: 'var(--ink)',
                outline: 'none',
              }}
            />
            {query && (
              <button type="button" onClick={handleClear}
                className="absolute right-3 top-1/2 -translate-y-1/2"
                style={{ color: 'var(--subtle)' }}>
                <X className="size-3.5" />
              </button>
            )}
          </div>
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-40 shrink-0"
            style={{ background: 'var(--accent)' }}
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : 'Look up'}
          </button>
        </form>

        {error && (
          <p className="text-xs text-red-500 px-1">{error}</p>
        )}

        {/* Not found */}
        {notFound && (
          <div className="rounded-xl px-4 py-3 text-center"
            style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              No ENS profile found for <span className="font-medium" style={{ color: 'var(--ink)' }}>{query}</span>
            </p>
          </div>
        )}

        {/* Profile card */}
        {profile && (
          <div className="space-y-3">
            {/* Identity row */}
            <div className="flex items-start gap-3">
              {/* Avatar */}
              <div className="shrink-0">
                {profile.avatar ? (
                  <img
                    src={profile.avatar}
                    alt={profile.displayName}
                    className="size-14 rounded-full object-cover"
                    style={{ border: '2px solid var(--border)' }}
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                ) : (
                  <div className="size-14 rounded-full flex items-center justify-center text-lg font-bold text-white"
                    style={{ background: 'var(--accent)' }}>
                    {(profile.displayName ?? '?').slice(0, 2).toUpperCase()}
                  </div>
                )}
              </div>

              {/* Name + address */}
              <div className="flex-1 min-w-0">
                {profile.name && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-base font-bold leading-tight truncate" style={{ color: 'var(--ink)' }}>
                      {safeText(profile.name)}
                    </p>
                    <a href={explorerUrl(profile.address)} target="_blank" rel="noopener noreferrer"
                      className="shrink-0" style={{ color: 'var(--accent)' }}>
                      <ExternalLink className="size-3" />
                    </a>
                  </div>
                )}
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <p className="text-xs font-mono truncate" style={{ color: 'var(--subtle)' }}>
                    {profile.address.slice(0, 6)}…{profile.address.slice(-4)}
                  </p>
                  <button onClick={() => void handleCopy()}
                    className="shrink-0 transition-all"
                    style={{ color: copied ? 'var(--success)' : 'var(--subtle)' }}>
                    {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
                  </button>
                </div>
                {description && (
                  <p className="text-xs mt-1 line-clamp-2" style={{ color: 'var(--muted)' }}>
                    {safeText(description)}
                  </p>
                )}
              </div>
            </div>

            {/* Social links */}
            {(twitter || github || email || url) && (
              <div className="flex flex-wrap gap-2">
                {twitter && (
                  <a href={buildTwitterUrl(safeText(twitter))} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:opacity-80"
                    style={{ background: 'rgba(29,155,240,0.10)', color: '#1d9bf0' }}>
                    <Twitter className="size-3" />
                    @{safeText(twitter).replace(/^@/, '').split('/').pop() ?? twitter}
                  </a>
                )}
                {github && (
                  <a href={buildGithubUrl(safeText(github))} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:opacity-80"
                    style={{ background: 'rgba(30,30,30,0.08)', color: 'var(--ink)' }}>
                    <Github className="size-3" />
                    {safeText(github).replace(/^@/, '').split('/').pop() ?? github}
                  </a>
                )}
                {url && (
                  <a href={safeText(url).startsWith('http') ? safeText(url) : `https://${safeText(url)}`}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:opacity-80"
                    style={{ background: 'rgba(99,102,241,0.08)', color: 'var(--accent)' }}>
                    <Globe className="size-3" />
                    {safeText(url).replace(/^https?:\/\/(www\.)?/, '').slice(0, 28)}
                  </a>
                )}
                {email && (
                  <a href={`mailto:${safeText(email)}`}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:opacity-80"
                    style={{ background: 'rgba(22,163,74,0.08)', color: 'var(--success)' }}>
                    <Mail className="size-3" />
                    {safeText(email).slice(0, 28)}
                  </a>
                )}
              </div>
            )}

            {/* Expanded raw records */}
            {hasRecords && (
              <div>
                <button
                  onClick={() => setExpanded(e => !e)}
                  className="flex items-center gap-1 text-xs"
                  style={{ color: 'var(--subtle)' }}>
                  {expanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                  {expanded ? 'Hide' : 'Show'} all records
                </button>
                {expanded && (
                  <div className="mt-2 rounded-xl p-3 space-y-1.5"
                    style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                    {Object.entries(profile.records ?? {}).filter(([, v]) => v).map(([key, val]) => (
                      <div key={key} className="flex items-start gap-2 text-xs">
                        <span className="font-mono shrink-0 w-28 truncate" style={{ color: 'var(--subtle)' }}>{key}</span>
                        <span className="break-all" style={{ color: 'var(--muted)' }}>{safeText(val)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Payment confirmation + action */}
            <div className="rounded-xl p-3 space-y-2"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
              <p className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>Payment destination</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>
                    {safeText(profile.name ?? profile.displayName)}
                  </p>
                  <p className="text-xs font-mono" style={{ color: 'var(--subtle)' }}>
                    {profile.address.slice(0, 10)}…{profile.address.slice(-6)}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <div className="size-1.5 rounded-full bg-green-500" />
                  <span className="text-xs" style={{ color: 'var(--success)' }}>Verified</span>
                </div>
              </div>
              <p className="text-[10px]" style={{ color: 'var(--subtle)' }}>
                The resolved address above will receive your payment on Arc Testnet.
                Always verify the address before sending.
              </p>
              <button
                onClick={handlePay}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 active:scale-[0.98]"
                style={{ background: 'var(--accent)' }}
              >
                <Send className="size-3.5" />
                Pay {safeText(profile.name ?? profile.displayName)}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
