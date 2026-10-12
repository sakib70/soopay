/**
 * SooAgent — server/agent.ts
 *
 * A lightweight Bun HTTP server that:
 *   1. Stores the payroll alert schedule in a local JSON file (server-side only)
 *   2. Fetches live FX rates from the local /api/fx proxy
 *   3. Computes current crypto equivalents for every employee
 *   4. Sends a rich HTML email via Resend API (RESEND_API_KEY in .env)
 *   5. Runs a daily cron-style check to fire alerts at the right time
 *
 * Endpoints:
 *   GET  /api/agent/schedule     — read current schedule config
 *   POST /api/agent/schedule     — save schedule config
 *   POST /api/agent/send-now     — manually trigger alert email
 *   GET  /api/agent/status       — last run info + next run estimate
 *   POST /api/agent/test-email   — send a test email (no employee data)
 *
 * Port: 3002 (proxied via Vite /api/agent → localhost:3002/api/agent)
 *
 * Email provider: Resend (https://resend.com) — free tier 3,000 emails/month.
 * Set RESEND_API_KEY in .env. Without a key the server logs the email HTML
 * to stdout instead (dry-run mode).
 */

import { serve } from 'bun'
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs'
import { join } from 'path'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Employee {
  id: string
  name: string
  address: string
  employeeId?: string
  designation?: string
  currency: string
  salaryAmount: string
  paymentAsset: 'USDC' | 'cirBTC'
}

interface AgentSchedule {
  enabled: boolean
  recipientEmail: string
  payrollDay: number         // 1-31: day of month payroll runs
  alertDaysBefore: number    // 1-30: send alert N days before payroll day
  timezone: string           // IANA timezone e.g. "Asia/Dhaka"
  onchainTxHash?: string     // tx hash from SoopayPayrollAgent.register()
  onchainConfigHash?: string
  updatedAt: number
}

interface AgentStatus {
  lastRunAt: number | null
  lastRunResult: 'success' | 'failed' | 'dry-run' | null
  lastRunError: string | null
  emailsSentTotal: number
  nextAlertDate: string | null
}

interface FxRates {
  usdRates: Record<string, number>
  btcUsd: number
}

// ── State ─────────────────────────────────────────────────────────────────────

const DATA_DIR    = join(import.meta.dir, '../.agent-data')
const SCHED_FILE  = join(DATA_DIR, 'schedule.json')
const STATUS_FILE = join(DATA_DIR, 'status.json')
const EMP_FILE    = join(DATA_DIR, 'employees.json')   // synced from frontend
const KEY_FILE    = join(DATA_DIR, 'resend.key')       // user-supplied Resend key (server-side only)

/** Get the active Resend API key: user-saved key takes priority over .env */
function getResendKey(): string | undefined {
  try {
    if (existsSync(KEY_FILE)) {
      const k = readFileSync(KEY_FILE, 'utf-8').trim()
      if (k.startsWith('re_')) return k
    }
  } catch { /* ignore */ }
  return process.env.RESEND_API_KEY || undefined
}

// Ensure data directory exists
try {
  await Bun.write(join(DATA_DIR, '.gitkeep'), '')
} catch {
  // directory already exists
}

function readJson<T>(path: string, fallback: T): T {
  try {
    if (!existsSync(path)) return fallback
    return JSON.parse(readFileSync(path, 'utf-8')) as T
  } catch {
    return fallback
  }
}

function writeJson(path: string, data: unknown): void {
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8')
}

const defaultSchedule: AgentSchedule = {
  enabled: false,
  recipientEmail: '',
  payrollDay: 25,
  alertDaysBefore: 3,
  timezone: 'Asia/Dhaka',
  updatedAt: 0,
}

const defaultStatus: AgentStatus = {
  lastRunAt: null,
  lastRunResult: null,
  lastRunError: null,
  emailsSentTotal: 0,
  nextAlertDate: null,
}

// ── FX helper ─────────────────────────────────────────────────────────────────

