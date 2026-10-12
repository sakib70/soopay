/**
 * Dashboard — Soopay home screen.
 *
 * Sections (top → bottom):
 *   1. FX Ticker Bar  — live 1 USDC = X [all currencies], scrolling
 *   2. Wallet card    — ENS avatar + name + records for the connected wallet
 *   3. Quick actions  — Send / Bridge / Payroll / History
 *   4. Portfolio      — USDC + cirBTC balances with local-currency equivalents
 *   5. ENS Lookup     — search any .eth name or address
 *   6. Activity       — last 10 confirmed on-chain transactions with filter pills
 */

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Send, ArrowLeftRight, Users, Activity, Settings, ExternalLink,
  Copy, Check, Twitter, Github, Globe, Mail, RefreshCw,
  ArrowUpRight, ArrowDownLeft, Repeat2, Briefcase, Loader2,
} from 'lucide-react'
import { useAccount } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { toast } from 'sonner'

import { BalanceCard }       from '@/components/BalanceCard'
import { FxTickerBar }       from '@/components/FxTickerBar'
import { EnsViewer }         from '@/components/EnsViewer'
import { NetworkBadge }      from '@/components/NetworkBadge'
import { useBalances }       from '@/hooks/useBalances'
import { useFx }             from '@/hooks/useFx'
import { useCurrency }       from '@/hooks/useCurrency'
import { useConnectedEns }   from '@/hooks/useConnectedEns'
import { CURRENCIES, ARC_TESTNET_CHAIN_ID } from '@/lib/constants'
import { getActivity, ActivityRecord } from '@/lib/storage'
import {
  formatAddress, buildArcScanTxUrl,
  truncateHash, relativeTime, formatUsdcAmount,
} from '@/lib/utils'

function fmtAmount(raw: string, decimals: number, asset: string): string {
  try {
    const n = Number(BigInt(raw)) / 10 ** decimals
    return `${n.toFixed(decimals === 8 ? 6 : 2)} ${asset}`
  } catch {
    return asset
  }
}

// ── helpers ───────────────────────────────────────────────────────────────────
function safeText(s: string | null | undefined) {
  if (!s) return ''
  return s.replace(/<[^>]*>/g, '').slice(0, 280)
}
function buildTwitterUrl(h: string) {
  const clean = h.replace(/^@/, '').replace(/https?:\/\/(www\.)?(twitter\.com|x\.com)\/@?/, '')
  return `https://x.com/${clean}`
}
function buildGithubUrl(h: string) {
  const clean = h.replace(/^@/, '').replace(/https?:\/\/(www\.)?github\.com\/@?/, '')
  return `https://github.com/${clean}`
}

// ── activity helpers ──────────────────────────────────────────────────────────
type ActivityFilter = 'all' | 'send' | 'bridge' | 'payroll' | 'receive'

const FILTER_LABELS: Record<ActivityFilter, string> = {
  all: 'All', send: 'Send', bridge: 'Bridge', payroll: 'Payroll', receive: 'Receive',
}

function activityIcon(type: ActivityRecord['type']) {
  switch (type) {
    case 'send':    return <ArrowUpRight className="size-3.5" />
    case 'bridge':  return <Repeat2      className="size-3.5" />
    case 'payroll': return <Briefcase    className="size-3.5" />
    default:        return <ArrowDownLeft className="size-3.5" />
  }
}

function activityColor(type: ActivityRecord['type']): string {
  switch (type) {
    case 'send':    return 'var(--danger)'
    case 'bridge':  return 'var(--accent)'
    case 'payroll': return '#7c3aed'
    default:        return 'var(--success)'
  }
}
function activityBg(type: ActivityRecord['type']): string {
  switch (type) {
    case 'send':    return 'rgba(192,41,63,0.08)'
    case 'bridge':  return 'rgba(99,102,241,0.08)'
    case 'payroll': return 'rgba(124,58,237,0.08)'
    default:        return 'rgba(22,120,74,0.08)'
  }
}

// ── quick actions ─────────────────────────────────────────────────────────────
const quickActions = [
  { to: '/send',     label: 'Send',    Icon: Send,           desc: 'Transfer assets' },
  { to: '/bridge',   label: 'Bridge',  Icon: ArrowLeftRight, desc: 'USDC / cirBTC'   },
  { to: '/payroll',  label: 'Payroll', Icon: Users,          desc: 'Pay your team'   },
  { to: '/activity', label: 'History', Icon: Activity,       desc: 'View all'        },
]

