/**
 * AgentPage — Soopay Payroll Alert Agent setup UI
 *
 * Lets the employer:
 *  - Configure recipient email, payroll day, alert lead time, timezone
 *  - Enable/disable the agent
 *  - Sync employees to the agent server
 *  - Manually trigger an alert email
 *  - Preview the email HTML
 *  - Register the schedule onchain (SoopayPayrollAgent contract)
 *  - View agent status, last run, next scheduled alert
 */

import { useState, useEffect, useCallback } from 'react'
import {
  Bot, Mail, Calendar, Bell, CheckCircle, AlertCircle,
  Play, RefreshCw, Eye, ToggleLeft, ToggleRight,
  Clock, Users, Zap, ChevronDown, ChevronUp, ExternalLink,
  Info,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { keccak256, toBytes } from 'viem'
import { getEmployees } from '@/lib/storage'
import { PAYROLL_AGENT_CONTRACT, ARC_TESTNET_CHAIN_ID } from '@/lib/constants'
import { buildArcScanTxUrl } from '@/lib/utils'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

interface AgentSchedule {
  enabled: boolean
  recipientEmail: string
  payrollDay: number
  alertDaysBefore: number
  timezone: string
  onchainTxHash?: string
  onchainConfigHash?: string
  updatedAt: number
}

interface AgentStatus {
  lastRunAt: number | null
  lastRunResult: 'success' | 'failed' | 'dry-run' | null
  lastRunError: string | null
  emailsSentTotal: number
  nextAlertDate: string | null
  employeeCount: number
  dryRunMode: boolean
}

const TIMEZONES = [
  { value: 'Asia/Dhaka',     label: 'Dhaka (BDT, UTC+6)' },
  { value: 'Asia/Karachi',   label: 'Karachi (PKT, UTC+5)' },
  { value: 'Asia/Kolkata',   label: 'Mumbai/Delhi (IST, UTC+5:30)' },
  { value: 'Africa/Lagos',   label: 'Lagos (WAT, UTC+1)' },
  { value: 'Asia/Jakarta',   label: 'Jakarta (WIB, UTC+7)' },
  { value: 'Asia/Ho_Chi_Minh', label: 'Ho Chi Minh (ICT, UTC+7)' },
  { value: 'Asia/Bangkok',   label: 'Bangkok (THA, UTC+7)' },
  { value: 'Asia/Manila',    label: 'Manila (PHT, UTC+8)' },
  { value: 'Europe/London',  label: 'London (GMT/BST)' },
  { value: 'America/New_York', label: 'New York (EST/EDT)' },
  { value: 'UTC',            label: 'UTC' },
]

const PAYROLL_AGENT_ABI = [
  {
    type: 'function',
    name: 'register',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'configHash',       type: 'bytes32' },
      { name: 'metadataURI',      type: 'string'  },
      { name: 'payrollDay',       type: 'uint256' },
      { name: 'alertDaysBefore',  type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'isRegistered',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const

// ── Helpers ───────────────────────────────────────────────────────────────────

function relTime(ts: number | null): string {
  if (!ts) return 'Never'
  const diff = Date.now() - ts
  if (diff < 60_000)   return 'Just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return new Date(ts).toLocaleDateString()
}

function buildConfigHash(schedule: Partial<AgentSchedule>): `0x${string}` {
  const payload = JSON.stringify({
    payrollDay:       schedule.payrollDay,
    alertDaysBefore:  schedule.alertDaysBefore,
    timezone:         schedule.timezone,
    version:          '1',
  })
  return keccak256(toBytes(payload))
}

// ── Main component ────────────────────────────────────────────────────────────

export function AgentPage() {
  const { address, chainId, isConnected } = useAccount()

  // ── Form state
  const [email,            setEmail]            = useState('')
  const [payrollDay,       setPayrollDay]        = useState(25)
  const [alertDaysBefore,  setAlertDaysBefore]   = useState(3)
  const [timezone,         setTimezone]          = useState('Asia/Dhaka')
  const [enabled,          setEnabled]           = useState(false)
  const [saving,           setSaving]            = useState(false)
  const [sending,          setSending]           = useState(false)
  const [syncing,          setSyncing]           = useState(false)
  const [status,           setStatus]            = useState<AgentStatus | null>(null)
  const [loadingStatus,    setLoadingStatus]     = useState(true)
  const [showAdvanced,     setShowAdvanced]      = useState(false)
  const [previewOpen,      setPreviewOpen]       = useState(false)
  const [registering,      setRegistering]       = useState(false)

  // ── Onchain write
  const { writeContract, data: writeTxHash, isPending: writePending } = useWriteContract()
  const { isSuccess: writeConfirmed } = useWaitForTransactionReceipt({ hash: writeTxHash })

  const isOnArc = chainId === ARC_TESTNET_CHAIN_ID
  const contractDeployed = true // PAYROLL_AGENT_CONTRACT is deployed on Arc Testnet

  // ── Load schedule + status
  const loadSchedule = useCallback(async () => {
    try {
      const [schedRes, statRes] = await Promise.all([
        fetch('/api/agent/schedule'),
        fetch('/api/agent/status'),
      ])
      if (schedRes.ok) {
        const s = await schedRes.json() as AgentSchedule
        setEmail(s.recipientEmail ?? '')
        setPayrollDay(s.payrollDay ?? 25)
        setAlertDaysBefore(s.alertDaysBefore ?? 3)
        setTimezone(s.timezone ?? 'Asia/Dhaka')
        setEnabled(s.enabled ?? false)
      }
      if (statRes.ok) {
        setStatus(await statRes.json() as AgentStatus)
      }
    } catch {
      // agent server not started yet — show setup instructions
    } finally {
      setLoadingStatus(false)
    }
  }, [])

  useEffect(() => { void loadSchedule() }, [loadSchedule])

  // After onchain registration confirms, update the schedule with the tx hash
  useEffect(() => {
    if (writeConfirmed && writeTxHash) {
      const hash = buildConfigHash({ payrollDay, alertDaysBefore, timezone })
      void fetch('/api/agent/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ onchainTxHash: writeTxHash, onchainConfigHash: hash }),
      }).then(() => {
        toast.success('Onchain registration confirmed')
        setRegistering(false)
        void loadSchedule()
      })
    }
  }, [writeConfirmed, writeTxHash, payrollDay, alertDaysBefore, timezone, loadSchedule])

  // ── Save schedule to agent server
  const handleSave = async () => {
    if (!email || !email.includes('@')) {
      toast.error('Enter a valid email address')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/agent/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientEmail: email, payrollDay, alertDaysBefore, timezone, enabled }),
      })
      if (!res.ok) {
        const { error } = await res.json() as { error: string }
        throw new Error(error)
      }
      toast.success('Schedule saved')
      void loadSchedule()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  // ── Sync employees to agent server
  const handleSyncEmployees = async () => {
    setSyncing(true)
    try {
      const employees = getEmployees()
      const res = await fetch('/api/agent/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(employees),
      })
      if (!res.ok) throw new Error('Sync failed')
      const { count } = await res.json() as { count: number }
      toast.success(`${count} employee${count !== 1 ? 's' : ''} synced to agent`)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSyncing(false)
    }
  }

  // ── Manual send
  const handleSendNow = async () => {
    setSending(true)
    try {
      const res = await fetch('/api/agent/send-now', { method: 'POST' })
      if (!res.ok) {
        const { error } = await res.json() as { error: string }
        throw new Error(error)
      }
      const { result } = await res.json() as { result: string }
      if (result === 'dry-run') {
        toast.success('Email logged (dry-run — set RESEND_API_KEY to send for real)')
      } else {
        toast.success('Payroll alert email sent!')
      }
      void loadSchedule()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSending(false)
    }
  }

  // ── Test email
  const handleTestEmail = async () => {
    setSending(true)
    try {
      const res = await fetch('/api/agent/test-email', { method: 'POST' })
      if (!res.ok) {
        const { error } = await res.json() as { error: string }
        throw new Error(error)
      }
      const { result } = await res.json() as { result: string }
      toast.success(result === 'dry-run' ? 'Test email logged (dry-run)' : 'Test email sent!')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSending(false)
    }
  }

  // ── Register onchain
  const handleRegisterOnchain = () => {
    if (!isConnected || !address) { toast.error('Connect wallet first'); return }
    if (!isOnArc) { toast.error('Switch to Arc Testnet first'); return }
    if (!contractDeployed) { toast.error('SooAgent contract not deployed yet'); return }

    const configHash = buildConfigHash({ payrollDay, alertDaysBefore, timezone })
    const metadataURI = `data:application/json,${encodeURIComponent(JSON.stringify({
      type: 'soopay:payroll-agent:v1',
      payrollDay,
      alertDaysBefore,
      timezone,
      createdAt: new Date().toISOString(),
    }))}`

    setRegistering(true)
    try {
      writeContract({
        address: PAYROLL_AGENT_CONTRACT,
        abi: PAYROLL_AGENT_ABI,
        functionName: 'register',
        args: [configHash, metadataURI, BigInt(payrollDay), BigInt(alertDaysBefore)],
        chainId: ARC_TESTNET_CHAIN_ID,
      })
    } catch (e) {
      toast.error((e as Error).message)
      setRegistering(false)
    }
  }

  const fieldStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '10px',
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    color: 'var(--ink)',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
  }

  const employees = getEmployees()
  const serverUp  = status !== null

  return (
    <div className="max-w-lg mx-auto px-4 py-6 pb-28 md:pb-6 space-y-5">

      {/* Page header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--ink)' }}>SooAgent</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>
            Sends you a payroll summary email before payment day
          </p>
        </div>
        <div className="size-10 rounded-2xl flex items-center justify-center shrink-0"
          style={{ background: enabled ? 'var(--accent)' : 'var(--surface-muted)', border: '1px solid var(--border)' }}>
          <Bot className={cn('size-5', enabled ? 'text-white' : '')} style={{ color: enabled ? undefined : 'var(--muted)' }} />
        </div>
      </div>

      {/* Server status banner */}
      {!serverUp && !loadingStatus && (
        <div className="rounded-xl p-4 flex items-start gap-3"
          style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}>
          <AlertCircle className="size-4 shrink-0 mt-0.5 text-amber-500" />
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Agent server not running</p>
            <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
              Start it with: <code className="px-1 py-0.5 rounded text-xs" style={{ background: 'var(--surface-muted)' }}>bun run server/agent.ts</code>
              {' '} or use the combined start: <code className="px-1 py-0.5 rounded text-xs" style={{ background: 'var(--surface-muted)' }}>bun run dev</code>
            </p>
          </div>
        </div>
      )}

      {/* Dry-run notice */}
      {serverUp && status?.dryRunMode && (
        <div className="rounded-xl p-4 flex items-start gap-3"
          style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)' }}>
          <Info className="size-4 shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Dry-run mode</p>
            <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
              <code>RESEND_API_KEY</code> is not set. Emails are logged to the server console.
              Add your Resend key to <code>.env</code> to send real emails.
              Get a free key at{' '}
              <a href="https://resend.com" target="_blank" rel="noreferrer" className="underline">resend.com</a>.
            </p>
          </div>
        </div>
      )}

      {/* Status card */}
      {serverUp && (
        <div className="rounded-2xl p-4 space-y-3"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Agent Status</p>
            <button onClick={() => { void loadSchedule() }}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-all hover:bg-black/5"
              style={{ color: 'var(--muted)' }}>
              <RefreshCw className="size-3" /> Refresh
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Last Run',    value: relTime(status.lastRunAt),        icon: Clock },
              { label: 'Last Result', value: status.lastRunResult ?? 'None',   icon: CheckCircle },
              { label: 'Emails Sent', value: String(status.emailsSentTotal ?? 0), icon: Mail },
              { label: 'Employees',  value: String(status.employeeCount ?? employees.length), icon: Users },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="rounded-xl p-3 flex items-start gap-2"
                style={{ background: 'var(--surface-muted)' }}>
                <Icon className="size-3.5 shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
                <div>
                  <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--subtle)' }}>{label}</p>
                  <p className="text-sm font-semibold tabular-nums capitalize" style={{ color: 'var(--ink)' }}>{value}</p>
                </div>
              </div>
            ))}
          </div>
          {status.nextAlertDate && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
              style={{ background: 'rgba(99,102,241,0.06)' }}>
              <Bell className="size-3.5" style={{ color: 'var(--accent)' }} />
              <p className="text-xs" style={{ color: 'var(--ink)' }}>
                Next alert: <strong>{new Date(status.nextAlertDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</strong>
              </p>
            </div>
          )}
          {status.lastRunError && (
            <div className="px-3 py-2 rounded-xl"
              style={{ background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.2)' }}>
              <p className="text-xs text-red-600">Last error: {status.lastRunError}</p>
            </div>
          )}
        </div>
      )}

      {/* Config form */}
      <div className="rounded-2xl p-4 space-y-4"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>

        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Schedule Configuration</p>
          <button
            onClick={() => { setEnabled(e => !e) }}
            className="flex items-center gap-1.5 text-xs font-semibold transition-all">
            {enabled
              ? <ToggleRight className="size-5" style={{ color: 'var(--accent)' }} />
              : <ToggleLeft className="size-5" style={{ color: 'var(--muted)' }} />}
            <span style={{ color: enabled ? 'var(--accent)' : 'var(--muted)' }}>
              {enabled ? 'Enabled' : 'Disabled'}
            </span>
          </button>
        </div>

        {/* Email */}
        <div>
          <label className="text-xs font-medium mb-1.5 flex items-center gap-1.5"
            style={{ color: 'var(--muted)' }}>
            <Mail className="size-3" /> Your email address (SooAgent sends alerts to you)
          </label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="employer@company.com"
            style={fieldStyle}
          />
          <p className="text-[11px] mt-1" style={{ color: 'var(--subtle)' }}>
            The payroll summary will be sent to this address.
          </p>
        </div>

        {/* Payroll day */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium mb-1.5 flex items-center gap-1.5"
              style={{ color: 'var(--muted)' }}>
              <Calendar className="size-3" /> Payroll day of month
            </label>
            <input
              type="number"
              min={1} max={31}
              value={payrollDay}
              onChange={e => setPayrollDay(Math.max(1, Math.min(31, Number(e.target.value))))}
              style={fieldStyle}
            />
          </div>
          <div>
            <label className="text-xs font-medium mb-1.5 flex items-center gap-1.5"
              style={{ color: 'var(--muted)' }}>
              <Bell className="size-3" /> Alert days before
            </label>
            <input
              type="number"
              min={1} max={30}
              value={alertDaysBefore}
              onChange={e => setAlertDaysBefore(Math.max(1, Math.min(30, Number(e.target.value))))}
              style={fieldStyle}
            />
          </div>
        </div>

        {/* Timezone */}
        <div>
          <label className="text-xs font-medium mb-1.5 flex items-center gap-1.5"
            style={{ color: 'var(--muted)' }}>
            <Clock className="size-3" /> Timezone
          </label>
          <select value={timezone} onChange={e => setTimezone(e.target.value)} style={fieldStyle}>
            {TIMEZONES.map(tz => (
              <option key={tz.value} value={tz.value}>{tz.label}</option>
            ))}
          </select>
        </div>

        {/* Summary */}
        <div className="px-3 py-2 rounded-xl text-xs" style={{ background: 'rgba(99,102,241,0.06)', color: 'var(--ink)' }}>
          Agent will email <strong>{email || '(no email set)'}</strong>{' '}
          on day <strong>{payrollDay - alertDaysBefore}</strong> of each month
          (payroll day <strong>{payrollDay}</strong>, {alertDaysBefore} days before).
        </div>

        {/* Save */}
        <button
          onClick={() => { void handleSave() }}
          disabled={saving || !serverUp}
          className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50"
          style={{ background: 'var(--accent)' }}>
          {saving ? 'Saving…' : 'Save Schedule'}
        </button>
      </div>

      {/* Actions */}
      <div className="rounded-2xl p-4 space-y-3"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Actions</p>

        <div className="grid grid-cols-2 gap-2">
          {/* Sync employees */}
          <button
            onClick={() => { void handleSyncEmployees() }}
            disabled={syncing || !serverUp}
            className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
            style={{ background: 'var(--surface-muted)', color: 'var(--ink)', border: '1px solid var(--border)' }}>
            <Users className="size-4" />
            {syncing ? 'Syncing…' : `Sync ${employees.length} Employees`}
          </button>

          {/* Test email */}
          <button
            onClick={() => { void handleTestEmail() }}
            disabled={sending || !serverUp || !email}
            className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
            style={{ background: 'var(--surface-muted)', color: 'var(--ink)', border: '1px solid var(--border)' }}>
            <Mail className="size-4" />
            {sending ? 'Sending…' : 'Test Email'}
          </button>

          {/* Send now */}
          <button
            onClick={() => { void handleSendNow() }}
            disabled={sending || !serverUp || !email}
            className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50"
            style={{ background: 'var(--accent)' }}>
            <Play className="size-4" />
            {sending ? 'Sending…' : 'Send Alert Now'}
          </button>

          {/* Preview email */}
          <button
            onClick={() => setPreviewOpen(true)}
            className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all"
            style={{ background: 'var(--surface-muted)', color: 'var(--ink)', border: '1px solid var(--border)' }}>
            <Eye className="size-4" />
            Preview Email
          </button>
        </div>
      </div>

      {/* Onchain registration */}
      <div className="rounded-2xl p-4 space-y-3"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Onchain Registration</p>
          <button onClick={() => setShowAdvanced(a => !a)}
            className="flex items-center gap-1 text-xs" style={{ color: 'var(--muted)' }}>
            {showAdvanced ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            {showAdvanced ? 'Hide' : 'Show'}
          </button>
        </div>
        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          Register a hash of your schedule config onchain via{' '}
          <code className="text-[11px] px-1 py-0.5 rounded" style={{ background: 'var(--surface-muted)' }}>
            SoopayPayrollAgent
          </code>{' '}
          so your agent instructions are auditable on Arc Testnet.
          No private data is stored onchain — only a keccak256 commitment.
        </p>

        {showAdvanced && (
          <div className="space-y-3">
            <div className="px-3 py-2 rounded-xl text-xs font-mono"
              style={{ background: 'var(--surface-muted)', color: 'var(--muted)', wordBreak: 'break-all' }}>
              Config hash: {buildConfigHash({ payrollDay, alertDaysBefore, timezone })}
            </div>

            {!contractDeployed && (
              <div className="px-3 py-2 rounded-xl text-xs text-amber-600"
                style={{ background: 'rgba(245,158,11,0.08)' }}>
                Contract not deployed. Set VITE_PAYROLL_AGENT_ADDRESS in .env.
              </div>
            )}

            {contractDeployed && !isConnected && (
              <p className="text-xs text-center" style={{ color: 'var(--muted)' }}>
                Connect wallet to register onchain
              </p>
            )}

            {contractDeployed && isConnected && !isOnArc && (
              <p className="text-xs text-amber-600">Switch to Arc Testnet to register</p>
            )}

            <button
              onClick={handleRegisterOnchain}
              disabled={!contractDeployed || !isConnected || !isOnArc || writePending || registering}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50"
              style={{ background: 'var(--ink)' }}>
              <Zap className="size-4" />
              {writePending || registering ? 'Registering…' : 'Register on Arc Testnet'}
            </button>

            {writeTxHash && (
              <a
                href={buildArcScanTxUrl(writeTxHash)}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 text-xs justify-center"
                style={{ color: 'var(--accent)' }}>
                <ExternalLink className="size-3" />
                View onchain: {writeTxHash.slice(0, 12)}…
              </a>
            )}
          </div>
        )}
      </div>

      {/* What the email contains */}
      <div className="rounded-2xl p-4"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <p className="text-sm font-semibold mb-3" style={{ color: 'var(--ink)' }}>Email Contents</p>
        <div className="space-y-2">
          {[
            'Payroll date and urgency banner (today / tomorrow / N days)',
            'Total employees, total USDC, total cirBTC, approximate USD value',
            'Per-employee: name, designation, local salary, payment asset, current crypto equivalent',
            'Separate USDC and cirBTC batch summaries with wallet balance reminders',
            'Live FX rates at alert time (BTC/USD, local currency rates)',
            'Direct link to Soopay Payroll Review page',
            'Disclaimer: shown amounts are indicative — execution uses fresh rates',
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-2">
              <CheckCircle className="size-3.5 shrink-0 mt-0.5" style={{ color: 'var(--success)' }} />
              <p className="text-xs" style={{ color: 'var(--muted)' }}>{item}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Email preview modal */}
      {previewOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => setPreviewOpen(false)}>
          <div
            className="w-full max-w-2xl max-h-[90vh] overflow-auto rounded-2xl shadow-2xl"
            style={{ background: '#fff' }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white z-10">
              <p className="font-semibold text-sm">Email Preview</p>
              <div className="flex items-center gap-2">
                <a
                  href="/api/agent/preview-email"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg"
                  style={{ background: 'var(--accent)', color: 'white' }}>
                  <ExternalLink className="size-3" /> Open full preview
                </a>
                <button
                  onClick={() => setPreviewOpen(false)}
                  className="text-xs px-3 py-1.5 rounded-lg"
                  style={{ background: 'var(--surface-muted)' }}>
                  Close
                </button>
              </div>
            </div>
            <iframe
              src="/api/agent/preview-email"
              className="w-full"
              style={{ height: '75vh', border: 'none' }}
              title="Email Preview"
            />
          </div>
        </div>
      )}

    </div>
  )
}