async function fetchRatesForCurrencies(currencies: string[]): Promise<FxRates> {
  const usdRates: Record<string, number> = {}
  let btcUsd = 0
  const unique = Array.from(new Set(currencies)).filter(Boolean)
  await Promise.all(unique.map(async (cur) => {
    try {
      const res = await fetch(`http://localhost:3001/api/fx?currency=${encodeURIComponent(cur)}`, {
        signal: AbortSignal.timeout(10_000),
      })
      if (res.ok) {
        const data = await res.json() as { localToUsd?: number; btcToUsd?: number }
        // localToUsd: 1 unit of local currency = X USD
        if (data.localToUsd) usdRates[cur] = data.localToUsd
        if (data.btcToUsd && !btcUsd) btcUsd = data.btcToUsd
      }
    } catch { /* ignore per-currency failure */ }
  }))
  return { usdRates, btcUsd }
}

// ── Crypto amount computation ─────────────────────────────────────────────────

interface EmployeeWithAmounts extends Employee {
  usdEquivalent: number
  cryptoAmount: number
  cryptoDisplay: string
}

function computeAmounts(employees: Employee[], rates: FxRates): EmployeeWithAmounts[] {
  return employees.map(emp => {
    const salaryNum = parseFloat(emp.salaryAmount) || 0
    const currency  = emp.currency as string

    // rates.usdRates[currency] = how many USD per 1 unit of local currency
    // (fetched as localToUsd from the FX server)
    const localToUsd = rates.usdRates[currency] ?? 0

    const usdEquivalent = salaryNum * localToUsd

    let cryptoAmount = 0
    let cryptoDisplay = ''

    if (emp.paymentAsset === 'USDC') {
      cryptoAmount = usdEquivalent
      cryptoDisplay = `${usdEquivalent.toFixed(2)} USDC`
    } else {
      // cirBTC — convert USD → BTC
      const btcAmount = rates.btcUsd > 0 ? usdEquivalent / rates.btcUsd : 0
      cryptoAmount = btcAmount
      cryptoDisplay = `${btcAmount.toFixed(8)} cirBTC`
    }

    return { ...emp, usdEquivalent, cryptoAmount, cryptoDisplay }
  })
}

// ── Email rendering ───────────────────────────────────────────────────────────