// ─────────────────────────────────────────────────────────────────────────────
export function Dashboard() {
  const navigate = useNavigate()
  const { address, isConnected, chainId } = useAccount()
  const { currency }                      = useCurrency()
  const { usdc, usdcLoading, cirBtc, cirBtcLoading, cirBtcDecimals, refetch } = useBalances()
  const { rates }                         = useFx(currency)
  const currencyInfo = CURRENCIES.find(c => c.code === currency)!
  const { profile: ensProfile, loading: ensLoading } = useConnectedEns(address)

  const onArc = chainId === ARC_TESTNET_CHAIN_ID

  // Address copy
  const [copied, setCopied] = useState(false)
  const handleCopyAddress = async () => {
    if (!address) return
    await navigator.clipboard.writeText(address)
    setCopied(true)
    toast.success('Address copied')
    setTimeout(() => setCopied(false), 2000)
  }

  // Activity
  const allActivity = getActivity()
  const [filter, setFilter] = useState<ActivityFilter>('all')
  const filtered = filter === 'all'
    ? allActivity
    : allActivity.filter(a => a.type === filter)
  const counts: Record<ActivityFilter, number> = {
    all:     allActivity.length,
    send:    allActivity.filter(a => a.type === 'send').length,
    bridge:  allActivity.filter(a => a.type === 'bridge').length,
    payroll: allActivity.filter(a => a.type === 'payroll').length,
    receive: allActivity.filter(a => a.type === 'receive').length,
  }

  const ensName    = ensProfile?.name
  const ensAvatar  = ensProfile?.avatar
  const twitter    = ensProfile?.records?.['com.twitter']
  const github     = ensProfile?.records?.['com.github']
  const ensUrl     = ensProfile?.records?.['url']
  const email      = ensProfile?.records?.['email']
  const description = ensProfile?.records?.['description']

  return (
    <div className="max-w-lg mx-auto px-4 py-6 pb-28 md:pb-6 space-y-5">

      {/* ── 1. Live FX Ticker ─────────────────────────────────────────── */}
      <FxTickerBar />

      {/* ── 2. Wallet / ENS Card ──────────────────────────────────────── */}
      {isConnected ? (
        <div
          className="rounded-3xl overflow-hidden"
          style={{ background: 'var(--accent)' }}
        >
          {/* Top: avatar + name + network */}
          <div className="px-5 pt-5 pb-4">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                {/* ENS avatar or initials */}
                <div className="shrink-0 relative">
                  {ensLoading ? (
                    <div className="size-12 rounded-full bg-white/20 animate-pulse" />
                  ) : ensAvatar ? (
                    <img
                      src={ensAvatar}
                      alt={ensName ?? address ?? ''}
                      className="size-12 rounded-full object-cover"
                      style={{ border: '2px solid rgba(255,255,255,0.3)' }}
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                    />
                  ) : (
                    <div className="size-12 rounded-full bg-white/20 flex items-center justify-center">
                      <span className="text-base font-bold text-white">
                        {address ? address.slice(2, 4).toUpperCase() : '??'}
                      </span>
                    </div>
                  )}
                </div>

                {/* Name / address */}
                <div>
                  {ensName ? (
                    <>
                      <p className="text-base font-bold text-white leading-tight">
                        {safeText(ensName)}
                      </p>
                      <button
                        onClick={() => void handleCopyAddress()}
                        className="flex items-center gap-1 mt-0.5"
                      >
                        <span className="text-xs font-mono text-white/60">
                          {formatAddress(address ?? '')}
                        </span>
                        {copied
                          ? <Check className="size-3 text-white/60" />
                          : <Copy className="size-3 text-white/60" />}
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="text-xs font-semibold uppercase tracking-widest text-white/60">
                        Connected wallet
                      </p>
                      <button
                        onClick={() => void handleCopyAddress()}
                        className="flex items-center gap-1.5 mt-0.5"
                      >
                        <span className="display text-base font-bold text-white mono">
                          {formatAddress(address ?? '')}
                        </span>
                        {copied
                          ? <Check className="size-3.5 text-white/70" />
                          : <Copy className="size-3.5 text-white/70" />}
                      </button>
                    </>
                  )}
                </div>
              </div>
              <NetworkBadge />
            </div>

            {/* ENS description */}
            {description && (
              <p className="text-xs text-white/70 mb-3 line-clamp-2">
                {safeText(description)}
              </p>
            )}

            {/* ENS social links */}
            {(twitter || github || ensUrl || email) && (
              <div className="flex flex-wrap gap-2 mb-3">
                {twitter && (
                  <a
                    href={buildTwitterUrl(safeText(twitter))}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-white/10 text-white hover:bg-white/20 transition-all"
                  >
                    <Twitter className="size-2.5" />
                    @{safeText(twitter).replace(/^@/, '').split('/').pop()}
                  </a>
                )}
                {github && (
                  <a
                    href={buildGithubUrl(safeText(github))}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-white/10 text-white hover:bg-white/20 transition-all"
                  >
                    <Github className="size-2.5" />
                    {safeText(github).replace(/^@/, '').split('/').pop()}
                  </a>
                )}
                {ensUrl && (
                  <a
                    href={safeText(ensUrl).startsWith('http') ? safeText(ensUrl) : `https://${safeText(ensUrl)}`}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-white/10 text-white hover:bg-white/20 transition-all"
                  >
                    <Globe className="size-2.5" />
                    {safeText(ensUrl).replace(/^https?:\/\/(www\.)?/, '').slice(0, 20)}
                  </a>
                )}
                {email && (
                  <a
                    href={`mailto:${safeText(email)}`}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-white/10 text-white hover:bg-white/20 transition-all"
                  >
                    <Mail className="size-2.5" />
                    {safeText(email).slice(0, 22)}
                  </a>
                )}
              </div>
            )}

            {/* USDC balance hero */}
            {onArc ? (
              <div>
                <p className="text-xs text-white/60 mb-1">USDC Balance</p>
                <div className="flex items-baseline gap-2">
                  {usdcLoading ? (
                    <div className="h-9 w-32 rounded-lg bg-white/10 animate-pulse" />
                  ) : (
                    <>
                      <span className="display text-4xl font-bold tabular-nums text-white">
                        {usdc !== undefined ? formatUsdcAmount(usdc) : '—'}
                      </span>
                      <span className="text-lg font-medium text-white/70">USDC</span>
                    </>
                  )}
                </div>
                {usdc !== undefined && rates && (
                  <p className="text-sm text-white/60 mt-1 tabular-nums">
                    ≈ {currencyInfo.symbol}
                    {(parseFloat(formatUsdcAmount(usdc)) * rates.usdToLocal).toFixed(2)} {currency}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-white/70">
                Switch to Arc Testnet to view your balance
              </p>
            )}
          </div>

          {/* Bottom strip: pay button if ENS resolved */}
          {ensName && (
            <div
              className="px-5 py-3 flex items-center justify-between"
              style={{ background: 'rgba(0,0,0,0.15)' }}
            >
              <span className="text-xs text-white/60">
                ENS verified · {ensName}
              </span>
              <button
                onClick={() => void navigate(
                  `/send?to=${encodeURIComponent(address ?? '')}&name=${encodeURIComponent(ensName)}`
                )}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/15 text-white hover:bg-white/25 transition-all"
              >
                <Send className="size-3" />
                Request payment
              </button>
            </div>
          )}
        </div>
      ) : (
        /* ── Not connected ── */
        <div
          className="rounded-3xl p-6 text-center"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <p className="display text-xl font-bold mb-1" style={{ color: 'var(--ink)' }}>
            Welcome to Soopay
          </p>
          <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>
            Local-currency-first payments on Arc Network
          </p>
          <ConnectKitButton.Custom>
            {({ show }) => (
              <button
                onClick={show}
                className="rounded-xl px-6 py-3 text-sm font-semibold text-white w-full transition-all hover:scale-[1.01] active:scale-[0.99]"
                style={{ background: 'var(--accent)' }}
              >
                Connect Wallet
              </button>
            )}
          </ConnectKitButton.Custom>
        </div>
      )}

      {/* ── 3. Quick Actions ──────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-2">
        {quickActions.map(({ to, label, Icon }) => (
          <Link
            key={to}
            to={to}
            className="flex flex-col items-center rounded-2xl py-3.5 px-2 gap-2 transition-all hover:scale-[1.02] active:scale-[0.98]"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <div
              className="size-9 rounded-xl flex items-center justify-center"
              style={{ background: 'var(--surface-muted)' }}
            >
              <Icon className="size-4" style={{ color: 'var(--accent)' }} />
            </div>
            <span className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>{label}</span>
          </Link>
        ))}
      </div>

      {/* ── 4. Portfolio ──────────────────────────────────────────────── */}
      <BalanceCard
        usdc={usdc}
        usdcLoading={usdcLoading}
        cirBtc={cirBtc}
        cirBtcLoading={cirBtcLoading}
        cirBtcDecimals={cirBtcDecimals}
        rates={rates}
        currency={currency}
        isConnected={isConnected}
        onRefresh={refetch}
      />

      {/* ── 5. ENS Lookup ─────────────────────────────────────────────── */}
      <EnsViewer />

      {/* ── 6. Activity Tracker ───────────────────────────────────────── */}
      <div
        className="rounded-3xl overflow-hidden"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
            Activity
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={refetch}
              className="p-1 rounded-lg hover:bg-black/5 transition-all"
              title="Refresh balances"
            >
              <RefreshCw className="size-3" style={{ color: 'var(--subtle)' }} />
            </button>
            <Link to="/activity" className="text-xs font-medium" style={{ color: 'var(--accent-hover)' }}>
              View all
            </Link>
          </div>
        </div>

        {/* Filter pills */}
        <div className="flex gap-1.5 px-4 pt-3 pb-1 overflow-x-auto no-scrollbar">
          {(Object.keys(FILTER_LABELS) as ActivityFilter[]).map(f => {
            const count = counts[f]
            if (f !== 'all' && count === 0) return null
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all shrink-0"
                style={{
                  background: filter === f ? 'var(--accent)' : 'var(--surface-muted)',
                  color: filter === f ? '#fff' : 'var(--muted)',
                }}
              >
                {FILTER_LABELS[f]}
                {count > 0 && (
                  <span
                    className="inline-flex items-center justify-center size-4 rounded-full text-[10px] font-bold"
                    style={{
                      background: filter === f ? 'rgba(255,255,255,0.2)' : 'var(--border)',
                      color: filter === f ? '#fff' : 'var(--subtle)',
                    }}
                  >
                    {count > 99 ? '99+' : count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Activity list */}
        <div className="divide-y px-4 pb-2" style={{ borderColor: 'var(--border)' }}>
          {filtered.length === 0 ? (
            <div className="py-8 text-center">
              {ensLoading ? (
                <Loader2 className="size-5 animate-spin mx-auto mb-2" style={{ color: 'var(--subtle)' }} />
              ) : (
                <>
                  <Activity className="size-7 mx-auto mb-2 opacity-20" style={{ color: 'var(--muted)' }} />
                  <p className="text-sm" style={{ color: 'var(--muted)' }}>
                    {filter === 'all' ? 'No transactions yet' : `No ${filter} transactions`}
                  </p>
                </>
              )}
            </div>
          ) : (
            filtered.slice(0, 10).map(item => (
              <div key={item.id} className="flex items-center justify-between py-2.5 gap-3">
                {/* Icon */}
                <div
                  className="size-8 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: activityBg(item.type), color: activityColor(item.type) }}
                >
                  {activityIcon(item.type)}
                </div>

                {/* Label */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold capitalize truncate" style={{ color: 'var(--ink)' }}>
                    {item.type === 'payroll'
                      ? `Payroll · ${item.asset}`
                      : item.type === 'bridge'
                        ? `Bridge · ${item.asset}`
                        : item.type === 'send'
                          ? `Sent ${item.asset}`
                          : `Received ${item.asset}`}
                  </p>
                  <p className="text-[10px] tabular-nums" style={{ color: 'var(--subtle)' }}>
                    {relativeTime(item.timestamp)}
                    {item.to ? ` · ${formatAddress(item.to)}` : ''}
                  </p>
                </div>

                {/* Amount + hash */}
                <div className="text-right shrink-0">
                  <p className="text-xs font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>
                    {fmtAmount(item.amountRaw, item.decimals, item.asset)}
                  </p>
                  <div className="flex items-center justify-end gap-1 mt-0.5">
                    <span className="text-[10px] font-mono" style={{ color: 'var(--subtle)' }}>
                      {truncateHash(item.txHash, 4)}
                    </span>
                    <a
                      href={buildArcScanTxUrl(item.txHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:opacity-70 transition-all"
                    >
                      <ExternalLink className="size-2.5" style={{ color: 'var(--subtle)' }} />
                    </a>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {filtered.length > 10 && (
          <div className="px-4 pb-3">
            <Link
              to="/activity"
              className="block w-full text-center py-2 rounded-xl text-xs font-medium transition-all hover:opacity-80"
              style={{ background: 'var(--surface-muted)', color: 'var(--accent)' }}
            >
              View all {filtered.length} transactions →
            </Link>
          </div>
        )}
      </div>

      {/* ── Settings shortcut ─────────────────────────────────────────── */}
      <Link
        to="/settings"
        className="flex items-center justify-between rounded-2xl px-4 py-3 transition-all hover:bg-black/5"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <div className="flex items-center gap-3">
          <Settings className="size-4" style={{ color: 'var(--muted)' }} />
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>Settings</p>
            <p className="text-xs" style={{ color: 'var(--subtle)' }}>Currency, network, preferences</p>
          </div>
        </div>
        <span className="text-xs" style={{ color: 'var(--subtle)' }}>›</span>
      </Link>
    </div>
  )
}
