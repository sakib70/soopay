/**
 * PayrollReview — shows full FX-based breakdown for all employees, handles
 * approval (if needed) and batchPay via the SoopayPayroll contract.
 *
 * Two separate batches may run: one USDC, one cirBTC.
 * Each batch goes through: check allowance → approve if needed → batchPay.
 */
import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, AlertTriangle, Info, RefreshCw, CheckCircle2,
  Bitcoin, DollarSign, Users, Loader2, ExternalLink, ChevronDown, ChevronUp,
} from 'lucide-react'
import {
  useAccount, useWriteContract, useWaitForTransactionReceipt,
  useReadContract,
} from 'wagmi'
import { erc20Abi } from 'viem'
import { ConnectKitButton } from 'connectkit'
import { toast } from 'sonner'
import { useFx, localToUsdcRaw, localToCirBtcRaw } from '@/hooks/useFx'
import { useSafeChainSwitch } from '@/hooks/useSafeChainSwitch'
import { useCurrency } from '@/hooks/useCurrency'
import { useBalances } from '@/hooks/useBalances'
import { getEmployees, recordActivity } from '@/lib/storage'
import {
  ARC_TESTNET_CHAIN_ID, USDC_ADDRESS, CIRBTC_ADDRESS, CIRBTC_CONFIGURED,
  PAYROLL_CONTRACT_ADDRESS, PAYROLL_ABI, CURRENCIES,
} from '@/lib/constants'
import {
  formatUsdcAmount, formatCirBtcAmount, formatAddress,
  buildArcScanTxUrl,
} from '@/lib/utils'


const MAX_BATCH = 100

function parseOnchainError(error: unknown): string {
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase()
  if (msg.includes('user rejected') || msg.includes('user denied') || msg.includes('4001'))
    return 'Transaction cancelled.'
  if (msg.includes('insufficient') || msg.includes('exceeds balance'))
    return 'Insufficient balance.'
  if (msg.includes('reverted'))
    return 'Transaction reverted. Check your balance and allowance.'
  return 'Something went wrong. Please try again.'
}

type BatchPhase =
  | 'idle'
  | 'approving_usdc'
  | 'paying_usdc'
  | 'approving_cirbtc'
  | 'paying_cirbtc'
  | 'done'
  | 'error'

interface BatchResult {
  asset: 'USDC' | 'cirBTC'
  txHash: string
  successCount: number
  totalPaid: bigint
}

