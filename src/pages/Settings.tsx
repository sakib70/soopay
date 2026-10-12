import { useAccount, useDisconnect } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { Copy, Check, ExternalLink, LogOut, Mail, Eye, EyeOff, Trash2, ShieldCheck } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { CurrencySelector } from '@/components/CurrencySelector'
import { useCurrency } from '@/hooks/useCurrency'
import {
  ARC_TESTNET_CHAIN_ID, USDC_ADDRESS, CIRBTC_ADDRESS, CURRENCIES,
} from '@/lib/constants'
import { copyToClipboard, buildArcScanAddressUrl } from '@/lib/utils'

interface ResendStatus {
  hasKey: boolean
  source: 'user' | 'env' | 'none'
  hint: string | null
}

export function Settings() {
  const { address, isConnected, chainId } = useAccount()
  const { disconnect } = useDisconnect()
  const { currency, changeCurrency } = useCurrency()
  const [copied, setCopied] = useState(false)

  // SooAgent Resend key state
  const [resendStatus, setResendStatus]   = useState<ResendStatus | null>(null)
  const [resendKey, setResendKey]         = useState('')
  const [showKey, setShowKey]             = useState(false)
  const [savingKey, setSavingKey]         = useState(false)
  const [deletingKey, setDeletingKey]     = useState(false)
  const hasFetchedStatus                  = useRef(false)

  useEffect(() => {
    if (hasFetchedStatus.current) return
    hasFetchedStatus.current = true
    fetch('/api/agent/resend-status')
      .then(r => r.json())
      .then((d: unknown) => { if (d && typeof d === 'object') setResendStatus(d as ResendStatus) })
      .catch(() => null)
  }, [])

  const handleSaveKey = () => {
    const key = resendKey.trim()
    if (!key) { toast.error('Paste your Resend API key first'); return }
    if (!key.startsWith('re_')) { toast.error('Resend keys start with re_'); return }
    setSavingKey(true)
    fetch('/api/agent/resend-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    })
      .then(r => r.json())
      .then((d: unknown) => {
        const res = d as { ok?: boolean; error?: string; hint?: string; source?: string }
        if (res.ok) {
          toast.success('Resend key saved — SooAgent will use it for all emails')
          setResendStatus({ hasKey: true, source: 'user', hint: res.hint ?? null })
          setResendKey('')
          setShowKey(false)
        } else {
          toast.error(res.error ?? 'Failed to save key')
        }
      })
      .catch(() => toast.error('Could not reach SooAgent server'))
      .finally(() => setSavingKey(false))
  }

  const handleDeleteKey = () => {
    if (!confirm('Remove your saved Resend API key? SooAgent will stop sending emails.')) return
    setDeletingKey(true)
    fetch('/api/agent/resend-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete' }),
    })
      .then(() => {
        toast.success('Resend key removed')
        setResendStatus(prev => prev ? { ...prev, hasKey: false, source: 'none', hint: null } : null)
      })
      .catch(() => toast.error('Could not reach SooAgent server'))
      .finally(() => setDeletingKey(false))
  }

  const handleCopyAddress = () => {
    if (!address) return
    copyToClipboard(address).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      toast.success('Address copied')
    }).catch(() => undefined)
  }

  const onArc = chainId === ARC_TESTNET_CHAIN_ID
  const currencyInfo = CURRENCIES.find((c) => c.code === currency)!

  return (
    <div className="max-w-lg mx-auto px-4 py-6 pb-28 md:pb-6 space-y-5">
      <div>
        <h2 className="display text-2xl font-bold" style={{ color: 'var(--ink)' }}>Settings</h2>
        <p className="text-sm mt-0.5" style={{ color: 'var(--subtle)' }}>Preferences and account</p>
      </div>

      {/* Wallet */}
      <div
        className="rounded-2xl p-4 space-y-3"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <h3 className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
          Wallet
        </h3>

        {isConnected ? (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: 'var(--muted)' }}>Address</span>
              <div className="flex items-center gap-1.5">
                <span className="mono text-xs" style={{ color: 'var(--ink)' }}>{address?.slice(0, 10)}...{address?.slice(-6)}</span>
                <button onClick={handleCopyAddress} className="p-1 rounded hover:bg-black/5 transition-all">
                  {copied
                    ? <Check className="size-3.5" style={{ color: 'var(--success)' }} />
                    : <Copy className="size-3.5" style={{ color: 'var(--subtle)' }} />
                  }
                </button>
                <a
                  href={buildArcScanAddressUrl(address!)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1 rounded hover:bg-black/5 transition-all"
                >
                  <ExternalLink className="size-3.5" style={{ color: 'var(--subtle)' }} />
                </a>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: 'var(--muted)' }}>Network</span>
              <span
                className="text-xs font-medium rounded-full px-2.5 py-0.5"
                style={{
                  background: onArc ? 'rgba(22,120,74,0.10)' : 'rgba(192,41,63,0.10)',
                  color: onArc ? 'var(--success)' : 'var(--danger)',
                }}
              >
                {onArc ? 'Arc Testnet' : `Chain ${chainId}`}
              </span>
            </div>

            <button
              onClick={() => disconnect()}
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-all hover:bg-black/5 w-full"
              style={{ color: 'var(--danger)' }}
            >
              <LogOut className="size-4" />
              Disconnect wallet
            </button>
          </div>
        ) : (
          <ConnectKitButton.Custom>
            {({ show }) => (
              <button
                onClick={show}
                className="w-full rounded-xl py-2.5 text-sm font-semibold text-white transition-all hover:scale-[1.01]"
                style={{ background: 'var(--accent)' }}
              >
                Connect Wallet
              </button>
            )}
          </ConnectKitButton.Custom>
        )}
      </div>

      {/* Display currency */}
      <div
        className="rounded-2xl p-4"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <h3 className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--muted)' }}>
          Display Currency
        </h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
              {currencyInfo.symbol} {currencyInfo.name}
            </p>
            <p className="text-xs" style={{ color: 'var(--subtle)' }}>
              Used for FX quotes and display
            </p>
          </div>
          <CurrencySelector value={currency} onChange={changeCurrency} />
        </div>
      </div>

      {/* Network info */}
      <div
        className="rounded-2xl p-4 space-y-2.5"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <h3 className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--muted)' }}>
          Network
        </h3>
        {[
          { label: 'Network', value: 'Arc Testnet' },
          { label: 'Chain ID', value: String(ARC_TESTNET_CHAIN_ID) },
          { label: 'USDC', value: `${USDC_ADDRESS.slice(0, 10)}...`, mono: true },
          { label: 'cirBTC', value: `${CIRBTC_ADDRESS.slice(0, 10)}...`, mono: true },
          { label: 'Gas token', value: 'USDC (native)' },
        ].map(({ label, value, mono }) => (
          <div key={label} className="flex items-center justify-between text-sm">
            <span style={{ color: 'var(--subtle)' }}>{label}</span>
            <span className={`font-medium ${mono ? 'mono text-xs' : ''}`} style={{ color: 'var(--ink)' }}>
              {value}
            </span>
          </div>
        ))}
      </div>

      {/* SooAgent Email */}
      <div
        className="rounded-2xl p-4 space-y-3"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <div className="flex items-center gap-2">
          <Mail className="size-4" style={{ color: 'var(--accent)' }} />
          <h3 className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
            SooAgent Email (Resend)
          </h3>
        </div>

        {/* Current key status */}
        {resendStatus && (
          <div
            className="flex items-center justify-between rounded-xl px-3 py-2.5 text-sm"
            style={{
              background: resendStatus.hasKey ? 'rgba(22,120,74,0.08)' : 'rgba(0,0,0,0.04)',
              border: `1px solid ${resendStatus.hasKey ? 'rgba(22,120,74,0.2)' : 'var(--border)'}`,
            }}
          >
            <div className="flex items-center gap-2">
              {resendStatus.hasKey
                ? <ShieldCheck className="size-4" style={{ color: 'var(--success)' }} />
                : <Mail className="size-4" style={{ color: 'var(--subtle)' }} />
              }
              <div>
                <p className="font-medium text-xs" style={{ color: resendStatus.hasKey ? 'var(--success)' : 'var(--ink)' }}>
                  {resendStatus.hasKey ? 'Key active' : 'No key saved'}
                </p>
                {resendStatus.hint && (
                  <p className="mono text-[10px]" style={{ color: 'var(--subtle)' }}>{resendStatus.hint}</p>
                )}
                {resendStatus.source === 'env' && (
                  <p className="text-[10px]" style={{ color: 'var(--subtle)' }}>Using key from environment</p>
                )}
              </div>
            </div>
            {resendStatus.source === 'user' && (
              <button
                onClick={handleDeleteKey}
                disabled={deletingKey}
                className="p-1.5 rounded-lg hover:bg-black/5 transition-all"
                title="Remove saved key"
              >
                <Trash2 className="size-3.5" style={{ color: 'var(--danger)' }} />
              </button>
            )}
          </div>
        )}

        {/* Key input */}
        <div className="space-y-2">
          <label className="text-xs font-medium" style={{ color: 'var(--muted)' }}>
            Paste Resend API key
          </label>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={resendKey}
              onChange={e => setResendKey(e.target.value)}
              placeholder="re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              className="w-full rounded-xl px-3 py-2.5 text-sm mono pr-10 outline-none"
              style={{
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                color: 'var(--ink)',
              }}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveKey() }}
            />
            <button
              type="button"
              onClick={() => setShowKey(v => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5"
              style={{ color: 'var(--subtle)' }}
            >
              {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          <button
            onClick={handleSaveKey}
            disabled={savingKey || !resendKey.trim()}
            className="w-full rounded-xl py-2.5 text-sm font-semibold text-white transition-all hover:scale-[1.01] disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: 'var(--accent)' }}
          >
            {savingKey ? 'Verifying & saving…' : 'Save Resend key'}
          </button>
        </div>

        <div className="rounded-xl px-3 py-2.5 space-y-1" style={{ background: 'rgba(0,0,0,0.03)' }}>
          <p className="text-xs font-medium" style={{ color: 'var(--ink)' }}>How to get a free Resend key</p>
          <ol className="text-xs space-y-0.5 list-decimal list-inside" style={{ color: 'var(--subtle)' }}>
            <li>Go to <a href="https://resend.com" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: 'var(--accent)' }}>resend.com</a> and create a free account</li>
            <li>Open API Keys → Create API Key</li>
            <li>Copy the key (starts with <span className="mono">re_</span>) and paste it above</li>
          </ol>
          <p className="text-[10px] pt-1" style={{ color: 'var(--subtle)' }}>
            Free plan: 3,000 emails/month. Your key is stored server-side only — never in the browser.
          </p>
        </div>
      </div>

      {/* About */}
      <div
        className="rounded-2xl p-4 space-y-2"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <h3 className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--muted)' }}>
          About
        </h3>
        <p className="text-xs" style={{ color: 'var(--subtle)' }}>
          Soopay is a local-currency-first payment and payroll application built on Arc Network. FX rates are live and fetched server-side. No fiat currency is transferred — only USDC and cirBTC move on-chain.
        </p>
        <a
          href="https://testnet.arcscan.app"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-medium"
          style={{ color: 'var(--accent-hover)' }}
        >
          ArcScan Explorer <ExternalLink className="size-3" />
        </a>
      </div>
    </div>
  )
}