function renderEmail(
  employees: EmployeeWithAmounts[],
  schedule: AgentSchedule,
  rates: FxRates,
  payrollDate: string,
  daysUntil: number,
): string {
  const usdcEmployees  = employees.filter(e => e.paymentAsset === 'USDC')
  const cirBtcEmployees = employees.filter(e => e.paymentAsset === 'cirBTC')

  const totalUsdc   = usdcEmployees.reduce((s, e) => s + e.cryptoAmount, 0)
  const totalCirBtc = cirBtcEmployees.reduce((s, e) => s + e.cryptoAmount, 0)
  const totalUsd    = employees.reduce((s, e) => s + e.usdEquivalent, 0)

  const urgencyColor = daysUntil <= 1 ? '#dc2626' : daysUntil <= 3 ? '#d97706' : '#2563eb'
  const urgencyLabel = daysUntil === 0
    ? '⚠️ PAYROLL DAY IS TODAY'
    : daysUntil === 1
    ? '🔔 Payroll runs tomorrow'
    : `📅 Payroll in ${daysUntil} days`

  const employeeRows = employees.map(e => `
    <tr>
      <td style="padding:10px 12px; border-bottom:1px solid #f0f0f0;">
        <div style="font-weight:600; color:#111;">${e.name}</div>
        ${e.designation ? `<div style="font-size:12px; color:#6b7280;">${e.designation}</div>` : ''}
        ${e.employeeId ? `<div style="font-size:11px; color:#9ca3af;">ID: ${e.employeeId}</div>` : ''}
      </td>
      <td style="padding:10px 12px; border-bottom:1px solid #f0f0f0; font-family:monospace; font-size:13px; color:#374151;">
        ${parseFloat(e.salaryAmount).toLocaleString('en-US')} ${e.currency}
      </td>
      <td style="padding:10px 12px; border-bottom:1px solid #f0f0f0; text-align:center;">
        <span style="padding:2px 8px; border-radius:99px; font-size:11px; font-weight:600;
          background:${e.paymentAsset === 'USDC' ? '#eff6ff' : '#fef3c7'};
          color:${e.paymentAsset === 'USDC' ? '#2563eb' : '#d97706'};">
          ${e.paymentAsset}
        </span>
      </td>
      <td style="padding:10px 12px; border-bottom:1px solid #f0f0f0; font-family:monospace; font-size:13px; font-weight:700; color:#111; text-align:right;">
        ${e.cryptoDisplay}
      </td>
      <td style="padding:10px 12px; border-bottom:1px solid #f0f0f0; font-family:monospace; font-size:12px; color:#6b7280; text-align:right;">
        ≈ $${e.usdEquivalent.toFixed(2)}
      </td>
    </tr>
  `).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SooAgent Payroll Alert</title>
</head>
<body style="margin:0; padding:0; background:#f9fafb; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb; padding:40px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px; background:#fff; border-radius:16px; overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:#ff0000; padding:28px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <div style="font-size:22px; font-weight:800; color:#fff; letter-spacing:-0.5px;">Soopay</div>
                  <div style="font-size:13px; color:rgba(255,255,255,0.8); margin-top:2px;">SooAgent</div>
                </td>
                <td align="right">
                  <div style="background:rgba(255,255,255,0.15); border-radius:8px; padding:8px 14px; display:inline-block;">
                    <div style="font-size:11px; color:rgba(255,255,255,0.7); text-transform:uppercase; letter-spacing:0.5px;">Payroll Date</div>
                    <div style="font-size:16px; font-weight:700; color:#fff;">${payrollDate}</div>
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Urgency Banner -->
        <tr>
          <td style="background:${urgencyColor}15; border-left:4px solid ${urgencyColor}; padding:14px 28px;">
            <p style="margin:0; font-size:15px; font-weight:700; color:${urgencyColor};">${urgencyLabel}</p>
            <p style="margin:4px 0 0; font-size:13px; color:#6b7280;">
              Review the payment details below and ensure your wallet has sufficient balance.
            </p>
          </td>
        </tr>

        <!-- Summary Cards -->
        <tr>
          <td style="padding:24px 28px 8px;">
            <p style="margin:0 0 14px; font-size:14px; font-weight:700; color:#111; text-transform:uppercase; letter-spacing:0.5px;">Payment Summary</p>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td width="33%" style="padding-right:8px;">
                  <div style="background:#f0f4ff; border-radius:12px; padding:16px; text-align:center;">
                    <div style="font-size:11px; color:#6b7280; margin-bottom:4px;">Employees</div>
                    <div style="font-size:24px; font-weight:800; color:#111;">${employees.length}</div>
                  </div>
                </td>
                <td width="33%" style="padding-right:8px;">
                  <div style="background:#eff6ff; border-radius:12px; padding:16px; text-align:center;">
                    <div style="font-size:11px; color:#6b7280; margin-bottom:4px;">USDC Total</div>
                    <div style="font-size:18px; font-weight:800; color:#2563eb; font-family:monospace;">${totalUsdc.toFixed(2)}</div>
                  </div>
                </td>
                <td width="33%">
                  <div style="background:#fef3c7; border-radius:12px; padding:16px; text-align:center;">
                    <div style="font-size:11px; color:#6b7280; margin-bottom:4px;">cirBTC Total</div>
                    <div style="font-size:16px; font-weight:800; color:#d97706; font-family:monospace;">${totalCirBtc.toFixed(8)}</div>
                  </div>
                </td>
              </tr>
            </table>
            <div style="margin-top:10px; padding:10px 16px; background:#f9fafb; border-radius:8px; font-size:12px; color:#6b7280; text-align:center;">
              Total estimated value: <strong style="color:#111;">≈ $${totalUsd.toFixed(2)} USD</strong>
              · Rates from ${new Date().toUTCString()}
              · BTC/USD: $${rates.btcUsd.toLocaleString('en-US')}
            </div>
          </td>
        </tr>

        <!-- Employee Table -->
        <tr>
          <td style="padding:16px 28px 24px;">
            <p style="margin:0 0 12px; font-size:14px; font-weight:700; color:#111; text-transform:uppercase; letter-spacing:0.5px;">
              Employee Breakdown
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb; border-radius:10px; overflow:hidden; font-size:13px;">
              <thead>
                <tr style="background:#f9fafb;">
                  <th style="padding:10px 12px; text-align:left; font-weight:600; color:#6b7280; font-size:11px; text-transform:uppercase;">Employee</th>
                  <th style="padding:10px 12px; text-align:left; font-weight:600; color:#6b7280; font-size:11px; text-transform:uppercase;">Local Salary</th>
                  <th style="padding:10px 12px; text-align:center; font-weight:600; color:#6b7280; font-size:11px; text-transform:uppercase;">Asset</th>
                  <th style="padding:10px 12px; text-align:right; font-weight:600; color:#6b7280; font-size:11px; text-transform:uppercase;">Amount</th>
                  <th style="padding:10px 12px; text-align:right; font-weight:600; color:#6b7280; font-size:11px; text-transform:uppercase;">≈ USD</th>
                </tr>
              </thead>
              <tbody>
                ${employeeRows}
              </tbody>
            </table>
            <p style="margin:8px 0 0; font-size:11px; color:#9ca3af;">
              ⚠️ Amounts are calculated using live exchange rates at alert time.
              Actual settlement amounts are calculated fresh at execution time.
              Local-currency salaries are informational only — the blockchain receives crypto amounts.
            </p>
          </td>
        </tr>

        ${usdcEmployees.length > 0 ? `
        <!-- USDC Breakdown -->
        <tr>
          <td style="padding:0 28px 16px;">
            <div style="background:#eff6ff; border-radius:12px; padding:16px;">
              <p style="margin:0 0 8px; font-size:13px; font-weight:700; color:#2563eb;">USDC Payment Batch</p>
              <p style="margin:0; font-size:13px; color:#374151;">
                ${usdcEmployees.length} employee${usdcEmployees.length > 1 ? 's' : ''}
                · <strong>${totalUsdc.toFixed(2)} USDC total</strong>
                · Ensure your wallet has ≥ ${(totalUsdc * 1.02).toFixed(2)} USDC (including gas buffer)
              </p>
            </div>
          </td>
        </tr>` : ''}

        ${cirBtcEmployees.length > 0 ? `
        <!-- cirBTC Breakdown -->
        <tr>
          <td style="padding:0 28px 16px;">
            <div style="background:#fef3c7; border-radius:12px; padding:16px;">
              <p style="margin:0 0 8px; font-size:13px; font-weight:700; color:#d97706;">cirBTC Payment Batch</p>
              <p style="margin:0; font-size:13px; color:#374151;">
                ${cirBtcEmployees.length} employee${cirBtcEmployees.length > 1 ? 's' : ''}
                · <strong>${totalCirBtc.toFixed(8)} cirBTC total</strong>
                · Ensure your wallet has sufficient cirBTC balance
              </p>
            </div>
          </td>
        </tr>` : ''}

        <!-- CTA -->
        <tr>
          <td style="padding:0 28px 28px; text-align:center;">
            <a href="${process.env.VITE_APP_URL ?? 'http://localhost:5173'}/payroll/review"
               style="display:inline-block; background:#ff0000; color:#fff; text-decoration:none;
                      padding:14px 32px; border-radius:10px; font-weight:700; font-size:15px;">
              Review &amp; Execute Payroll →
            </a>
            <p style="margin:12px 0 0; font-size:12px; color:#9ca3af;">
              Click to open Soopay and proceed to the payroll review screen.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb; border-top:1px solid #e5e7eb; padding:16px 28px; text-align:center;">
            <p style="margin:0; font-size:11px; color:#9ca3af;">
              This alert was sent by the SooAgent.
              You are receiving this because you set up a payroll schedule on Soopay.
              <br>Onchain schedule hash: <code style="font-size:10px;">${schedule.onchainConfigHash ?? 'not registered'}</code>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

// ── Email sender ──────────────────────────────────────────────────────────────

async function sendEmail(to: string, subject: string, html: string): Promise<'sent' | 'dry-run'> {
  const apiKey = getResendKey()

  if (!apiKey) {
    // Dry-run: log to console
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('[agent] DRY-RUN EMAIL (set RESEND_API_KEY to send for real)')
    console.log(`[agent] To: ${to}`)
    console.log(`[agent] Subject: ${subject}`)
    console.log('[agent] HTML body length:', html.length, 'chars')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
    return 'dry-run'
  }

  // On Resend's free plan, `from` must be either a verified domain address OR
  // the same address as `to` (self-send). Since the user configured their own
  // email, we send FROM that same address — always permitted on the free plan.
  // Once you verify a domain at resend.com/domains, set RESEND_FROM_EMAIL in .env
  // to override (e.g. RESEND_FROM_EMAIL=SooAgent <noreply@yourdomain.com>).
  const fromAddress = process.env.RESEND_FROM_EMAIL ?? `SooAgent <${to}>`

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: fromAddress, to: [to], subject, html }),
    signal: AbortSignal.timeout(15_000),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Resend API ${res.status}: ${body}`)
  }

  console.log(`[agent] Email sent to ${to} via Resend`)
  return 'sent'
}

// ── Alert logic ───────────────────────────────────────────────────────────────

function getNextPayrollDate(payrollDay: number, timezone: string): { date: Date; daysUntil: number } {
  const now = new Date()
  // Get current date in target timezone
  const tzNow = new Date(now.toLocaleString('en-US', { timeZone: timezone }))
  const year  = tzNow.getFullYear()
  const month = tzNow.getMonth()
  const today = tzNow.getDate()

  let payrollDate = new Date(year, month, payrollDay)
  if (today > payrollDay) {
    // Payroll already passed this month — next month
    payrollDate = new Date(year, month + 1, payrollDay)
  }

  const msPerDay  = 86_400_000
  const daysUntil = Math.ceil((payrollDate.getTime() - tzNow.setHours(0,0,0,0)) / msPerDay)
  return { date: payrollDate, daysUntil: Math.max(0, daysUntil) }
}

async function runAlertCheck(force = false): Promise<'sent' | 'dry-run' | 'skipped'> {
  const schedule = readJson<AgentSchedule>(SCHED_FILE, defaultSchedule)
  const status   = readJson<AgentStatus>(STATUS_FILE, defaultStatus)

  if (!schedule.enabled && !force) {
    console.log('[agent] Schedule disabled, skipping check')
    return 'skipped'
  }
  if (!schedule.recipientEmail) {
    console.log('[agent] No recipient email configured')
    return 'skipped'
  }

  const { date: payrollDate, daysUntil } = getNextPayrollDate(schedule.payrollDay, schedule.timezone)

  // Fire when daysUntil <= alertDaysBefore (or force)
  if (!force && daysUntil > schedule.alertDaysBefore) {
    const nextAlertDate = new Date(payrollDate.getTime() - schedule.alertDaysBefore * 86_400_000)
    writeJson(STATUS_FILE, { ...status, nextAlertDate: nextAlertDate.toISOString() })
    console.log(`[agent] No alert needed. Payroll in ${daysUntil}d. Alert fires at ${daysUntil - schedule.alertDaysBefore}d prior.`)
    return 'skipped'
  }

  // Avoid duplicate sends: check if already sent today
  if (!force && status.lastRunAt) {
    const lastDate = new Date(status.lastRunAt).toDateString()
    if (lastDate === new Date().toDateString()) {
      console.log('[agent] Already sent alert today')
      return 'skipped'
    }
  }

  // Fetch employees and rates
  const employees = readJson<Employee[]>(EMP_FILE, [])
  if (employees.length === 0 && !force) {
    console.log('[agent] No employees found')
    return 'skipped'
  }

  // Fetch rates for every currency used by employees
  const currencies = employees.map(e => e.currency)
  const rates   = await fetchRatesForCurrencies(currencies)
  const withAmt = computeAmounts(employees, rates)

  const payrollDateStr = payrollDate.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  const subject = daysUntil === 0
    ? `🚨 SooAgent: Payroll runs today — ${employees.length} employees, review now`
    : daysUntil === 1
    ? `🔔 SooAgent: Payroll runs tomorrow — ${employees.length} employees`
    : `📅 SooAgent: Payroll in ${daysUntil} days — ${payrollDateStr}`

  const html = renderEmail(withAmt, schedule, rates, payrollDateStr, daysUntil)

  let result: 'sent' | 'dry-run' | 'skipped' = 'skipped'
  let error: string | null = null

  try {
    result = await sendEmail(schedule.recipientEmail, subject, html)
  } catch (e) {
    error = (e as Error).message
    console.error('[agent] Email failed:', error)
    writeJson(STATUS_FILE, {
      ...status,
      lastRunAt: Date.now(),
      lastRunResult: 'failed',
      lastRunError: error,
    })
    return 'skipped'
  }

  const newStatus: AgentStatus = {
    lastRunAt: Date.now(),
    lastRunResult: result,
    lastRunError: null,
    emailsSentTotal: (status.emailsSentTotal ?? 0) + 1,
    nextAlertDate: null,
  }
  writeJson(STATUS_FILE, newStatus)
  return result
}

// ── Scheduler (check every hour) ─────────────────────────────────────────────

setInterval(() => {
  runAlertCheck().catch(e => console.error('[agent] Scheduler error:', e))
}, 60 * 60 * 1000)

// Run once at startup after a short delay
setTimeout(() => {
  runAlertCheck().catch(e => console.error('[agent] Startup check error:', e))
}, 5000)

// ── HTTP server ───────────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

serve({
  port: 3002,
  async fetch(req) {
    const url = new URL(req.url)

    // CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS })
    }

    // GET /api/agent/schedule
    if (req.method === 'GET' && url.pathname === '/api/agent/schedule') {
      const s = readJson<AgentSchedule>(SCHED_FILE, defaultSchedule)
      // Never return sensitive data to frontend (email is fine — user set it)
      return json(s)
    }

    // POST /api/agent/schedule
    if (req.method === 'POST' && url.pathname === '/api/agent/schedule') {
      try {
        const body = await req.json() as Partial<AgentSchedule>
        const existing = readJson<AgentSchedule>(SCHED_FILE, defaultSchedule)
        const updated: AgentSchedule = {
          ...existing,
          ...body,
          updatedAt: Date.now(),
        }
        // Validate
        if (updated.payrollDay < 1 || updated.payrollDay > 31)
          return json({ error: 'payrollDay must be 1-31' }, 400)
        if (updated.alertDaysBefore < 1 || updated.alertDaysBefore > 30)
          return json({ error: 'alertDaysBefore must be 1-30' }, 400)
        if (updated.recipientEmail && !updated.recipientEmail.includes('@'))
          return json({ error: 'invalid email' }, 400)

        writeJson(SCHED_FILE, updated)
        return json({ ok: true, schedule: updated })
      } catch (e) {
        return json({ error: (e as Error).message }, 500)
      }
    }

    // POST /api/agent/employees  (frontend syncs employee list here)
    if (req.method === 'POST' && url.pathname === '/api/agent/employees') {
      try {
        const body = await req.json() as Employee[]
        writeJson(EMP_FILE, body)
        return json({ ok: true, count: body.length })
      } catch (e) {
        return json({ error: (e as Error).message }, 500)
      }
    }

    // POST /api/agent/send-now  (manual trigger)
    if (req.method === 'POST' && url.pathname === '/api/agent/send-now') {
      try {
        const result = await runAlertCheck(true)
        return json({ ok: true, result })
      } catch (e) {
        return json({ error: (e as Error).message }, 500)
      }
    }

    // POST /api/agent/test-email  (send test with no employee data)
    if (req.method === 'POST' && url.pathname === '/api/agent/test-email') {
      try {
        const schedule = readJson<AgentSchedule>(SCHED_FILE, defaultSchedule)
        if (!schedule.recipientEmail) return json({ error: 'No email configured' }, 400)
        const fakeEmployees: EmployeeWithAmounts[] = [
          {
            id: 'test-1', name: 'Test Employee', address: '0x0000…0001',
            currency: 'BDT', salaryAmount: '50000', paymentAsset: 'USDC',
            usdEquivalent: 413.22, cryptoAmount: 413.22, cryptoDisplay: '413.22 USDC',
          },
        ]
        const rates = await fetchRatesForCurrencies(['BDT', 'USD'])
        const html = renderEmail(fakeEmployees, schedule, rates, 'October 25, 2026', 3)
        const result = await sendEmail(schedule.recipientEmail, '📧 SooAgent — Test Email', html)
        return json({ ok: true, result })
      } catch (e) {
        return json({ error: (e as Error).message }, 500)
      }
    }

    // GET /api/agent/status
    if (req.method === 'GET' && url.pathname === '/api/agent/status') {
      const status   = readJson<AgentStatus>(STATUS_FILE, defaultStatus)
      const schedule = readJson<AgentSchedule>(SCHED_FILE, defaultSchedule)
      const employees = readJson<Employee[]>(EMP_FILE, [])

      let nextAlert: string | null = null
      if (schedule.enabled && schedule.payrollDay) {
        const { date, daysUntil } = getNextPayrollDate(schedule.payrollDay, schedule.timezone)
        const alertDate = new Date(date.getTime() - schedule.alertDaysBefore * 86_400_000)
        nextAlert = alertDate.toISOString()
        void daysUntil
      }

      return json({
        ...status,
        nextAlertDate: nextAlert,
        employeeCount: employees.length,
        dryRunMode: !process.env.RESEND_API_KEY,
      })
    }

    // GET /api/agent/preview-email  (return HTML for preview)
    if (req.method === 'GET' && url.pathname === '/api/agent/preview-email') {
      const schedule  = readJson<AgentSchedule>(SCHED_FILE, defaultSchedule)
      const employees = readJson<Employee[]>(EMP_FILE, [])
      const currencies = employees.map((e: Employee) => e.currency)
      const rates     = await fetchRatesForCurrencies(currencies.length ? currencies : ['USD'])
      const withAmt   = computeAmounts(employees, rates)
      const html      = renderEmail(withAmt, schedule, rates, 'October 25, 2026 (preview)', 3)
      return new Response(html, { headers: { ...CORS, 'Content-Type': 'text/html; charset=utf-8' } })
    }

    // GET /api/agent/resend-status  — returns whether a key is saved (never the key itself)
    if (req.method === 'GET' && url.pathname === '/api/agent/resend-status') {
      const active = getResendKey()
      const userSaved = existsSync(KEY_FILE) && (() => {
        try { const k = readFileSync(KEY_FILE, 'utf-8').trim(); return k.startsWith('re_') } catch { return false }
      })()
      return json({
        hasKey: !!active,
        source: userSaved ? 'user' : (process.env.RESEND_API_KEY ? 'env' : 'none'),
        // Show only first 8 + last 4 chars as a hint — never the full key
        hint: active ? `${active.slice(0, 8)}…${active.slice(-4)}` : null,
      })
    }

    // POST /api/agent/resend-key  — save user-supplied Resend API key server-side
    if (req.method === 'POST' && url.pathname === '/api/agent/resend-key') {
      try {
        const body = await req.json() as { key?: string; action?: 'delete' }

        // Delete key
        if (body.action === 'delete') {
          try { unlinkSync(KEY_FILE) } catch { /* already gone */ }
          return json({ ok: true, deleted: true })
        }

        const key = (body.key ?? '').trim()
        if (!key) return json({ error: 'No key provided' }, 400)
        if (!key.startsWith('re_')) return json({ error: 'Invalid Resend key — must start with re_' }, 400)

        // Verify key against Resend before saving
        const testRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: `SooAgent <${key.slice(0, 10)}@resend.dev>`,
            to: ['delivered@resend.dev'],
            subject: 'SooAgent key verification',
            html: '<p>Key verified.</p>',
          }),
          signal: AbortSignal.timeout(12_000),
        })

        // 200 = delivered, 422 = from-address issue but key is valid, 403 = domain restriction but key is valid
        const accepted = testRes.status === 200 || testRes.status === 422 || testRes.status === 403
        if (!accepted && testRes.status === 401) {
          return json({ error: 'Resend rejected this key — check it and try again' }, 400)
        }

        // Save key to file (server-side only — never sent back to client)
        writeFileSync(KEY_FILE, key, 'utf-8')
        console.log('[agent] Resend API key saved by user')

        return json({
          ok: true,
          hint: `${key.slice(0, 8)}…${key.slice(-4)}`,
          source: 'user',
        })
      } catch (e) {
        return json({ error: (e as Error).message }, 500)
      }
    }

    return json({ error: 'Not found' }, 404)
  },
})

console.log('[agent] SooAgent running on port 3002')
