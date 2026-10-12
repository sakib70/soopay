/**
 * Payroll overview — lists employees with live FX quotes, links to Review.
 * Actual payment happens in PayrollReview.
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Users, Plus, ChevronRight, AlertTriangle, Bitcoin, DollarSign, RefreshCw } from 'lucide-react'
import { useAccount } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { EmptyState } from '@/components/EmptyState'
import { useFx, localToUsdcRaw, localToCirBtcRaw } from '@/hooks/useFx'
import { useCurrency } from '@/hooks/useCurrency'
import { getEmployees } from '@/lib/storage'
import { ARC_TESTNET_CHAIN_ID, CURRENCIES, CIRBTC_CONFIGURED } from '@/lib/constants'
import { formatUsdcAmount, formatCirBtcAmount, formatAddress } from '@/lib/utils'
import { useBalances } from '@/hooks/useBalances'

export function Payroll() {
  const { isConnected, chainId } = useAccount()
  const { currency } = useCurrency()
  const { rates, loading: ratesLoading, refresh } = useFx(currency)
  const { cirBtcDecimals = 8 } = useBalances()
  const [employees] = useState(() => getEmployees())

  const isWrongChain = isConnected && chainId !== ARC_TESTNET_CHAIN_ID

  const usdcCount = employees.filter((e) => e.paymentAsset === 'USDC').length
  const cirBtcCount = employees.filter((e) => e.paymentAsset === 'cirBTC' && CIRBTC_CONFIGURED).length

  // Totals
  const totalUsdcRaw = employees
    .filter((e) => e.paymentAsset === 'USDC')
    .reduce((sum, e) => sum + (rates ? localToUsdcRaw(e.salaryAmount, rates.localToUsd) : 0n), 0n)

  const totalCirBtcRaw = employees
    .filter((e) => e.paymentAsset === 'cirBTC' && CIRBTC_CONFIGURED)
    .reduce((sum, e) => sum + (rates ? localToCirBtcRaw(e.salaryAmount, rates.localToBtc, cirBtcDecimals) : 0n), 0n)

  return (
    <div className="max-w-lg mx-auto px-4 py-6 pb-28 md:pb-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="display text-2xl font-bold" style={{ color: 'var(--ink)' }}>Payroll</h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--subtle)' }}>
            Pay in local currency, settle in USDC or cirBTC
          </p>
        </div>
        <Link
          to="/payroll/employees"
          className="flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold text-white"
          style={{ background: 'var(--accent)' }}
        >
          <Plus className="size-3.5" />
          Employees
        </Link>
      </div>

      {/* Wrong chain */}
      {isWrongChain && (
        <div className="rounded-2xl px-4 py-3 flex items-center gap-2" style={{ background: 'rgba(192,41,63,0.08)' }}>
          <AlertTriangle className="size-4 shrink-0" style={{ color: 'var(--danger)' }} />
          <p className="text-sm" style={{ color: 'var(--danger)' }}>Switch to Arc Testnet to run payroll</p>
        </div>
      )}

      {/* Totals card */}
      {employees.length > 0 && (
        <div
          className="rounded-2xl p-4 space-y-3"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
              This month's total
            </h3>
            <button
              onClick={refresh}
              disabled={ratesLoading}
              className="rounded-lg p-1 hover:bg-black/5 transition-all disabled:opacity-40"
            >
              <RefreshCw className={`size-3.5 ${ratesLoading ? 'animate-spin' : ''}`} style={{ color: 'var(--subtle)' }} />
            </button>
          </div>

          {usdcCount > 0 && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="size-6 rounded-full flex items-center justify-center" style={{ background: 'rgba(22,120,74,0.10)' }}>
                  <DollarSign className="size-3" style={{ color: 'var(--success)' }} />
                </div>
                <span className="text-sm" style={{ color: 'var(--muted)' }}>{usdcCount} USDC employees</span>
              </div>
              <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                {rates ? formatUsdcAmount(totalUsdcRaw, 2) : '…'} USDC
              </span>
            </div>
          )}

          {cirBtcCount > 0 && CIRBTC_CONFIGURED && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="size-6 rounded-full flex items-center justify-center" style={{ background: 'rgba(160,92,16,0.10)' }}>
                  <Bitcoin className="size-3" style={{ color: 'var(--warning)' }} />
                </div>
                <span className="text-sm" style={{ color: 'var(--muted)' }}>{cirBtcCount} cirBTC employees</span>
              </div>
              <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                {rates ? formatCirBtcAmount(totalCirBtcRaw, cirBtcDecimals) : '…'} cirBTC
              </span>
            </div>
          )}

          {usdcCount + cirBtcCount > 1 && (
            <p className="text-xs" style={{ color: 'var(--subtle)' }}>
              {usdcCount + cirBtcCount > 0 && (usdcCount > 0 && cirBtcCount > 0) && (
                'Two batches will be sent: one USDC, one cirBTC.'
              )}
            </p>
          )}
        </div>
      )}

      {/* Employee list */}
      {!isConnected ? (
        <ConnectKitButton.Custom>
          {({ show }) => (
            <div className="text-center py-8">
              <p className="text-sm mb-3" style={{ color: 'var(--muted)' }}>Connect wallet to run payroll</p>
              <button
                onClick={show}
                className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white"
                style={{ background: 'var(--accent)' }}
              >
                Connect Wallet
              </button>
            </div>
          )}
        </ConnectKitButton.Custom>
      ) : employees.length === 0 ? (
        <EmptyState
          Icon={Users}
          title="No employees"
          description="Add employees to run payroll"
          action={
            <Link
              to="/payroll/employees"
              className="rounded-xl px-4 py-2 text-sm font-semibold text-white"
              style={{ background: 'var(--accent)' }}
            >
              Add employees
            </Link>
          }
        />
      ) : (
        <div className="space-y-2">
          {employees.map((emp) => {
            const currencyInfo = CURRENCIES.find((c) => c.code === emp.currency)
            const isUSDC = emp.paymentAsset === 'USDC'
            const raw = isUSDC && rates
              ? localToUsdcRaw(emp.salaryAmount, rates.localToUsd)
              : !isUSDC && rates
                ? localToCirBtcRaw(emp.salaryAmount, rates.localToBtc, cirBtcDecimals)
                : null

            return (
              <div
                key={emp.id}
                className="rounded-2xl p-4 flex items-center gap-3"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
              >
                {/* Avatar */}
                <div
                  className="size-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                  style={{ background: isUSDC ? 'var(--accent)' : 'var(--warning)' }}
                >
                  {emp.name.slice(0, 2).toUpperCase()}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{emp.name}</p>
                    <span
                      className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold flex items-center gap-0.5"
                      style={{
                        background: isUSDC ? 'rgba(22,120,74,0.10)' : 'rgba(160,92,16,0.12)',
                        color: isUSDC ? 'var(--success)' : 'var(--warning)',
                      }}
                    >
                      {isUSDC ? <DollarSign className="size-2.5" /> : <Bitcoin className="size-2.5" />}
                      {emp.paymentAsset}
                    </span>
                  </div>
                  {(emp.designation || emp.employeeId) && (
                    <p className="text-xs truncate" style={{ color: 'var(--subtle)' }}>
                      {emp.designation}{emp.designation && emp.employeeId ? ' · ' : ''}{emp.employeeId}
                    </p>
                  )}
                  <p className="text-xs mono truncate" style={{ color: 'var(--subtle)' }}>
                    {formatAddress(emp.address)}
                  </p>
                  <p className="text-xs mt-0.5 tabular-nums" style={{ color: 'var(--muted)' }}>
                    {currencyInfo?.symbol}{emp.salaryAmount} {emp.currency}
                    {raw !== null && (
                      <span className="ml-1.5" style={{ color: 'var(--subtle)' }}>
                        ≈ {isUSDC
                          ? `${formatUsdcAmount(raw, 2)} USDC`
                          : `${formatCirBtcAmount(raw, cirBtcDecimals)} cirBTC`
                        }
                      </span>
                    )}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Run payroll CTA */}
      {isConnected && employees.length > 0 && (
        <Link
          to="/payroll/review"
          className="flex items-center justify-between w-full rounded-2xl px-5 py-4 text-sm font-bold text-white transition-all hover:scale-[1.01] active:scale-[0.99]"
          style={{ background: isWrongChain ? 'var(--danger)' : 'var(--accent)' }}
        >
          <span>Review & Pay {usdcCount + cirBtcCount} Employees</span>
          <ChevronRight className="size-4" />
        </Link>
      )}

      {/* Manage link */}
      <Link
        to="/payroll/employees"
        className="flex items-center justify-between rounded-2xl px-4 py-3 transition-all hover:bg-black/5"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>Manage Employees</span>
        <ChevronRight className="size-4" style={{ color: 'var(--subtle)' }} />
      </Link>
    </div>
  )
}
