/**
 * Bridge — powered by Circle App Kit (CCTP V2).
 *
 * Supports bridging USDC and cirBTC between Arc Testnet and other chains.
 * No local currency conversion — amounts are entered directly in the asset.
 *
 * AppKit handles the full CCTP lifecycle:
 *   approve → burn → fetchAttestation → mint
 *
 * Chain names used by AppKit (string identifiers, NOT numeric IDs):
 *   Arc_Testnet, Ethereum_Sepolia, Base_Sepolia, Arbitrum_Sepolia, Avalanche_Fuji
 */
import { useState, useRef, useCallback } from 'react'
import { useAccount, useSwitchChain } from 'wagmi'
import { isAddress } from 'viem'
import { ConnectKitButton } from 'connectkit'
import { AppKit } from '@circle-fin/app-kit'
import type { BridgeResult } from '@circle-fin/bridge-kit'
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2'
import type { EIP1193Provider } from 'viem'
import {
  ArrowLeftRight, CheckCircle2, Loader2, AlertTriangle,
  ExternalLink, ArrowRight, RefreshCw, Bitcoin, DollarSign,
} from 'lucide-react'
import { toast } from 'sonner'
import { useBalances } from '@/hooks/useBalances'
import { ARC_TESTNET_CHAIN_ID, ARCSCAN_BASE, CIRBTC_ADDRESS } from '@/lib/constants'
import { formatAddress, buildArcScanTxUrl } from '@/lib/utils'
import { recordActivity } from '@/lib/storage'

// ── App Kit singleton ─────────────────────────────────────────────────────────
const appKit = new AppKit()

// ── Supported chains ──────────────────────────────────────────────────────────
const CHAINS = [
  { kitName: 'Arc_Testnet',       id: ARC_TESTNET_CHAIN_ID, label: 'Arc Testnet',       shortLabel: 'Arc',    explorerBase: ARCSCAN_BASE },
  { kitName: 'Ethereum_Sepolia',  id: 11155111,             label: 'Ethereum Sepolia',  shortLabel: 'ETH',    explorerBase: 'https://sepolia.etherscan.io' },
  { kitName: 'Base_Sepolia',      id: 84532,                label: 'Base Sepolia',      shortLabel: 'Base',   explorerBase: 'https://base-sepolia.blockscout.com' },
  { kitName: 'Arbitrum_Sepolia',  id: 421614,               label: 'Arbitrum Sepolia',  shortLabel: 'Arb',    explorerBase: 'https://sepolia.arbiscan.io' },
  { kitName: 'Avalanche_Fuji',    id: 43113,                label: 'Avalanche Fuji',    shortLabel: 'Avax',   explorerBase: 'https://testnet.snowtrace.io' },
] as const

type Chain = typeof CHAINS[number]

// ── Assets ────────────────────────────────────────────────────────────────────
// Note: cirBTC bridge support depends on Circle AppKit route availability.
// USDC is always supported. cirBTC is offered but may revert if the route
// is not yet live between a given pair of chains.
const ASSETS = [
  { symbol: 'USDC',   label: 'USD Coin',               decimals: 6,  icon: DollarSign },
  { symbol: 'cirBTC', label: 'Circle Wrapped Bitcoin',  decimals: 8,  icon: Bitcoin    },
] as const

type Asset = typeof ASSETS[number]

// ── Step types ────────────────────────────────────────────────────────────────
type StepName = 'approve' | 'burn' | 'fetchAttestation' | 'mint'
type StepState = 'idle' | 'pending' | 'success' | 'error'

interface StepInfo {
  name: StepName
  label: string
  detail: string
  state: StepState
  txHash?: string
  explorerUrl?: string
}