export function PayrollReview() {
  const navigate = useNavigate()
  const { address, isConnected, chainId } = useAccount()
  const { safeSwitch, isPending: isSwitching } = useSafeChainSwitch()
  const { currency } = useCurrency()
  const { rates, loading: ratesLoading, refresh: refreshRates } = useFx(currency)
  const { usdc, cirBtc, cirBtcDecimals = 8, refetch: refetchBalances } = useBalances()

  const [employees, setEmployees] = useState(() => getEmployees())

  // Reload employees when the page becomes visible (user may have edited them)
  useEffect(() => {
    setEmployees(getEmployees())
  }, [])

  // Split into USDC and cirBTC batches (chunk at MAX_BATCH each)
  const usdcEmployees = employees.filter((e) => e.paymentAsset === 'USDC').slice(0, MAX_BATCH)
  const cirBtcEmployees = employees.filter((e) => e.paymentAsset === 'cirBTC').slice(0, MAX_BATCH)

  const isWrongChain = isConnected && chainId !== ARC_TESTNET_CHAIN_ID

  // Calculated amounts (recomputed when rates change)
  const usdcAmounts: bigint[] = usdcEmployees.map((e) =>
    rates ? localToUsdcRaw(e.salaryAmount, rates.localToUsd) : 0n
  )
  const cirBtcAmounts: bigint[] = cirBtcEmployees.map((e) =>
    rates ? localToCirBtcRaw(e.salaryAmount, rates.localToBtc, cirBtcDecimals) : 0n
  )

  const totalUsdcRaw = usdcAmounts.reduce((s, a) => s + a, 0n)
  const totalCirBtcRaw = cirBtcAmounts.reduce((s, a) => s + a, 0n)

  const usdcBalance = usdc ?? 0n
  const cirBtcBalance = cirBtc ?? 0n
  const insufficientUsdc = totalUsdcRaw > usdcBalance && usdcEmployees.length > 0
  const insufficientCirBtc = totalCirBtcRaw > cirBtcBalance && cirBtcEmployees.length > 0

  // Allowance reads
  const { data: usdcAllowance, refetch: refetchUsdcAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [address!, PAYROLL_CONTRACT_ADDRESS],
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { enabled: isConnected && !!address },
  })

  const { data: cirBtcAllowance, refetch: refetchCirBtcAllowance } = useReadContract({
    address: CIRBTC_CONFIGURED ? (CIRBTC_ADDRESS) : USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [address!, PAYROLL_CONTRACT_ADDRESS],
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { enabled: isConnected && !!address && CIRBTC_CONFIGURED && cirBtcEmployees.length > 0 },
  })

  const needsUsdcApproval = usdcEmployees.length > 0 &&
    (usdcAllowance === undefined || (usdcAllowance) < totalUsdcRaw)
  const needsCirBtcApproval = cirBtcEmployees.length > 0 && CIRBTC_CONFIGURED &&
    (cirBtcAllowance === undefined || (cirBtcAllowance) < totalCirBtcRaw)

  // Execution state
  const [phase, setPhase] = useState<BatchPhase>('idle')
  const [txHash, setTxHash] = useState<string | undefined>()
  const [errorMsg, setErrorMsg] = useState<string | undefined>()
  const [results, setResults] = useState<BatchResult[]>([])
  const [showDetails, setShowDetails] = useState(false)

  const confirmedRef = useRef<string | undefined>(undefined)

  // Snapshot amounts at handleStart time so the same values are used for
  // both the approval AND the batchPay — prevents stale-closure drift.
  const frozenUsdcAmounts = useRef<bigint[]>([])
  const frozenCirBtcAmounts = useRef<bigint[]>([])

  const { writeContract, isPending: isTxPending } = useWriteContract({
    mutation: {
      onSuccess: (hash) => { setTxHash(hash) },
      onError: (err) => {
        const msg = parseOnchainError(err)
        setPhase('error')
        setErrorMsg(msg)
        toast.error(msg)
      },
    },
  })

  const { isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: txHash as `0x${string}` | undefined,
    query: { enabled: !!txHash },
  })

  // Handle confirmed transactions — advance the phase
  useEffect(() => {
    if (!isConfirmed || !txHash || confirmedRef.current === txHash) return
    confirmedRef.current = txHash

    if (phase === 'approving_usdc') {
      void refetchUsdcAllowance()
      toast.success('USDC approved')
      setTxHash(undefined)
      setPhase('paying_usdc')
      // Auto-proceed to batchPay USDC
      runUsdcBatch()
    } else if (phase === 'approving_cirbtc') {
      void refetchCirBtcAllowance()
      toast.success('cirBTC approved')
      setTxHash(undefined)
      setPhase('paying_cirbtc')
      runCirBtcBatch()
    } else if (phase === 'paying_usdc') {
      // Extract result from receipt logs if possible (fallback: estimate)
      const usdcResult: BatchResult = {
        asset: 'USDC',
        txHash,
        successCount: usdcEmployees.length,
        totalPaid: totalUsdcRaw,
      }
      setResults((prev) => [...prev, usdcResult])
      recordActivity({
        type: 'payroll',
        asset: 'USDC',
        txHash,
        from: address,
        to: PAYROLL_CONTRACT_ADDRESS,
        amountRaw: totalUsdcRaw.toString(),
        decimals: 6,
        localCurrency: currency,
        employeeCount: usdcEmployees.length,
        status: 'confirmed',
        timestamp: Date.now(),
      })
      refetchBalances()
      toast.success(`USDC payroll sent to ${usdcEmployees.length} employees`)

      // Move to cirBTC phase if needed
      if (cirBtcEmployees.length > 0 && CIRBTC_CONFIGURED) {
        setTxHash(undefined)
        if (needsCirBtcApproval) {
          setPhase('approving_cirbtc')
          runCirBtcApprove()
        } else {
          setPhase('paying_cirbtc')
          runCirBtcBatch()
        }
      } else {
        setPhase('done')
      }
    } else if (phase === 'paying_cirbtc') {
      const cirBtcResult: BatchResult = {
        asset: 'cirBTC',
        txHash,
        successCount: cirBtcEmployees.length,
        totalPaid: totalCirBtcRaw,
      }
      setResults((prev) => [...prev, cirBtcResult])
      recordActivity({
        type: 'payroll',
        asset: 'cirBTC',
        txHash,
        from: address,
        to: PAYROLL_CONTRACT_ADDRESS,
        amountRaw: totalCirBtcRaw.toString(),
        decimals: cirBtcDecimals,
        localCurrency: currency,
        employeeCount: cirBtcEmployees.length,
        status: 'confirmed',
        timestamp: Date.now(),
      })
      refetchBalances()
      toast.success(`cirBTC payroll sent to ${cirBtcEmployees.length} employees`)
      setPhase('done')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfirmed, txHash])

  // ── Execution helpers — use FROZEN amounts from handleStart snapshot ───────────

  const runUsdcApprove = () => {
    const amounts = frozenUsdcAmounts.current
    if (amounts.length === 0) {
      toast.error('No USDC amounts — click Pay All to start')
      return
    }
    const total = amounts.reduce((s, a) => s + a, 0n)
    writeContract({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: 'approve',
      args: [PAYROLL_CONTRACT_ADDRESS, total],
      chainId: ARC_TESTNET_CHAIN_ID,
    })
  }

  const runUsdcBatch = () => {
    const amounts = frozenUsdcAmounts.current
    if (amounts.length === 0 || usdcEmployees.length === 0) {
      toast.error('No USDC employees to pay')
      setPhase('error')
      setErrorMsg('No USDC employees')
      return
    }
    if (amounts.some((a) => a === 0n)) {
      toast.error('Some USDC amounts are zero — check employee salaries and FX rates')
      setPhase('error')
      setErrorMsg('Zero amount detected')
      return
    }
    writeContract({
      address: PAYROLL_CONTRACT_ADDRESS,
      abi: PAYROLL_ABI,
      functionName: 'batchPay',
      args: [
        USDC_ADDRESS,
        usdcEmployees.map((e) => e.address as `0x${string}`),
        amounts,
      ],
      chainId: ARC_TESTNET_CHAIN_ID,
    })
  }

  const runCirBtcApprove = () => {
    const amounts = frozenCirBtcAmounts.current
    if (amounts.length === 0) {
      toast.error('No cirBTC amounts — click Pay All to start')
      return
    }
    const total = amounts.reduce((s, a) => s + a, 0n)
    writeContract({
      address: CIRBTC_ADDRESS,
      abi: erc20Abi,
      functionName: 'approve',
      args: [PAYROLL_CONTRACT_ADDRESS, total],
      chainId: ARC_TESTNET_CHAIN_ID,
    })
  }

  const runCirBtcBatch = () => {
    const amounts = frozenCirBtcAmounts.current
    if (amounts.length === 0 || cirBtcEmployees.length === 0) {
      toast.error('No cirBTC employees to pay')
      setPhase('error')
      setErrorMsg('No cirBTC employees')
      return
    }
    if (amounts.some((a) => a === 0n)) {
      toast.error('Some cirBTC amounts are zero — check employee salaries and FX rates')
      setPhase('error')
      setErrorMsg('Zero amount detected')
      return
    }
    writeContract({
      address: PAYROLL_CONTRACT_ADDRESS,
      abi: PAYROLL_ABI,
      functionName: 'batchPay',
      args: [
        CIRBTC_ADDRESS,
        cirBtcEmployees.map((e) => e.address as `0x${string}`),
        amounts,
      ],
      chainId: ARC_TESTNET_CHAIN_ID,
    })
  }

  const handleStart = () => {
    if (!isConnected) return
    if (isWrongChain) { void safeSwitch(ARC_TESTNET_CHAIN_ID); return }
    if (!rates) { toast.error('FX rates not loaded — please wait a moment'); return }
    if (employees.length === 0) { toast.error('No employees to pay'); return }

    // Snapshot amounts from current rates at execution time.
    // Both approve and batchPay use the same frozen values — amounts are guaranteed to match.
    // We do NOT refresh rates here because the new fetch would return after the snapshot.
    const usdcSnap = usdcEmployees.map((e) => localToUsdcRaw(e.salaryAmount, rates.localToUsd))
    const cirBtcSnap = cirBtcEmployees.map((e) => localToCirBtcRaw(e.salaryAmount, rates.localToBtc, cirBtcDecimals))

    if (usdcSnap.some((a) => a === 0n) && usdcEmployees.length > 0) {
      toast.error('Some USDC amounts are zero — check employee salaries')
      return
    }
    if (cirBtcSnap.some((a) => a === 0n) && cirBtcEmployees.length > 0) {
      toast.error('Some cirBTC amounts are zero — check employee salaries')
      return
    }

    frozenUsdcAmounts.current = usdcSnap
    frozenCirBtcAmounts.current = cirBtcSnap

    if (usdcEmployees.length > 0) {
      // Re-check allowance against the freshly snapped total
      const usdcTotal = usdcSnap.reduce((s, a) => s + a, 0n)
      const mustApproveUsdc = usdcAllowance === undefined || usdcAllowance < usdcTotal
      if (mustApproveUsdc) {
        setPhase('approving_usdc')
        runUsdcApprove()
      } else {
        setPhase('paying_usdc')
        runUsdcBatch()
      }
    } else if (cirBtcEmployees.length > 0) {
      const cirBtcTotal = cirBtcSnap.reduce((s, a) => s + a, 0n)
      const mustApproveCirBtc = cirBtcAllowance === undefined || cirBtcAllowance < cirBtcTotal
      if (mustApproveCirBtc) {
        setPhase('approving_cirbtc')
        runCirBtcApprove()
      } else {
        setPhase('paying_cirbtc')
        runCirBtcBatch()
      }
    }
  }

  const resetAll = () => {
    setPhase('idle')
    setTxHash(undefined)
    setErrorMsg(undefined)
    setResults([])
    confirmedRef.current = undefined
  }

  // ── Phase label ───────────────────────────────────────────────────────────────

  const phaseLabel: Record<BatchPhase, string> = {
    idle: '',
    approving_usdc: 'Approving USDC spend...',
    paying_usdc: 'Sending USDC payroll...',
    approving_cirbtc: 'Approving cirBTC spend...',
    paying_cirbtc: 'Sending cirBTC payroll...',
    done: 'Payroll complete',
    error: 'Error',
  }

  const isRunning = ['approving_usdc', 'paying_usdc', 'approving_cirbtc', 'paying_cirbtc'].includes(phase)

  const totalEmployees = usdcEmployees.length + cirBtcEmployees.length

  // ─── Render ──────────────────────────────────────────────────────────────────

  if (employees.length === 0) {
    return (
      <div className="max-w-lg mx-auto px-4 py-6 pb-28 md:pb-6">
        <div className="flex items-center gap-3 mb-6">
          <Link to="/payroll" className="rounded-xl p-2 hover:bg-black/5 transition-all">
            <ArrowLeft className="size-4" style={{ color: 'var(--ink)' }} />
          </Link>
          <h2 className="display text-xl font-bold" style={{ color: 'var(--ink)' }}>Payroll Review</h2>
        </div>
        <div className="rounded-2xl p-8 text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <Users className="size-10 mx-auto mb-3" style={{ color: 'var(--subtle)' }} />
          <p className="text-sm font-semibold mb-1" style={{ color: 'var(--ink)' }}>No employees</p>
          <p className="text-xs mb-4" style={{ color: 'var(--subtle)' }}>Add employees before running payroll.</p>
          <Link
            to="/payroll/employees"
            className="rounded-xl px-4 py-2 text-sm font-semibold text-white inline-block"
            style={{ background: 'var(--accent)' }}
          >
            Add employees
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6 pb-28 md:pb-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to="/payroll" className="rounded-xl p-2 hover:bg-black/5 transition-all">
          <ArrowLeft className="size-4" style={{ color: 'var(--ink)' }} />
        </Link>
        <div className="flex-1">
          <h2 className="display text-xl font-bold" style={{ color: 'var(--ink)' }}>Payroll Review</h2>
          <p className="text-xs" style={{ color: 'var(--subtle)' }}>
            {totalEmployees} employee{totalEmployees !== 1 ? 's' : ''} · live FX rates
          </p>
        </div>
        <button
          onClick={() => { refreshRates(); toast.success('Rates refreshed') }}
          disabled={ratesLoading}
          className="rounded-xl p-2 hover:bg-black/5 transition-all disabled:opacity-40"
          title="Refresh rates"
        >
          <RefreshCw className={`size-4 ${ratesLoading ? 'animate-spin' : ''}`} style={{ color: 'var(--subtle)' }} />
        </button>
      </div>

      {/* Wrong chain */}
      {isWrongChain && (
        <div className="rounded-2xl px-4 py-3 flex items-center gap-2" style={{ background: 'rgba(192,41,63,0.08)' }}>
          <AlertTriangle className="size-4 shrink-0" style={{ color: 'var(--danger)' }} />
          <p className="text-sm" style={{ color: 'var(--danger)' }}>Switch to Arc Testnet to run payroll</p>
        </div>
      )}

      {/* FX warning */}
      <div
        className="rounded-2xl px-4 py-3 flex items-start gap-2"
        style={{ background: 'rgba(160,92,16,0.06)', border: '1px solid rgba(160,92,16,0.15)' }}
      >
        <Info className="size-4 shrink-0 mt-0.5" style={{ color: 'var(--warning)' }} />
        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          Crypto amounts are calculated at the current exchange rate and may change slightly before you sign. Only the blockchain amount is transferred — local currency is for reference only.
        </p>
      </div>

      {/* Totals summary */}
      <div
        className="rounded-2xl p-4 space-y-3"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <h3 className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
          Summary
        </h3>
        {usdcEmployees.length > 0 && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="size-7 rounded-full flex items-center justify-center" style={{ background: 'rgba(22,120,74,0.10)' }}>
                <DollarSign className="size-3.5" style={{ color: 'var(--success)' }} />
              </div>
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                  USDC Payroll
                </p>
                <p className="text-xs" style={{ color: 'var(--subtle)' }}>{usdcEmployees.length} employees</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                {rates ? formatUsdcAmount(totalUsdcRaw, 2) : '—'} USDC
              </p>
              {needsUsdcApproval && (
                <p className="text-xs" style={{ color: 'var(--warning)' }}>Approval required</p>
              )}
              {insufficientUsdc && (
                <p className="text-xs" style={{ color: 'var(--danger)' }}>Insufficient balance</p>
              )}
            </div>
          </div>
        )}
        {cirBtcEmployees.length > 0 && CIRBTC_CONFIGURED && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="size-7 rounded-full flex items-center justify-center" style={{ background: 'rgba(160,92,16,0.10)' }}>
                <Bitcoin className="size-3.5" style={{ color: 'var(--warning)' }} />
              </div>
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                  cirBTC Payroll
                </p>
                <p className="text-xs" style={{ color: 'var(--subtle)' }}>{cirBtcEmployees.length} employees</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                {rates ? formatCirBtcAmount(totalCirBtcRaw, cirBtcDecimals) : '—'} cirBTC
              </p>
              {needsCirBtcApproval && (
                <p className="text-xs" style={{ color: 'var(--warning)' }}>Approval required</p>
              )}
              {insufficientCirBtc && (
                <p className="text-xs" style={{ color: 'var(--danger)' }}>Insufficient balance</p>
              )}
            </div>
          </div>
        )}

        {/* Your balance row */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem', marginTop: '0.5rem' }}>
          <div className="flex items-center justify-between text-xs">
            <span style={{ color: 'var(--muted)' }}>Your USDC balance</span>
            <span className="tabular-nums font-medium" style={{ color: usdcBalance < totalUsdcRaw && usdcEmployees.length > 0 ? 'var(--danger)' : 'var(--ink)' }}>
              {formatUsdcAmount(usdcBalance, 2)} USDC
            </span>
          </div>
          {CIRBTC_CONFIGURED && cirBtcEmployees.length > 0 && (
            <div className="flex items-center justify-between text-xs mt-1">
              <span style={{ color: 'var(--muted)' }}>Your cirBTC balance</span>
              <span className="tabular-nums font-medium" style={{ color: cirBtcBalance < totalCirBtcRaw ? 'var(--danger)' : 'var(--ink)' }}>
                {formatCirBtcAmount(cirBtcBalance, cirBtcDecimals)} cirBTC
              </span>
            </div>
          )}
          <div className="flex items-center justify-between text-xs mt-1">
            <span style={{ color: 'var(--muted)' }}>Gas</span>
            <span style={{ color: 'var(--subtle)' }}>Paid in USDC (Arc)</span>
          </div>
          <div className="flex items-center justify-between text-xs mt-1">
            <span style={{ color: 'var(--muted)' }}>Contract</span>
            <a
              href={`https://testnet.arcscan.app/address/${PAYROLL_CONTRACT_ADDRESS}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mono font-medium hover:underline flex items-center gap-1"
              style={{ color: 'var(--accent-hover)' }}
            >
              {PAYROLL_CONTRACT_ADDRESS.slice(0, 10)}…
              <ExternalLink className="size-2.5" />
            </a>
          </div>
        </div>
      </div>

      {/* Steps if approval needed */}
      {(needsUsdcApproval || needsCirBtcApproval) && phase === 'idle' && (
        <div
          className="rounded-2xl px-4 py-3 space-y-1.5"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <p className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>Payment steps</p>
          {needsUsdcApproval && usdcEmployees.length > 0 && (
            <p className="text-xs" style={{ color: 'var(--subtle)' }}>1. Approve USDC spend for the payroll contract</p>
          )}
          {usdcEmployees.length > 0 && (
            <p className="text-xs" style={{ color: 'var(--subtle)' }}>
              {needsUsdcApproval ? '2.' : '1.'} Send USDC to {usdcEmployees.length} employee{usdcEmployees.length !== 1 ? 's' : ''}
            </p>
          )}
          {cirBtcEmployees.length > 0 && needsCirBtcApproval && (
            <p className="text-xs" style={{ color: 'var(--subtle)' }}>+. Approve cirBTC spend</p>
          )}
          {cirBtcEmployees.length > 0 && (
            <p className="text-xs" style={{ color: 'var(--subtle)' }}>
              +. Send cirBTC to {cirBtcEmployees.length} employee{cirBtcEmployees.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>
      )}

      {/* Progress */}
      {isRunning && (
        <div
          className="rounded-2xl px-4 py-4 flex items-center gap-3"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <Loader2 className="size-5 animate-spin shrink-0" style={{ color: 'var(--accent)' }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{phaseLabel[phase]}</p>
            {isTxPending && (
              <p className="text-xs mt-0.5" style={{ color: 'var(--subtle)' }}>Confirm in your wallet…</p>
            )}
            {txHash && !isTxPending && (
              <a
                href={buildArcScanTxUrl(txHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs mono hover:underline flex items-center gap-1 mt-0.5"
                style={{ color: 'var(--accent-hover)' }}
              >
                {txHash.slice(0, 14)}… <ExternalLink className="size-2.5" />
              </a>
            )}
          </div>
        </div>
      )}

      {/* Error */}
      {phase === 'error' && (
        <div className="rounded-2xl px-4 py-4 space-y-3" style={{ background: 'rgba(192,41,63,0.06)', border: '1px solid rgba(192,41,63,0.15)' }}>
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 shrink-0" style={{ color: 'var(--danger)' }} />
            <p className="text-sm font-semibold" style={{ color: 'var(--danger)' }}>Payment failed</p>
          </div>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>{errorMsg}</p>
          <button
            onClick={resetAll}
            className="rounded-xl px-4 py-2 text-sm font-semibold"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--ink)' }}
          >
            Try again
          </button>
        </div>
      )}

      {/* Success */}
      {phase === 'done' && (
        <div
          className="rounded-2xl p-5 space-y-4"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(22,120,74,0.10)' }}>
              <CheckCircle2 className="size-5" style={{ color: 'var(--success)' }} />
            </div>
            <div>
              <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Payroll complete</p>
              <p className="text-xs" style={{ color: 'var(--subtle)' }}>All transactions confirmed</p>
            </div>
          </div>
          <div className="space-y-2">
            {results.map((r) => (
              <div key={r.txHash} className="rounded-xl px-3 py-2.5" style={{ background: 'var(--surface-muted)' }}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>
                    {r.asset} — {r.successCount} payment{r.successCount !== 1 ? 's' : ''}
                  </span>
                  <a
                    href={buildArcScanTxUrl(r.txHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs flex items-center gap-1 hover:underline"
                    style={{ color: 'var(--accent-hover)' }}
                  >
                    View <ExternalLink className="size-2.5" />
                  </a>
                </div>
                <p className="text-xs mono mt-0.5" style={{ color: 'var(--subtle)' }}>
                  {r.txHash.slice(0, 18)}…
                </p>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Link
              to="/activity"
              className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-white text-center"
              style={{ background: 'var(--accent)' }}
            >
              View Activity
            </Link>
            <button
              onClick={() => void navigate('/payroll')}
              className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-center"
              style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}
            >
              Back to Payroll
            </button>
          </div>
        </div>
      )}

      {/* Employee breakdown */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <button
          onClick={() => setShowDetails((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-black/5 transition-all"
        >
          <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
            Employee breakdown ({totalEmployees})
          </span>
          {showDetails
            ? <ChevronUp className="size-4" style={{ color: 'var(--subtle)' }} />
            : <ChevronDown className="size-4" style={{ color: 'var(--subtle)' }} />
          }
        </button>

        {showDetails && (
          <div className="divide-y" style={{ borderTop: '1px solid var(--border)' }}>
            {[...usdcEmployees, ...cirBtcEmployees].map((emp, i) => {
              const isUSDC = emp.paymentAsset === 'USDC'
              const raw = isUSDC ? usdcAmounts[i < usdcEmployees.length ? i : 0] : cirBtcAmounts[i - usdcEmployees.length]
              const currInfo = CURRENCIES.find((c) => c.code === emp.currency)

              return (
                <div key={emp.id} className="px-4 py-3 flex items-center gap-3">
                  <div
                    className="size-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                    style={{ background: isUSDC ? 'var(--accent)' : 'var(--warning)' }}
                  >
                    {emp.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{emp.name}</p>
                    {(emp.designation || emp.employeeId) && (
                      <p className="text-xs truncate" style={{ color: 'var(--subtle)' }}>
                        {emp.designation}{emp.designation && emp.employeeId ? ' · ' : ''}{emp.employeeId}
                      </p>
                    )}
                    <p className="text-xs mono truncate" style={{ color: 'var(--subtle)' }}>
                      {formatAddress(emp.address)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs tabular-nums" style={{ color: 'var(--muted)' }}>
                      {currInfo?.symbol}{emp.salaryAmount} {emp.currency}
                    </p>
                    <p className="text-xs font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>
                      {rates
                        ? isUSDC
                          ? `${formatUsdcAmount(raw ?? 0n, 4)} USDC`
                          : `${formatCirBtcAmount(raw ?? 0n, cirBtcDecimals)} cirBTC`
                        : '—'
                      }
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* CTA */}
      {phase === 'idle' && (
        isConnected ? (
          <button
            onClick={handleStart}
            disabled={
              employees.length === 0 ||
              ratesLoading ||
              !rates ||
              insufficientUsdc ||
              insufficientCirBtc ||
              isWrongChain ||
              isTxPending
            }
            className="w-full rounded-2xl py-4 text-sm font-bold text-white flex items-center justify-center gap-2 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-40 disabled:scale-100"
            style={{ background: isWrongChain ? 'var(--danger)' : 'var(--accent)' }}
          >
            {isWrongChain ? (
              isSwitching ? 'Switching…' : 'Switch to Arc Testnet'
            ) : ratesLoading ? (
              <><Loader2 className="size-4 animate-spin" /> Loading rates…</>
            ) : (
              <>Pay {totalEmployees} Employee{totalEmployees !== 1 ? 's' : ''}</>
            )}
          </button>
        ) : (
          <ConnectKitButton.Custom>
            {({ show }) => (
              <button
                onClick={show}
                className="w-full rounded-2xl py-4 text-sm font-bold text-white transition-all hover:scale-[1.01]"
                style={{ background: 'var(--accent)' }}
              >
                Connect Wallet to Pay
              </button>
            )}
          </ConnectKitButton.Custom>
        )
      )}
    </div>
  )
}
