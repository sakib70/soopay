/**
 * reports.ts — pure computation layer for Soopay Reports.
 *
 * All functions are pure: they take data arrays and return derived summaries.
 * No side-effects, no localStorage access, no blockchain calls.
 *
 * ACCOUNTING NOTES (embedded as code comments so they survive a copy-paste):
 *  - On-chain "sends" are labelled "Outflow" not "Expense" — we cannot know
 *    the business purpose of a transaction from on-chain data alone.
 *  - On-chain "receives" are labelled "Inflow" not "Revenue" — inflow ≠ revenue
 *    without a chart of accounts.
 *  - Profit/Loss is never computed here. We lack sufficient accounting data.
 *  - Manual expenses are off-chain entries the user typed in — clearly flagged.
 *  - cirBTC amounts are displayed in BTC units; we do NOT convert BTC → USD
 *    for totals unless we have a verified rate passed in explicitly.
 */

import type { ActivityRecord, ManualExpense, Employee } from './storage'
import type { CurrencyCode } from './constants'

// ── Period helpers ────────────────────────────────────────────────────────────

export interface Period {
  year: number
  month: number   // 1-12, or 0 for "full year"
  label: string   // "January 2026" or "2026"
}

export function buildPeriods(activity: ActivityRecord[], expenses: ManualExpense[]): Period[] {
  const set = new Set<string>()

  const addTs = (ts: number) => {
    const d = new Date(ts)
    set.add(`${d.getFullYear()}-${d.getMonth() + 1}`)
  }
  const addDate = (iso: string) => {
    const [y, m] = iso.split('-').map(Number)
    if (y && m) set.add(`${y}-${m}`)
  }

  activity.forEach(a => addTs(a.timestamp))
  expenses.forEach(e => addDate(e.date))

  // Also add current month if nothing exists
  const now = new Date()
  set.add(`${now.getFullYear()}-${now.getMonth() + 1}`)

  return Array.from(set)
    .map(s => {
      const [y, m] = s.split('-').map(Number)
      return { year: y, month: m, label: monthLabel(y, m) }
    })
    .sort((a, b) => b.year !== a.year ? b.year - a.year : b.month - a.month)
}

export function buildYears(periods: Period[]): number[] {
  return Array.from(new Set(periods.map(p => p.year))).sort((a, b) => b - a)
}