const STEP_DEFAULTS: StepInfo[] = [
  { name: 'approve',          label: 'Approve',             detail: 'Allow the bridge to spend your tokens.',          state: 'idle' },
  { name: 'burn',             label: 'Burn on source',      detail: 'Tokens burned on the source chain.',              state: 'idle' },
  { name: 'fetchAttestation', label: 'Attestation',         detail: 'Waiting for Circle to sign the transfer proof.',  state: 'idle' },
  { name: 'mint',             label: 'Mint on destination', detail: 'Tokens minted on the destination chain.',         state: 'idle' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────
function buildExplorerTx(hash: string, explorerBase: string): string {
  return `${explorerBase}/tx/${hash}`
}

function parseKitError(err: unknown): string {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase()
  if (msg.includes('user rejected') || msg.includes('user denied') || msg.includes('4001'))
    return 'Transaction cancelled.'
  if (msg.includes('insufficient') || msg.includes('exceeds balance'))
    return 'Insufficient balance.'
  if (msg.includes('reverted'))
    return 'Transaction reverted. Check balance and allowance.'
  if (msg.includes('network') || msg.includes('timeout'))
    return 'Network error — please retry.'
  if (msg.includes('not supported') || msg.includes('route'))
    return 'Bridge route not available for this chain pair.'
  return err instanceof Error ? err.message : 'Bridge failed — please try again.'
}

// ── Component ─────────────────────────────────────────────────────────────────
export function Bridge() {
  const { address, isConnected, chainId, connector } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const { usdc: arcUsdc, cirBtc: arcCirBtc, refetch: refetchBalances } = useBalances()

  // Form state
  const [srcIdx,    setSrcIdx]    = useState(1) // default: Ethereum Sepolia → Arc
  const [dstIdx,    setDstIdx]    = useState(0) // default: Arc Testnet
  const [assetIdx,  setAssetIdx]  = useState(0) // USDC
  const [amount,    setAmount]    = useState('')
  const [recipient, setRecipient] = useState('')

  // Bridge state
  const [bridging,  setBridging]  = useState(false)
  const [done,      setDone]      = useState(false)
  const [error,     setError]     = useState<string | undefined>()
  const [steps,     setSteps]     = useState<StepInfo[]>(STEP_DEFAULTS)

  // Retry support — save last result for retry
  const lastResultRef = useRef<BridgeResult<string> | null>(null)
  const [canRetry, setCanRetry] = useState(false)

  const srcChain  = CHAINS[srcIdx]
  const dstChain  = CHAINS[dstIdx]
  const asset     = ASSETS[assetIdx]

  const isOnSrcChain  = isConnected && chainId === srcChain.id
  const recipientAddr = recipient.trim() || address || ''
  const recipientValid = !!recipientAddr && isAddress(recipientAddr)
  const amountNum  = parseFloat(amount)
  const amountValid = !isNaN(amountNum) && amountNum > 0

  // Swap src/dst
  const handleSwapChains = () => {
    const prevSrc = srcIdx
    setSrcIdx(dstIdx)
    setDstIdx(prevSrc)
  }

  // Update steps from AppKit events
  const updateStep = useCallback((name: StepName, patch: Partial<StepInfo>) => {
    setSteps(prev => prev.map(s => s.name === name ? { ...s, ...patch } : s))
  }, [])

  const resetSteps = useCallback(() => {
    setSteps(STEP_DEFAULTS.map(s => ({ ...s })))
  }, [])

  // ── Register AppKit event listeners ──────────────────────────────────────────
  const registerListeners = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    appKit.on('bridge.approve', (payload: any) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (payload?.protocol === 'cctp') {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const state: string = String(payload?.values?.state ?? '')
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const txHash: string | undefined = payload?.values?.txHash as string | undefined
        updateStep('approve', {
          state: state === 'success' ? 'success' : state === 'error' ? 'error' : 'pending',
          txHash,
          explorerUrl: txHash ? buildExplorerTx(txHash, srcChain.explorerBase) : undefined,
        })
      }
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    appKit.on('bridge.burn', (payload: any) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const state: string = String(payload?.values?.state ?? '')
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const txHash: string | undefined = payload?.values?.txHash as string | undefined
      updateStep('burn', {
        state: state === 'success' ? 'success' : state === 'error' ? 'error' : 'pending',
        txHash,
        explorerUrl: txHash ? buildExplorerTx(txHash, srcChain.explorerBase) : undefined,
      })
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    appKit.on('bridge.fetchAttestation', (payload: any) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (payload?.protocol === 'cctp') {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const state: string = String(payload?.values?.state ?? '')
        updateStep('fetchAttestation', {
          state: state === 'success' ? 'success' : state === 'error' ? 'error' : 'pending',
        })
      }
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    appKit.on('bridge.mint', (payload: any) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const state: string = String(payload?.values?.state ?? '')
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const txHash: string | undefined = payload?.values?.txHash as string | undefined
      updateStep('mint', {
        state: state === 'success' ? 'success' : state === 'error' ? 'error' : 'pending',
        txHash,
        explorerUrl: txHash ? buildExplorerTx(txHash, dstChain.explorerBase) : undefined,
      })
    })
  }, [srcChain.explorerBase, dstChain.explorerBase, updateStep])

  // ── Build adapter helper ──────────────────────────────────────────────────────
  const buildAdapter = useCallback(async () => {
    if (!connector) throw new Error('No wallet connected')
    const provider = (await connector.getProvider()) as EIP1193Provider
    return createViemAdapterFromProvider({ provider })
  }, [connector])

  // ── Handle bridge result ──────────────────────────────────────────────────────
  const handleResult = useCallback((
    result: BridgeResult<string>,
    frozenAsset: typeof ASSETS[number],
    frozenAmount: string,
    frozenAmountNum: number,
    frozenDstChain: typeof CHAINS[number],
    frozenSrcChain: typeof CHAINS[number],
    frozenRecipientAddr: string,
  ) => {
    lastResultRef.current = result
    setCanRetry(true)

    if (result.state === 'success') {
      setDone(true)
      const mintHash = result.steps.find(s => s.name === 'mint')?.txHash
        ?? result.steps[result.steps.length - 1]?.txHash ?? ''
      recordActivity({
        type: 'bridge',
        asset: frozenAsset.symbol,
        txHash: mintHash,
        from: frozenSrcChain.label,
        to: frozenRecipientAddr,
        amountRaw: Math.round(frozenAmountNum * 10 ** frozenAsset.decimals).toString(),
        decimals: frozenAsset.decimals,
        status: 'confirmed',
        timestamp: Date.now(),
      })
      refetchBalances()
      toast.success(`Bridge complete! ${frozenAmount} ${frozenAsset.symbol} arrived on ${frozenDstChain.label}.`)
    } else {
      const failedStep = result.steps.find(s => s.state === 'error')
      const errMsg = failedStep
        ? `Failed at "${failedStep.name}" step.`
        : 'Bridge did not complete.'
      setError(errMsg)
      toast.error(errMsg)
    }
  }, [refetchBalances])

  // ── Execute bridge ────────────────────────────────────────────────────────────
  const executeBridge = useCallback(async () => {
    if (!connector || !address) return

    setBridging(true)
    setDone(false)
    setError(undefined)
    resetSteps()

    // Snapshot all values now so they're consistent across async awaits
    const frozenSrcChain  = srcChain
    const frozenDstChain  = dstChain
    const frozenAsset     = asset
    const frozenAmount    = amount
    const frozenAmountNum = amountNum
    const frozenRecipientAddr = recipientAddr

    try {
      // Switch to source chain if needed
      if (chainId !== frozenSrcChain.id) {
        toast.info(`Switching to ${frozenSrcChain.label}…`)
        await switchChainAsync({ chainId: frozenSrcChain.id })
      }

      const adapter = await buildAdapter()
      registerListeners()

      // Build destination context.
      // recipientAddress is only valid when useForwarder=true (no adapter on dest).
      // With an adapter present, the connected wallet IS the recipient.
      const hasCustomRecipient = !!recipient.trim() && frozenRecipientAddr !== address
      const toParam = hasCustomRecipient
        ? { chain: frozenDstChain.kitName, useForwarder: true as const, recipientAddress: frozenRecipientAddr }
        : { adapter, chain: frozenDstChain.kitName }

      const result = await appKit.bridge({
        from: { adapter, chain: frozenSrcChain.kitName },
        to: toParam,
        amount: frozenAmountNum.toFixed(frozenAsset.decimals === 6 ? 6 : 8),
        ...(frozenAsset.symbol === 'cirBTC' ? { token: CIRBTC_ADDRESS } : {}),
      })

      handleResult(result, frozenAsset, frozenAmount, frozenAmountNum, frozenDstChain, frozenSrcChain, frozenRecipientAddr)
    } catch (err) {
      const msg = parseKitError(err)
      setError(msg)
      toast.error(msg)
    } finally {
      setBridging(false)
    }
  }, [
    connector, address, chainId, srcChain, dstChain, asset,
    amount, amountNum, recipient, recipientAddr,
    switchChainAsync, buildAdapter, registerListeners, resetSteps, handleResult,
  ])

  // ── Retry using AppKit's built-in retry (resumes from last failed step) ───────
  const executeRetry = useCallback(async () => {
    const prevResult = lastResultRef.current
    if (!prevResult || !connector || !address) {
      void executeBridge()
      return
    }

    setBridging(true)
    setError(undefined)

    // Snapshot frozen state from previous execution for result handling
    const frozenSrcChain  = srcChain
    const frozenDstChain  = dstChain
    const frozenAsset     = asset
    const frozenAmount    = amount
    const frozenAmountNum = amountNum
    const frozenRecipientAddr = recipientAddr

    try {
      const adapter = await buildAdapter()
      registerListeners()

      const retryResult = await appKit.retryBridge(prevResult, { from: adapter, to: adapter })
      handleResult(retryResult, frozenAsset, frozenAmount, frozenAmountNum, frozenDstChain, frozenSrcChain, frozenRecipientAddr)
    } catch (err) {
      // If retry itself fails, fall back to a full re-run
      const msg = parseKitError(err)
      setError(msg)
      toast.error(msg)
    } finally {
      setBridging(false)
    }
  }, [
    connector, address, srcChain, dstChain, asset, amount, amountNum, recipientAddr,
    buildAdapter, registerListeners, handleResult, executeBridge,
  ])

  const handleBridge = () => void executeBridge()
  const handleRetry  = () => void executeRetry()

  const resetForm = () => {
    setAmount('')
    setRecipient('')
    setBridging(false)
    setDone(false)
    setError(undefined)
    lastResultRef.current = null
    setCanRetry(false)
    resetSteps()
  }

  // ── Current Arc balance display ────────────────────────────────────────────
  const arcBalance = asset.symbol === 'USDC' ? arcUsdc : arcCirBtc
  const arcBalanceStr = arcBalance !== undefined
    ? (Number(arcBalance) / 10 ** asset.decimals).toFixed(asset.decimals === 6 ? 2 : 6)
    : '—'

  // ── Active step index ──────────────────────────────────────────────────────
  const activeStepIdx = steps.reduce((acc: number, s: StepInfo, i: number) =>
    (s.state === 'pending' || s.state === 'success') ? i : acc, -1)

  // ─── Render ────────────────────────────────────────────────────────────────
  if (!isConnected) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg)' }}>
        <div className="text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto"
            style={{ background: 'var(--surface)' }}>
            <ArrowLeftRight className="w-7 h-7" style={{ color: 'var(--accent)' }} />
          </div>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Connect your wallet to bridge</p>
          <ConnectKitButton />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-4 pb-24 md:pb-8" style={{ background: 'var(--bg)' }}>
      <div className="max-w-lg mx-auto space-y-6">

        {/* Header */}
        <div className="pt-4">
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Bridge
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Move USDC between chains via Circle CCTP.
          </p>
        </div>

        {/* Done state */}
        {done && (
          <div className="rounded-2xl p-6 text-center space-y-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto"
              style={{ background: 'rgba(34,197,94,0.12)' }}>
              <CheckCircle2 className="w-7 h-7 text-green-500" />
            </div>
            <div>
              <p className="font-semibold text-lg" style={{ color: 'var(--text-primary)' }}>Bridge complete</p>
              <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                {amount} {asset.symbol} arrived on {dstChain.label}
              </p>
            </div>
            {/* Step receipts */}
            <div className="space-y-2 text-left">
              {steps.filter(s => s.txHash).map(s => (
                <a key={s.name} href={s.explorerUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-between p-3 rounded-xl text-sm"
                  style={{ background: 'var(--bg)', color: 'var(--text-secondary)' }}>
                  <span className="capitalize">{s.label}</span>
                  <span className="flex items-center gap-1 font-mono text-xs">
                    {s.txHash!.slice(0, 10)}…
                    <ExternalLink className="w-3 h-3" />
                  </span>
                </a>
              ))}
            </div>
            <button onClick={resetForm}
              className="w-full py-3 rounded-xl font-semibold text-sm text-white"
              style={{ background: 'var(--accent)' }}>
              Bridge again
            </button>
          </div>
        )}

        {/* Error state */}
        {!done && error && (
          <div className="rounded-2xl p-4 flex items-start gap-3"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-red-500">{error}</p>
              {canRetry && (
                <button onClick={handleRetry}
                  className="mt-2 flex items-center gap-1.5 text-xs font-semibold"
                  style={{ color: 'var(--accent)' }}>
                  <RefreshCw className="w-3.5 h-3.5" />
                  Retry from last step
                </button>
              )}
            </div>
            <button onClick={resetForm} className="text-xs shrink-0" style={{ color: 'var(--text-secondary)' }}>
              Start over
            </button>
          </div>
        )}

        {!done && (
          <div className="rounded-2xl p-6 space-y-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>

            {/* Asset selector */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary)' }}>Asset</p>
              <div className="flex gap-2">
                {ASSETS.map((a, i) => {
                  const Icon = a.icon
                  return (
                    <button key={a.symbol}
                      onClick={() => setAssetIdx(i)}
                      disabled={bridging}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
                      style={{
                        background: assetIdx === i ? 'var(--accent)' : 'var(--bg)',
                        color: assetIdx === i ? '#fff' : 'var(--text-secondary)',
                        border: '1px solid var(--border)',
                      }}>
                      <Icon className="w-4 h-4" />
                      {a.symbol}
                    </button>
                  )
                })}
              </div>
              {asset.symbol === 'cirBTC' && (
                <p className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>
                  cirBTC bridging requires an active CCTP route for this chain pair.
                </p>
              )}
            </div>

            {/* Chain selector */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary)' }}>Route</p>
              <div className="flex items-center gap-3">
                {/* Source */}
                <div className="flex-1">
                  <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>From</p>
                  <select value={srcIdx}
                    onChange={e => setSrcIdx(Number(e.target.value))}
                    disabled={bridging}
                    className="w-full rounded-xl px-3 py-2.5 text-sm font-medium appearance-none"
                    style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                    {CHAINS.map((c, i) => (
                      <option key={c.kitName} value={i} disabled={i === dstIdx}>{c.label}</option>
                    ))}
                  </select>
                </div>

                {/* Swap button */}
                <button onClick={handleSwapChains} disabled={bridging}
                  className="mt-5 p-2 rounded-lg transition-all"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                  <ArrowLeftRight className="w-4 h-4" />
                </button>

                {/* Destination */}
                <div className="flex-1">
                  <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>To</p>
                  <select value={dstIdx}
                    onChange={e => setDstIdx(Number(e.target.value))}
                    disabled={bridging}
                    className="w-full rounded-xl px-3 py-2.5 text-sm font-medium appearance-none"
                    style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                    {CHAINS.map((c, i) => (
                      <option key={c.kitName} value={i} disabled={i === srcIdx}>{c.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Wrong chain warning */}
              {isConnected && !isOnSrcChain && (
                <div className="mt-2 flex items-center justify-between p-3 rounded-xl"
                  style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
                  <p className="text-xs" style={{ color: '#d97706' }}>
                    Switch to {srcChain.label} to bridge from it.
                  </p>
                  <button
                    onClick={() => void switchChainAsync({ chainId: srcChain.id })}
                    className="text-xs font-semibold px-3 py-1 rounded-lg"
                    style={{ background: '#d97706', color: '#fff' }}>
                    Switch
                  </button>
                </div>
              )}
            </div>

            {/* Amount */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Amount</p>
                {srcChain.id === ARC_TESTNET_CHAIN_ID && (
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    Arc balance: {arcBalanceStr} {asset.symbol}
                  </span>
                )}
              </div>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="0.00"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  disabled={bridging}
                  className="w-full rounded-xl px-4 py-3 text-lg font-semibold pr-20 appearance-none"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold"
                  style={{ color: 'var(--text-secondary)' }}>
                  {asset.symbol}
                </span>
              </div>
            </div>

            {/* Recipient (optional) */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary)' }}>
                Recipient
                <span className="ml-1 font-normal normal-case" style={{ color: 'var(--text-secondary)' }}>
                  (defaults to your wallet)
                </span>
              </p>
              <input
                type="text"
                placeholder={address ? formatAddress(address) : '0x…'}
                value={recipient}
                onChange={e => setRecipient(e.target.value)}
                disabled={bridging}
                className="w-full rounded-xl px-4 py-3 text-sm font-mono"
                style={{ background: 'var(--bg)', border: `1px solid ${recipient && !recipientValid ? 'var(--error, #ef4444)' : 'var(--border)'}`, color: 'var(--text-primary)' }}
              />
              {recipient && !recipientValid && (
                <p className="text-xs mt-1 text-red-500">Invalid address</p>
              )}
            </div>

            {/* Bridge summary */}
            {amountValid && (
              <div className="rounded-xl p-4 space-y-2" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                <div className="flex items-center justify-between text-sm">
                  <span style={{ color: 'var(--text-secondary)' }}>Sending</span>
                  <span className="font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{amount} {asset.symbol}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span style={{ color: 'var(--text-secondary)' }}>Route</span>
                  <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                    {srcChain.shortLabel} <ArrowRight className="inline w-3 h-3 mx-0.5" /> {dstChain.shortLabel}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span style={{ color: 'var(--text-secondary)' }}>To</span>
                  <span className="font-mono text-xs" style={{ color: 'var(--text-primary)' }}>
                    {formatAddress(recipientAddr || address || '')}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span style={{ color: 'var(--text-secondary)' }}>Protocol</span>
                  <span className="font-medium text-xs" style={{ color: 'var(--text-secondary)' }}>Circle CCTP V2 • Fast</span>
                </div>
              </div>
            )}

            {/* Progress steps (shown while bridging or after error) */}
            {(bridging || error) && (
              <div className="space-y-2">
                {steps.map((step, i) => {
                  const isActive = step.state === 'pending'
                  const isDone   = step.state === 'success'
                  const isFailed = step.state === 'error'
                  const isQueued = step.state === 'idle' && i > activeStepIdx
                  return (
                    <div key={step.name}
                      className="flex items-center gap-3 p-3 rounded-xl"
                      style={{
                        background: isActive ? 'rgba(var(--accent-rgb,99,102,241),0.08)' : 'var(--bg)',
                        border: `1px solid ${isActive ? 'var(--accent)' : isFailed ? 'rgba(239,68,68,0.3)' : 'var(--border)'}`,
                        opacity: isQueued ? 0.4 : 1,
                      }}>
                      <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                        style={{
                          background: isDone ? 'rgba(34,197,94,0.12)' : isFailed ? 'rgba(239,68,68,0.12)' : isActive ? 'rgba(var(--accent-rgb,99,102,241),0.12)' : 'var(--surface)',
                        }}>
                        {isDone   && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                        {isFailed && <AlertTriangle className="w-4 h-4 text-red-500" />}
                        {isActive && <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--accent)' }} />}
                        {!isDone && !isFailed && !isActive && (
                          <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>{i + 1}</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{step.label}</p>
                        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                          {isActive ? step.detail : isDone ? 'Complete' : isFailed ? 'Failed' : step.detail}
                        </p>
                      </div>
                      {step.txHash && step.explorerUrl && (
                        <a href={step.explorerUrl} target="_blank" rel="noopener noreferrer"
                          className="shrink-0 flex items-center gap-1 text-xs font-mono"
                          style={{ color: 'var(--accent)' }}>
                          {step.txHash.slice(0, 8)}…
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* CTA */}
            {!done && (
              <button
                onClick={handleBridge}
                disabled={bridging || !amountValid || !recipientValid}
                className="w-full py-4 rounded-xl font-bold text-sm text-white transition-all disabled:opacity-40"
                style={{ background: 'var(--accent)' }}>
                {bridging
                  ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Bridging…</span>
                  : !isOnSrcChain && isConnected
                    ? `Switch to ${srcChain.shortLabel} & Bridge`
                    : `Bridge ${amountValid ? `${amount} ` : ''}${asset.symbol}`
                }
              </button>
            )}
          </div>
        )}

        {/* Arc balance card (shown when destination is Arc) */}
        {!done && dstChain.id === ARC_TESTNET_CHAIN_ID && (
          <div className="rounded-2xl p-4 flex items-center justify-between"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Your Arc balance</p>
              <p className="text-lg font-bold tabular-nums mt-0.5" style={{ color: 'var(--text-primary)' }}>
                {arcBalanceStr} {asset.symbol}
              </p>
            </div>
            <button onClick={refetchBalances} className="p-2 rounded-lg" style={{ color: 'var(--text-secondary)' }}>
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Info note */}
        <div className="rounded-xl p-4 flex gap-3 text-sm"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <ArrowLeftRight className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
          <p style={{ color: 'var(--text-secondary)' }}>
            Bridging uses Circle's CCTP V2 — the same asset is burned on the source chain and minted on the destination.
            Fast mode typically completes in under 30 seconds.
          </p>
        </div>

      </div>
    </div>
  )
}
