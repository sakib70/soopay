/**
 * Reports — professional financial summary for Soopay.
 *
 * Tabs: Overview · Payroll · Expenses · Export
 *
 * Accounting discipline:
 *  - On-chain inflow is labelled "Inflow" not "Revenue"
 *  - On-chain outflow is labelled "Outflow" not "Expense"
 *  - Profit/Loss is never shown (insufficient accounting data)
 *  - Manual expenses are clearly flagged as "Off-chain · Manually entered"
 *  - cirBTC amounts stay in BTC units; no silent BTC→USD conversion
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  BarChart2, FileText, DollarSign, Users, Download,
  Plus, Pencil, Trash2, ChevronDown, ChevronUp,
  ArrowUpRight, ArrowDownLeft, ArrowLeftRight,
  AlertCircle, Check, X, ExternalLink,
  TrendingUp, TrendingDown, Minus,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  getActivity, getEmployees, getExpenses,
  saveExpense, updateExpense, deleteExpense,
  EXPENSE_CATEGORIES,
  type ManualExpense, type ExpenseCategory,
} from '@/lib/storage'
import type { ActivityRecord } from '@/lib/storage'
import {
  buildPeriods, buildYears, buildMonthlySeries,
  summariseOnChain, summariseExpenses, buildPayrollReport, buildYoyComparison,
  exportActivityCsv, exportExpensesCsv, exportPayrollCsv, downloadCsv,
  rawToDisplay,
} from '@/lib/reports'
import { CURRENCIES } from '@/lib/constants'
import { useCurrency } from '@/hooks/useCurrency'
import { buildArcScanTxUrl, truncateHash, relativeTime } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'payroll' | 'expenses' | 'export'
type ViewMode = 'monthly' | 'yearly'

interface FxRates { localToUsd: number; usdToLocal: number; btcUsd: number }

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number, decimals = 2): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(n)
}

function fmtUsd(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n)
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function changeBadge(pct: number | null) {
  if (pct === null) return null
  const up   = pct >= 0
  const Icon = pct === 0 ? Minus : up ? TrendingUp : TrendingDown
  const color = pct === 0 ? 'var(--muted)' : up ? 'var(--success)' : 'var(--danger)'
  return (
    <span className="flex items-center gap-0.5 text-xs font-semibold tabular-nums" style={{ color }}>
      <Icon className="size-3" />
      {pct > 0 ? '+' : ''}{pct}%
    </span>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, icon: Icon, accent = false, disclaimer,
}: {
  label: string; value: string; sub?: string; icon: React.ElementType
  accent?: boolean; disclaimer?: string
}) {
  return (
    <div
      className="rounded-2xl p-4 flex flex-col gap-2"
      style={{
        background: accent ? 'var(--accent)' : 'var(--surface)',
        border: accent ? 'none' : '1px solid var(--border)',
      }}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: accent ? 'rgba(255,255,255,0.6)' : 'var(--muted)' }}>
          {label}
        </p>
        <div className="size-7 rounded-lg flex items-center justify-center"
          style={{ background: accent ? 'rgba(255,255,255,0.15)' : 'var(--surface-muted)' }}>
          <Icon className="size-3.5" style={{ color: accent ? 'white' : 'var(--accent)' }} />
        </div>
      </div>
      <p className="text-2xl font-bold tabular-nums leading-none"
        style={{ color: accent ? 'white' : 'var(--ink)' }}>
        {value}
      </p>
      {sub && (
        <p className="text-xs" style={{ color: accent ? 'rgba(255,255,255,0.65)' : 'var(--muted)' }}>
          {sub}
        </p>
      )}
      {disclaimer && (
        <p className="text-[10px] italic" style={{ color: accent ? 'rgba(255,255,255,0.5)' : 'var(--subtle)' }}>
          {disclaimer}
        </p>
      )}
    </div>
  )
}

// ── Mini bar chart ────────────────────────────────────────────────────────────

interface BarData { label: string; outflow: number; inflow: number }

function MiniBarChart({ data }: { data: BarData[] }) {
  const max = Math.max(...data.flatMap(d => [d.outflow, d.inflow]), 1)
  return (
    <div className="flex items-end gap-1 h-20">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
          <div className="w-full flex flex-col-reverse gap-0.5" style={{ height: 64 }}>
            <div
              className="w-full rounded-sm transition-all"
              style={{
                height: `${Math.round((d.outflow / max) * 100)}%`,
                background: 'rgba(192,41,63,0.6)',
                minHeight: d.outflow > 0 ? 2 : 0,
              }}
            />
            <div
              className="w-full rounded-sm transition-all"
              style={{
                height: `${Math.round((d.inflow / max) * 100)}%`,
                background: 'rgba(22,163,74,0.6)',
                minHeight: d.inflow > 0 ? 2 : 0,
              }}
            />
          </div>
          <span className="text-[9px]" style={{ color: 'var(--subtle)' }}>{d.label}</span>
        </div>
      ))}
    </div>
  )
}

// ── Category donut (CSS-only) ─────────────────────────────────────────────────

const CATEGORY_COLORS = [
  '#6366f1','#f59e0b','#10b981','#ef4444','#3b82f6',
  '#8b5cf6','#ec4899','#14b8a6','#f97316','#a855f7','#06b6d4',
]

function CategoryBar({ byCategory }: { byCategory: Record<string, { count: number; totalUsd: number }> }) {
  const entries = Object.entries(byCategory).sort((a, b) => b[1].totalUsd - a[1].totalUsd)
  const total   = entries.reduce((s, [, v]) => s + v.totalUsd, 0)
  if (total === 0) return null
  return (
    <div className="space-y-2 mt-2">
      {entries.slice(0, 8).map(([cat, { totalUsd }], i) => (
        <div key={cat} className="flex items-center gap-2">
          <div className="size-2 rounded-full shrink-0" style={{ background: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} />
          <div className="flex-1 min-w-0">
            <div className="flex justify-between text-xs mb-0.5">
              <span className="truncate font-medium" style={{ color: 'var(--ink)' }}>{cat}</span>
              <span className="tabular-nums shrink-0 ml-2" style={{ color: 'var(--muted)' }}>{fmtUsd(totalUsd)}</span>
            </div>
            <div className="h-1.5 rounded-full" style={{ background: 'var(--border)' }}>
              <div
                className="h-1.5 rounded-full transition-all"
                style={{
                  width: `${Math.round((totalUsd / total) * 100)}%`,
                  background: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
                }}
              />
            </div>
          </div>
          <span className="text-xs tabular-nums shrink-0" style={{ color: 'var(--subtle)' }}>
            {Math.round((totalUsd / total) * 100)}%
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Expense form ──────────────────────────────────────────────────────────────

interface ExpenseFormProps {
  initial?: ManualExpense
  onSave: (data: Omit<ManualExpense, 'id' | 'createdAt' | 'updatedAt'>) => void
  onCancel: () => void
}

function ExpenseForm({ initial, onSave, onCancel }: ExpenseFormProps) {
  const [date,     setDate]     = useState(initial?.date        ?? today())
  const [category, setCategory] = useState<ExpenseCategory>(initial?.category  ?? 'Other')
  const [desc,     setDesc]     = useState(initial?.description ?? '')
  const [amount,   setAmount]   = useState(initial?.amount.toString()  ?? '')
  const [currency, setCurrency] = useState<string>(initial?.currency   ?? 'USD')
  const [notes,    setNotes]    = useState(initial?.notes        ?? '')
  const [err,      setErr]      = useState<string | null>(null)

  const allCurrencies = ['USD', ...CURRENCIES.map(c => c.code).filter(c => c !== 'USD')]

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!desc.trim())          { setErr('Description is required'); return }
    const amt = parseFloat(amount)
    if (!amount || isNaN(amt) || amt <= 0) { setErr('Enter a valid positive amount'); return }
    if (!date)                 { setErr('Date is required'); return }
    setErr(null)
    onSave({
      date,
      category,
      description: desc.trim(),
      amount: amt,
      currency: currency as ManualExpense['currency'],
      notes: notes.trim() || undefined,
    })
  }

  const fieldStyle: React.CSSProperties = {
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    color: 'var(--ink)',
    borderRadius: 12,
    padding: '8px 12px',
    fontSize: 14,
    width: '100%',
    outline: 'none',
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Date</label>
          <input type="date" value={date} max={today()} onChange={e => setDate(e.target.value)} style={fieldStyle} required />
        </div>
        <div>
          <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Category</label>
          <select value={category} onChange={e => setCategory(e.target.value as ExpenseCategory)} style={fieldStyle}>
            {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Description</label>
        <input
          type="text" value={desc} onChange={e => setDesc(e.target.value)}
          placeholder="e.g. AWS monthly bill" style={fieldStyle} maxLength={120}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Amount</label>
          <input
            type="number" value={amount} min="0.01" step="any"
            onChange={e => setAmount(e.target.value)} placeholder="0.00" style={fieldStyle}
          />
        </div>
        <div>
          <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Currency</label>
          <select value={currency} onChange={e => setCurrency(e.target.value)} style={fieldStyle}>
            {allCurrencies.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Notes (optional)</label>
        <textarea
          value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="Additional context..." rows={2}
          style={{ ...fieldStyle, resize: 'vertical', fontFamily: 'inherit' }}
          maxLength={400}
        />
      </div>

      {err && (
        <p className="text-xs text-red-500 flex items-center gap-1">
          <AlertCircle className="size-3" /> {err}
        </p>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white"
          style={{ background: 'var(--accent)' }}
        >
          <Check className="size-3.5 inline mr-1.5" />
          {initial ? 'Save changes' : 'Add expense'}
        </button>
        <button
          type="button" onClick={onCancel}
          className="px-4 py-2.5 rounded-xl text-sm font-medium"
          style={{ background: 'var(--surface-muted)', color: 'var(--ink)' }}
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function Reports() {
  const { currency } = useCurrency()
  const currencyInfo = CURRENCIES.find(c => c.code === currency) ?? CURRENCIES[0]

  // ── state ──
  const [tab,      setTab]      = useState<Tab>('overview')
  const [viewMode, setViewMode] = useState<ViewMode>('monthly')
  const [selYear,  setSelYear]  = useState(new Date().getFullYear())
  const [selMonth, setSelMonth] = useState(new Date().getMonth() + 1)  // 1-12
  const [activity, setActivity] = useState<ActivityRecord[]>([])
  const [employees]             = useState(() => getEmployees())
  const [expenses,  setExpenses] = useState<ManualExpense[]>([])
  const [fxRates,   setFxRates]  = useState<FxRates | null>(null)
  const [fxLoading, setFxLoading] = useState(false)
  const [addingExpense,  setAddingExpense]  = useState(false)
  const [editingExpense, setEditingExpense] = useState<ManualExpense | null>(null)

  // Refresh local data from storage
  const refresh = useCallback(() => {
    setActivity(getActivity())
    setExpenses(getExpenses())
  }, [])

  useEffect(() => { refresh() }, [refresh])

  // FX rates for local currency conversion (display only)
  useEffect(() => {
    setFxLoading(true)
    fetch(`/api/fx?currency=${encodeURIComponent(currency)}`)
      .then(r => r.json())
      .then((data: unknown) => {
        if (data && typeof data === 'object') {
          const d = data as { localToUsd?: number; usdToLocal?: number; btcToUsd?: number }
          setFxRates({
            localToUsd: d.localToUsd ?? 0,
            usdToLocal: d.usdToLocal ?? 1,
            btcUsd:     d.btcToUsd  ?? 0,
          })
        }
      })
      .catch(() => null)
      .finally(() => setFxLoading(false))
  }, [currency])

  // ── derived data ──
  const confirmedActivity = activity.filter(a => a.status === 'confirmed')
  const periods  = buildPeriods(confirmedActivity, expenses)
  const years    = buildYears(periods)

  const year  = viewMode === 'yearly' ? selYear : selYear
  const month = viewMode === 'yearly' ? 0 : selMonth

  const onChain  = summariseOnChain(confirmedActivity, year, month)
  const usdRates = fxRates ? { [currency]: fxRates.localToUsd } : {}
  const offChain = summariseExpenses(expenses, year, month, usdRates)
  const payrollRows = buildPayrollReport(confirmedActivity, employees, year, month)
  const monthlySeries = buildMonthlySeries(confirmedActivity, expenses, year, usdRates)
  const yoy = buildYoyComparison(confirmedActivity, expenses, year, usdRates)

  const totalPayrollUsdc  = payrollRows.reduce((s, r) => s + r.totalUsdc, 0)
  const totalPayrollCirBtc = payrollRows.reduce((s, r) => s + r.totalCirBtc, 0)

  // Filtered expenses for the current period
  const periodExpenses = expenses.filter(e => {
    const d = new Date(e.date)
    if (d.getFullYear() !== year) return false
    if (month === 0) return true
    return d.getMonth() + 1 === month
  })

  // ── handlers ──
  const handleSaveExpense = (data: Omit<ManualExpense, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (editingExpense) {
      updateExpense(editingExpense.id, data)
      toast.success('Expense updated')
      setEditingExpense(null)
    } else {
      saveExpense(data)
      toast.success('Expense added')
      setAddingExpense(false)
    }
    refresh()
  }

  const handleDeleteExpense = (id: string) => {
    if (!confirm('Delete this expense entry?')) return
    deleteExpense(id)
    refresh()
    toast.success('Expense deleted')
  }

  // ── exports ──
  const exportActive = useRef(false)
  const handleExport = (type: 'activity' | 'expenses' | 'payroll') => {
    if (exportActive.current) return
    exportActive.current = true
    try {
      const suffix = viewMode === 'monthly' ? `${year}-${String(month).padStart(2,'0')}` : `${year}`
      if (type === 'activity') {
        const filtered = confirmedActivity.filter(a => {
          const d = new Date(a.timestamp)
          if (d.getFullYear() !== year) return false
          return month === 0 || d.getMonth() + 1 === month
        })
        downloadCsv(exportActivityCsv(filtered), `soopay-activity-${suffix}.csv`)
      } else if (type === 'expenses') {
        downloadCsv(exportExpensesCsv(periodExpenses), `soopay-expenses-${suffix}.csv`)
      } else {
        downloadCsv(exportPayrollCsv(payrollRows), `soopay-payroll-${suffix}.csv`)
      }
      toast.success('CSV downloaded')
    } finally {
      setTimeout(() => { exportActive.current = false }, 1000)
    }
  }

  // ── period selector ──
  const periodSelector = (
    <div className="flex flex-wrap items-center gap-2">
      {/* Monthly / Yearly toggle */}
      <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        {(['monthly', 'yearly'] as ViewMode[]).map(m => (
          <button
            key={m}
            onClick={() => setViewMode(m)}
            className="px-3 py-1.5 text-xs font-semibold capitalize transition-all"
            style={{
              background: viewMode === m ? 'var(--accent)' : 'var(--surface)',
              color: viewMode === m ? 'white' : 'var(--muted)',
            }}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Year */}
      <select
        value={selYear}
        onChange={e => setSelYear(Number(e.target.value))}
        className="rounded-xl px-3 py-1.5 text-xs font-semibold"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--ink)' }}
      >
        {years.map(y => <option key={y} value={y}>{y}</option>)}
      </select>

      {/* Month (only in monthly mode) */}
      {viewMode === 'monthly' && (
        <select
          value={selMonth}
          onChange={e => setSelMonth(Number(e.target.value))}
          className="rounded-xl px-3 py-1.5 text-xs font-semibold"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--ink)' }}
        >
          {Array.from({ length: 12 }, (_, i) => {
            const m = i + 1
            const label = new Date(selYear, i, 1).toLocaleDateString('en-US', { month: 'long' })
            return <option key={m} value={m}>{label}</option>
          })}
        </select>
      )}
    </div>
  )

  // ────────────────────────────────────────────────────────────────────────────
  // TAB: OVERVIEW
  // ────────────────────────────────────────────────────────────────────────────

  const overviewTab = (
    <div className="space-y-5">
      {/* On-chain activity cards */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
            On-chain Activity
          </p>
          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium"
            style={{ background: 'rgba(99,102,241,0.1)', color: 'var(--accent)' }}>
            Blockchain-verified
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            label="USDC Outflow"
            value={`${fmt(onChain.usdcOutflow + onChain.usdcPayroll)} USDC`}
            sub={`${onChain.byType.send} sends · ${onChain.payrollCount} payroll`}
            icon={ArrowUpRight}
            disclaimer="Sends + payroll. Does not imply expense."
          />
          <StatCard
            label="USDC Inflow"
            value={`${fmt(onChain.usdcInflow)} USDC`}
            sub={`${onChain.byType.receive} receives`}
            icon={ArrowDownLeft}
            disclaimer="Received on-chain. Does not imply revenue."
          />
          <StatCard
            label="cirBTC Outflow"
            value={`${fmt(onChain.cirBtcOutflow + onChain.cirBtcPayroll, 6)} cirBTC`}
            sub={`${onChain.byType.send} sends`}
            icon={ArrowUpRight}
          />
          <StatCard
            label="USDC Bridged"
            value={`${fmt(onChain.usdcBridged)} USDC`}
            sub={`${onChain.byType.bridge} bridge tx`}
            icon={ArrowLeftRight}
          />
        </div>
      </div>

      {/* Off-chain expenses */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
            Off-chain Business Expenses
          </p>
          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium"
            style={{ background: 'rgba(245,158,11,0.12)', color: '#d97706' }}>
            Manually entered
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            label="Total Expenses"
            value={fxLoading ? '...' : fmtUsd(offChain.totalUsd)}
            sub={`${offChain.totalEntriesCount} entries · approx. USD`}
            icon={DollarSign}
            accent
          />
          <div
            className="rounded-2xl p-4 space-y-2"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
              By category
            </p>
            {offChain.totalEntriesCount === 0 ? (
              <p className="text-xs" style={{ color: 'var(--subtle)' }}>No expenses this period</p>
            ) : (
              <CategoryBar byCategory={offChain.byCategory} />
            )}
          </div>
        </div>
      </div>

      {/* Monthly chart — only in yearly view */}
      {viewMode === 'yearly' && (
        <div
          className="rounded-2xl p-4"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--muted)' }}>
            Monthly USDC Flow — {year}
          </p>
          <MiniBarChart
            data={monthlySeries.map(m => ({
              label: m.label,
              outflow: m.usdcOutflow + m.usdcPayroll,
              inflow:  m.usdcInflow,
            }))}
          />
          <div className="flex gap-4 mt-2">
            <div className="flex items-center gap-1.5">
              <div className="size-2.5 rounded-sm" style={{ background: 'rgba(22,163,74,0.6)' }} />
              <span className="text-[10px]" style={{ color: 'var(--subtle)' }}>Inflow</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="size-2.5 rounded-sm" style={{ background: 'rgba(192,41,63,0.6)' }} />
              <span className="text-[10px]" style={{ color: 'var(--subtle)' }}>Outflow</span>
            </div>
          </div>
        </div>
      )}

      {/* YoY comparison — yearly mode */}
      {viewMode === 'yearly' && (
        <div
          className="rounded-2xl p-4"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--muted)' }}>
            Year-over-Year vs {yoy.previousYear}
          </p>
          <div className="space-y-2">
            {[
              { label: 'Total Outflow (USDC)', change: yoy.usdcOutflowChange },
              { label: 'Payroll (USDC)',        change: yoy.usdcPayrollChange },
              { label: 'Off-chain Expenses',    change: yoy.offchainExpenseChange },
            ].map(({ label, change }) => (
              <div key={label} className="flex items-center justify-between py-1.5"
                style={{ borderBottom: '1px solid var(--border)' }}>
                <span className="text-sm" style={{ color: 'var(--ink)' }}>{label}</span>
                {change === null
                  ? <span className="text-xs" style={{ color: 'var(--subtle)' }}>No prior data</span>
                  : changeBadge(change)
                }
              </div>
            ))}
          </div>
          <p className="text-[10px] mt-2 italic" style={{ color: 'var(--subtle)' }}>
            Percentage changes are directional indicators only. Do not interpret as profit or loss.
          </p>
        </div>
      )}

      {/* Recent on-chain transactions */}
      <div
        className="rounded-2xl p-4"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--muted)' }}>
          Verified On-chain Transactions
        </p>
        {confirmedActivity.length === 0 ? (
          <p className="text-sm text-center py-4" style={{ color: 'var(--subtle)' }}>
            No confirmed transactions yet.
          </p>
        ) : (
          <div className="space-y-2">
            {confirmedActivity
              .filter(a => {
                const d = new Date(a.timestamp)
                if (d.getFullYear() !== year) return false
                return month === 0 || d.getMonth() + 1 === month
              })
              .slice(0, 10)
              .map(a => (
                <div key={a.id} className="flex items-center justify-between py-1.5"
                  style={{ borderBottom: '1px solid var(--border)' }}>
                  <div className="flex items-center gap-2">
                    <div className="size-6 rounded-full flex items-center justify-center text-xs"
                      style={{
                        background: a.type === 'receive' ? 'rgba(22,163,74,0.1)' : 'rgba(192,41,63,0.1)',
                        color: a.type === 'receive' ? 'var(--success)' : 'var(--danger)',
                      }}>
                      {a.type === 'receive' ? '↓' : a.type === 'bridge' ? '⇄' : '↑'}
                    </div>
                    <div>
                      <p className="text-xs font-medium capitalize" style={{ color: 'var(--ink)' }}>
                        {a.type}{a.employeeCount ? ` · ${a.employeeCount} employees` : ''}
                      </p>
                      <p className="text-[10px]" style={{ color: 'var(--subtle)' }}>
                        {relativeTime(a.timestamp)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="text-right">
                      <p className="text-xs font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>
                        {rawToDisplay(a.amountRaw, a.decimals).toFixed(a.decimals === 8 ? 6 : 2)} {a.asset}
                      </p>
                      <p className="text-[10px] mono" style={{ color: 'var(--subtle)' }}>
                        {truncateHash(a.txHash, 4)}
                      </p>
                    </div>
                    <a href={buildArcScanTxUrl(a.txHash)} target="_blank" rel="noopener noreferrer"
                      className="p-1 hover:bg-black/5 rounded transition-all">
                      <ExternalLink className="size-3" style={{ color: 'var(--subtle)' }} />
                    </a>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  )

  // ────────────────────────────────────────────────────────────────────────────
  // TAB: PAYROLL
  // ────────────────────────────────────────────────────────────────────────────

  const payrollTab = (
    <div className="space-y-4">
      {/* Totals */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Total USDC Paid"
          value={`${fmt(totalPayrollUsdc)} USDC`}
          sub={`${onChain.payrollCount} batch${onChain.payrollCount !== 1 ? 'es' : ''}`}
          icon={Users}
          accent
        />
        <StatCard
          label="Total cirBTC Paid"
          value={`${fmt(totalPayrollCirBtc, 6)} cirBTC`}
          sub={`${onChain.employeesPaid} employee payments`}
          icon={Users}
        />
      </div>

      {/* Per-employee table */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
            Employee Salary Report
          </p>
        </div>
        {employees.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm" style={{ color: 'var(--subtle)' }}>No employees on record.</p>
          </div>
        ) : (
          <div className="divide-y" style={{ '--tw-divide-opacity': 1, borderColor: 'var(--border)' } as React.CSSProperties}>
            {payrollRows.map(({ employee: emp }) => {
              // Compute current FX equivalent from live rates
              const salaryNum  = parseFloat(emp.salaryAmount) || 0
              const usdPerUnit = fxRates ? fxRates.localToUsd : null   // 1 local = X USD
              const usdVal     = usdPerUnit != null ? salaryNum * usdPerUnit : null

              let cryptoLine = ''
              if (emp.paymentAsset === 'USDC') {
                cryptoLine = usdVal != null ? `≈ ${usdVal.toFixed(2)} USDC` : '— USDC'
              } else {
                const btcUsd = fxRates?.btcUsd ?? 0
                const btcVal = (usdVal != null && btcUsd > 0) ? usdVal / btcUsd : null
                cryptoLine = btcVal != null ? `≈ ${btcVal.toFixed(8)} cirBTC` : '— cirBTC'
              }
              const rateNote = fxRates ? 'live rate' : 'rate unavailable'

              return (
                <div key={emp.id} className="flex items-center justify-between px-4 py-3 gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{emp.name}</p>
                    <p className="text-xs" style={{ color: 'var(--subtle)' }}>
                      {emp.designation ?? emp.employeeId ?? emp.currency}
                      {' · '}
                      <span className="mono text-[10px]">
                        {emp.address.slice(0, 6)}…{emp.address.slice(-4)}
                      </span>
                    </p>
                  </div>
                  <div className="text-right shrink-0 space-y-0.5">
                    <p className="text-xs tabular-nums" style={{ color: 'var(--muted)' }}>
                      {Number(emp.salaryAmount).toLocaleString()} {emp.currency}
                    </p>
                    <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                      {cryptoLine}
                    </p>
                    <p className="text-[10px]" style={{ color: 'var(--subtle)' }}>
                      {emp.paymentAsset} · {rateNote}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Payroll batches */}
      {confirmedActivity.filter(a => a.type === 'payroll').length > 0 && (
        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
              Payroll Transactions
            </p>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {confirmedActivity
              .filter(a => {
                if (a.type !== 'payroll') return false
                const d = new Date(a.timestamp)
                if (d.getFullYear() !== year) return false
                return month === 0 || d.getMonth() + 1 === month
              })
              .map(a => (
                <div key={a.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-xs font-medium" style={{ color: 'var(--ink)' }}>
                      {a.asset} Payroll · {a.employeeCount ?? '?'} employees
                    </p>
                    <p className="text-[10px]" style={{ color: 'var(--subtle)' }}>
                      {new Date(a.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                      {rawToDisplay(a.amountRaw, a.decimals).toFixed(a.decimals === 8 ? 6 : 2)} {a.asset}
                    </p>
                    <a href={buildArcScanTxUrl(a.txHash)} target="_blank" rel="noopener noreferrer"
                      className="p-1 hover:bg-black/5 rounded">
                      <ExternalLink className="size-3" style={{ color: 'var(--subtle)' }} />
                    </a>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )

  // ────────────────────────────────────────────────────────────────────────────
  // TAB: EXPENSES
  // ────────────────────────────────────────────────────────────────────────────

  const expensesTab = (
    <div className="space-y-4">
      {/* Disclaimer */}
      <div className="rounded-xl px-4 py-3 flex items-start gap-2.5"
        style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
        <AlertCircle className="size-3.5 shrink-0 mt-0.5" style={{ color: '#d97706' }} />
        <p className="text-xs" style={{ color: '#92400e' }}>
          Off-chain expenses are manually entered records. They are stored locally in your browser
          and are <strong>not</strong> linked to any blockchain transaction. Keep them separate from
          verified on-chain activity.
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Total (approx. USD)"
          value={fxLoading ? '…' : fmtUsd(offChain.totalUsd)}
          sub={`${offChain.totalEntriesCount} entries`}
          icon={DollarSign}
          disclaimer="Converted at current FX rates for display only."
        />
        <div
          className="rounded-2xl p-4"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--muted)' }}>
            By Category
          </p>
          {offChain.totalEntriesCount === 0
            ? <p className="text-xs" style={{ color: 'var(--subtle)' }}>None this period</p>
            : <CategoryBar byCategory={offChain.byCategory} />
          }
        </div>
      </div>

      {/* Add button */}
      {!addingExpense && !editingExpense && (
        <button
          onClick={() => setAddingExpense(true)}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white"
          style={{ background: 'var(--accent)' }}
        >
          <Plus className="size-4" />
          Add Off-chain Expense
        </button>
      )}

      {/* Add form */}
      {addingExpense && (
        <div className="rounded-2xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--accent)' }}>
          <p className="text-sm font-semibold mb-3" style={{ color: 'var(--ink)' }}>New Expense Entry</p>
          <ExpenseForm
            onSave={handleSaveExpense}
            onCancel={() => setAddingExpense(false)}
          />
        </div>
      )}

      {/* Edit form */}
      {editingExpense && (
        <div className="rounded-2xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--accent)' }}>
          <p className="text-sm font-semibold mb-3" style={{ color: 'var(--ink)' }}>Edit Expense</p>
          <ExpenseForm
            initial={editingExpense}
            onSave={handleSaveExpense}
            onCancel={() => setEditingExpense(null)}
          />
        </div>
      )}

      {/* Expenses list */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <div className="px-4 py-3 flex items-center justify-between"
          style={{ borderBottom: '1px solid var(--border)' }}>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
            Expense Entries
          </p>
          <span className="text-xs" style={{ color: 'var(--subtle)' }}>{periodExpenses.length} records</span>
        </div>
        {periodExpenses.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm" style={{ color: 'var(--subtle)' }}>No expenses entered for this period.</p>
            <p className="text-xs mt-1" style={{ color: 'var(--subtle)' }}>
              Use "Add Off-chain Expense" above to track business costs.
            </p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {periodExpenses.map(e => (
              <div key={e.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>
                        {e.description}
                      </p>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                        style={{ background: 'rgba(99,102,241,0.08)', color: 'var(--accent)' }}>
                        {e.category}
                      </span>
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--subtle)' }}>
                      {e.date}
                      {e.notes ? ` · ${e.notes}` : ''}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                      {e.amount.toLocaleString('en-US', { maximumFractionDigits: 2 })} {e.currency}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => { setEditingExpense(e); setAddingExpense(false) }}
                    className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-all hover:bg-black/5"
                    style={{ color: 'var(--muted)' }}
                  >
                    <Pencil className="size-3" /> Edit
                  </button>
                  <button
                    onClick={() => handleDeleteExpense(e.id)}
                    className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-all hover:bg-red-50"
                    style={{ color: 'var(--danger)' }}
                  >
                    <Trash2 className="size-3" /> Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )

  // ────────────────────────────────────────────────────────────────────────────
  // TAB: EXPORT
  // ────────────────────────────────────────────────────────────────────────────

  const exportTab = (
    <div className="space-y-4">
      <div className="rounded-xl px-4 py-3 flex items-start gap-2.5"
        style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)' }}>
        <FileText className="size-3.5 shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
        <p className="text-xs" style={{ color: 'var(--ink)' }}>
          CSV exports contain your {viewMode === 'monthly' ? `${new Date(year, selMonth - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}` : year} data.
          PDF export is not available in this version — open the CSV in Excel or Google Sheets to generate formatted PDF reports.
        </p>
      </div>

      {[
        {
          title: 'On-chain Activity',
          desc: 'All confirmed blockchain transactions — sends, receives, bridges, payroll batches.',
          badge: 'Blockchain-verified',
          badgeColor: 'rgba(99,102,241,0.1)',
          badgeText: 'var(--accent)',
          count: confirmedActivity.filter(a => {
            const d = new Date(a.timestamp)
            if (d.getFullYear() !== year) return false
            return month === 0 || d.getMonth() + 1 === month
          }).length,
          type: 'activity' as const,
        },
        {
          title: 'Off-chain Expenses',
          desc: 'Manually entered business expenses. Clearly separate from on-chain data.',
          badge: 'Manual entries',
          badgeColor: 'rgba(245,158,11,0.1)',
          badgeText: '#d97706',
          count: periodExpenses.length,
          type: 'expenses' as const,
        },
        {
          title: 'Payroll Report',
          desc: 'Employee salary report — local currency, payment asset, and verified amounts paid.',
          badge: 'Employee data',
          badgeColor: 'rgba(22,163,74,0.1)',
          badgeText: 'var(--success)',
          count: payrollRows.length,
          type: 'payroll' as const,
        },
      ].map(({ title, desc, badge, badgeColor, badgeText, count, type }) => (
        <div
          key={type}
          className="rounded-2xl p-4 flex items-start justify-between gap-3"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{title}</p>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                style={{ background: badgeColor, color: badgeText }}>
                {badge}
              </span>
            </div>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>{desc}</p>
            <p className="text-xs mt-1" style={{ color: 'var(--subtle)' }}>{count} records</p>
          </div>
          <button
            onClick={() => handleExport(type)}
            disabled={count === 0}
            className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white transition-all disabled:opacity-40"
            style={{ background: 'var(--accent)' }}
          >
            <Download className="size-3.5" />
            CSV
          </button>
        </div>
      ))}

      <p className="text-[11px] text-center" style={{ color: 'var(--subtle)' }}>
        All data is stored locally in your browser. Nothing is sent to external servers.
        On-chain data can be independently verified via ArcScan.
      </p>
    </div>
  )

  // ────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────────────────────────

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'overview',  label: 'Overview',  icon: BarChart2 },
    { id: 'payroll',   label: 'Payroll',   icon: Users },
    { id: 'expenses',  label: 'Expenses',  icon: DollarSign },
    { id: 'export',    label: 'Export',    icon: Download },
  ]

  return (
    <div className="max-w-lg mx-auto px-4 py-6 pb-28 md:pb-6 space-y-5">
      {/* Page header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="display text-2xl font-bold" style={{ color: 'var(--ink)' }}>Reports</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>
            Financial summaries · {fxLoading ? 'Loading rates…' : `${currency} rates live`}
          </p>
        </div>
        <div
          className="size-10 rounded-2xl flex items-center justify-center shrink-0"
          style={{ background: 'var(--accent)' }}
        >
          <BarChart2 className="size-5 text-white" />
        </div>
      </div>

      {/* Period selector */}
      {periodSelector}

      {/* Tab nav */}
      <div
        className="flex rounded-2xl overflow-hidden p-1 gap-1"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all"
            style={{
              background: tab === id ? 'var(--accent)' : 'transparent',
              color: tab === id ? 'white' : 'var(--muted)',
            }}
          >
            <Icon className="size-3.5" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'overview' && overviewTab}
      {tab === 'payroll'  && payrollTab}
      {tab === 'expenses' && expensesTab}
      {tab === 'export'   && exportTab}
    </div>
  )
}