function monthLabel(year: number, month: number): string {
  if (month === 0) return `${year}`
  const d = new Date(year, month - 1, 1)
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

// ── Raw amount helper ─────────────────────────────────────────────────────────

/** Convert bigint string + decimals to a JS number for display only. */
export function rawToDisplay(amountRaw: string, decimals: number): number {
  try {
    const raw = BigInt(amountRaw)
    const divisor = 10 ** decimals
    return Number(raw) / divisor
  } catch {
    return 0
  }
}

// ── On-chain summary ──────────────────────────────────────────────────────────

export interface OnChainSummary {
  /** Total USDC sent (outflow) */
  usdcOutflow: number
  /** Total USDC received (inflow) */
  usdcInflow: number
  /** Total USDC bridged out */
  usdcBridged: number
  /** Total USDC paid via payroll */
  usdcPayroll: number
  /** Total cirBTC sent (outflow) */
  cirBtcOutflow: number
  /** Total cirBTC received (inflow) */
  cirBtcInflow: number
  /** Total cirBTC paid via payroll */
  cirBtcPayroll: number
  /** Number of confirmed transactions */
  txCount: number
  /** Number of payroll batches */
  payrollCount: number
  /** Total employees paid across all payroll batches */
  employeesPaid: number
  /** Breakdown by type */
  byType: Record<ActivityRecord['type'], number>
}

export function summariseOnChain(
  records: ActivityRecord[],
  year: number,
  month: number,   // 0 = full year
): OnChainSummary {
  const filtered = filterByPeriod(records, year, month, (r) => r.timestamp)

  const s: OnChainSummary = {
    usdcOutflow: 0, usdcInflow: 0, usdcBridged: 0, usdcPayroll: 0,
    cirBtcOutflow: 0, cirBtcInflow: 0, cirBtcPayroll: 0,
    txCount: 0, payrollCount: 0, employeesPaid: 0,
    byType: { send: 0, receive: 0, bridge: 0, payroll: 0 },
  }

  for (const r of filtered) {
    if (r.status !== 'confirmed') continue
    s.txCount++
    s.byType[r.type]++
    const amt = rawToDisplay(r.amountRaw, r.decimals)

    if (r.asset === 'USDC') {
      if (r.type === 'send')    s.usdcOutflow  += amt
      if (r.type === 'receive') s.usdcInflow   += amt
      if (r.type === 'bridge')  s.usdcBridged  += amt
      if (r.type === 'payroll') { s.usdcPayroll += amt; s.payrollCount++ }
    } else {
      if (r.type === 'send')    s.cirBtcOutflow  += amt
      if (r.type === 'receive') s.cirBtcInflow   += amt
      if (r.type === 'payroll') { s.cirBtcPayroll += amt; s.payrollCount++ }
    }

    if (r.type === 'payroll') s.employeesPaid += r.employeeCount ?? 1
  }

  return s
}

// ── Monthly series (for charts / comparison) ──────────────────────────────────

export interface MonthlyPoint {
  label: string   // "Jan", "Feb", …
  month: number
  usdcOutflow: number
  usdcInflow: number
  usdcPayroll: number
  offchainExpenses: number  // sum of manual expenses converted to USD (approx)
}

export function buildMonthlySeries(
  records: ActivityRecord[],
  expenses: ManualExpense[],
  year: number,
  usdRates: Record<string, number>,  // { BDT: 0.0091, ... } — 1 unit = X USD
): MonthlyPoint[] {
  return Array.from({ length: 12 }, (_, i) => {
    const month = i + 1
    const onChain  = summariseOnChain(records, year, month)
    const offChain = summariseExpenses(expenses, year, month, usdRates)
    return {
      label: new Date(year, i, 1).toLocaleDateString('en-US', { month: 'short' }),
      month,
      usdcOutflow: onChain.usdcOutflow,
      usdcInflow:  onChain.usdcInflow,
      usdcPayroll: onChain.usdcPayroll,
      offchainExpenses: offChain.totalUsd,
    }
  })
}

// ── Manual expenses summary ───────────────────────────────────────────────────

export interface ExpenseSummary {
  totalUsd: number          // approximate — depends on provided rates
  totalEntriesCount: number
  byCategory: Record<string, { count: number; totalUsd: number }>
  currencyTotals: Record<string, number>  // totals in original currency
  largestEntry: ManualExpense | null
}

export function summariseExpenses(
  expenses: ManualExpense[],
  year: number,
  month: number,
  usdRates: Record<string, number>,   // 1 unit of currency = X USD
): ExpenseSummary {
  const filtered = filterByPeriod(expenses, year, month, (e) => new Date(e.date).getTime())

  const s: ExpenseSummary = {
    totalUsd: 0,
    totalEntriesCount: filtered.length,
    byCategory: {},
    currencyTotals: {},
    largestEntry: null,
  }

  let maxUsd = -Infinity

  for (const e of filtered) {
    const rate = e.currency === 'USD' ? 1 : (usdRates[e.currency] ?? 1)
    const usdAmt = e.amount * rate

    s.totalUsd += usdAmt
    s.currencyTotals[e.currency] = (s.currencyTotals[e.currency] ?? 0) + e.amount

    if (!s.byCategory[e.category]) {
      s.byCategory[e.category] = { count: 0, totalUsd: 0 }
    }
    s.byCategory[e.category].count++
    s.byCategory[e.category].totalUsd += usdAmt

    if (usdAmt > maxUsd) {
      maxUsd = usdAmt
      s.largestEntry = e
    }
  }

  return s
}

// ── Payroll report ────────────────────────────────────────────────────────────

export interface EmployeePayrollRow {
  employee: Employee
  batches: ActivityRecord[]
  totalUsdc: number
  totalCirBtc: number
}

export function buildPayrollReport(
  records: ActivityRecord[],
  employees: Employee[],
  year: number,
  month: number,
): EmployeePayrollRow[] {
  const payrollRecords = filterByPeriod(
    records.filter(r => r.type === 'payroll' && r.status === 'confirmed'),
    year, month, r => r.timestamp,
  )

  // Best-effort match: payroll records don't store per-employee breakdown,
  // so we show aggregate payroll batches and the employee list separately.
  return employees.map(emp => {
    // Match on wallet address in the `to` field
    const empBatches = payrollRecords.filter(r => r.to?.toLowerCase() === emp.address.toLowerCase())
    const totalUsdc   = empBatches.filter(r => r.asset === 'USDC').reduce((s, r) => s + rawToDisplay(r.amountRaw, r.decimals), 0)
    const totalCirBtc = empBatches.filter(r => r.asset === 'cirBTC').reduce((s, r) => s + rawToDisplay(r.amountRaw, r.decimals), 0)
    return { employee: emp, batches: empBatches, totalUsdc, totalCirBtc }
  })
}

// ── YoY comparison ────────────────────────────────────────────────────────────

export interface YoyComparison {
  currentYear: number
  previousYear: number
  usdcOutflowChange: number | null    // percentage, null when no prev data
  usdcPayrollChange: number | null
  offchainExpenseChange: number | null
}

export function buildYoyComparison(
  records: ActivityRecord[],
  expenses: ManualExpense[],
  year: number,
  usdRates: Record<string, number>,
): YoyComparison {
  const cur  = summariseOnChain(records, year, 0)
  const prev = summariseOnChain(records, year - 1, 0)
  const curExp  = summariseExpenses(expenses, year,     0, usdRates)
  const prevExp = summariseExpenses(expenses, year - 1, 0, usdRates)

  const pctChange = (cur: number, prev: number) =>
    prev === 0 ? null : Math.round(((cur - prev) / prev) * 100)

  return {
    currentYear: year,
    previousYear: year - 1,
    usdcOutflowChange:      pctChange(cur.usdcOutflow + cur.usdcPayroll,  prev.usdcOutflow + prev.usdcPayroll),
    usdcPayrollChange:      pctChange(cur.usdcPayroll, prev.usdcPayroll),
    offchainExpenseChange:  pctChange(curExp.totalUsd, prevExp.totalUsd),
  }
}

// ── CSV export ────────────────────────────────────────────────────────────────

export function exportActivityCsv(records: ActivityRecord[]): string {
  const header = ['Date', 'Type', 'Asset', 'Amount', 'From', 'To', 'Status', 'Tx Hash', 'Memo']
  const rows = records.map(r => [
    new Date(r.timestamp).toISOString().slice(0, 10),
    r.type,
    r.asset,
    rawToDisplay(r.amountRaw, r.decimals).toFixed(r.decimals === 8 ? 8 : 6),
    r.from ?? '',
    r.to ?? '',
    r.status,
    r.txHash,
    r.memo ?? '',
  ])
  return [header, ...rows].map(row => row.map(csvCell).join(',')).join('\n')
}

export function exportExpensesCsv(expenses: ManualExpense[]): string {
  const header = ['Date', 'Category', 'Description', 'Amount', 'Currency', 'Notes']
  const rows = expenses.map(e => [
    e.date,
    e.category,
    e.description,
    e.amount.toString(),
    e.currency,
    e.notes ?? '',
  ])
  return [header, ...rows].map(row => row.map(csvCell).join(',')).join('\n')
}

export function exportPayrollCsv(rows: EmployeePayrollRow[]): string {
  const header = ['Employee', 'Employee ID', 'Designation', 'Wallet', 'Asset', 'Salary (Local)', 'Currency', 'USDC Paid', 'cirBTC Paid']
  const data = rows.map(r => [
    r.employee.name,
    r.employee.employeeId ?? '',
    r.employee.designation ?? '',
    r.employee.address,
    r.employee.paymentAsset,
    r.employee.salaryAmount,
    r.employee.currency,
    r.totalUsdc.toFixed(6),
    r.totalCirBtc.toFixed(8),
  ])
  return [header, ...data].map(row => row.map(csvCell).join(',')).join('\n')
}

function csvCell(v: string): string {
  if (v.includes(',') || v.includes('"') || v.includes('\n')) {
    return `"${v.replace(/"/g, '""')}"`
  }
  return v
}

export function downloadCsv(csv: string, filename: string): void {
  // Prepend BOM so Excel opens UTF-8 correctly
  const bom  = '\uFEFF'
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  // Revoke after a tick so the browser has time to start the download
  setTimeout(() => {
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, 200)
}

// ── Private helpers ───────────────────────────────────────────────────────────

function filterByPeriod<T>(
  items: T[],
  year: number,
  month: number,
  getTs: (item: T) => number,
): T[] {
  return items.filter(item => {
    const d = new Date(getTs(item))
    if (d.getFullYear() !== year) return false
    if (month === 0) return true
    return d.getMonth() + 1 === month
  })
}
