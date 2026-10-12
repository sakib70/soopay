import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { erc20Abi, isAddress } from 'viem'
import { ConnectKitButton } from 'connectkit'
import { ArrowRight, AlertTriangle, Info } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { AssetSelector, type Asset } from '@/components/AssetSelector'
import { CurrencySelector } from '@/components/CurrencySelector'
import { FxQuote } from '@/components/FxQuote'
import { TransactionStatus, type TxStatus } from '@/components/TransactionStatus'
import { useCurrency } from '@/hooks/useCurrency'
import { useSafeChainSwitch } from '@/hooks/useSafeChainSwitch'
import { useFx, localToUsdcRaw, localToCirBtcRaw } from '@/hooks/useFx'
import { useBalances } from '@/hooks/useBalances'
import {
  ARC_TESTNET_CHAIN_ID, USDC_ADDRESS, CIRBTC_ADDRESS,
  USDC_DECIMALS, CURRENCIES,
} from '@/lib/constants'
import { formatUsdcAmount, formatCirBtcAmount, formatAddress } from '@/lib/utils'
import { recordActivity } from '@/lib/storage'

function parseOnchainError(error: unknown): string {
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase()
  if (msg.includes('user rejected') || msg.includes('user denied') || msg.includes('4001'))
    return 'Transaction cancelled.'
  if (msg.includes('insufficient') || msg.includes('exceeds balance'))
    return 'Insufficient balance.'
  if (msg.includes('reverted'))
    return 'Transaction reverted. Check the recipient address and balance.'
  if (msg.includes('network') || msg.includes('timeout'))
    return 'Network error. Please retry.'
  return 'Something went wrong. Please try again.'
}

export function Send() {
  const [searchParams] = useSearchParams()
  const { address, isConnected, chainId } = useAccount()
  const { safeSwitch, isPending: isSwitching } = useSafeChainSwitch()
  const { currency, changeCurrency } = useCurrency()
  const { rates, loading: ratesLoading, error: ratesError, lastFetched, refresh } = useFx(currency)
  const { usdc, cirBtc, cirBtcDecimals = 8, refetch } = useBalances()

  const [asset, setAsset] = useState<Asset>('USDC')
  const [localAmount, setLocalAmount] = useState('')
  // Pre-fill recipient from ?to= (ENS viewer "Pay" button)
  const [recipient, setRecipient] = useState(() => searchParams.get('to') ?? '')
  // Store resolved ENS name for display
  const [ensName] = useState(() => searchParams.get('name') ?? '')
  const [step, setStep] = useState<'form' | 'review'>('form')
  const [txStatus, setTxStatus] = useState<TxStatus>('idle')
  const [txHash, setTxHash] = useState<string | undefined>()
  const [txError, setTxError] = useState<string | undefined>()

  const isWrongChain = isConnected && chainId !== ARC_TESTNET_CHAIN_ID
  const currencyInfo = CURRENCIES.find((c) => c.code === currency)!

  // Compute on-chain amounts
  const usdcRaw = asset === 'USDC' && rates ? localToUsdcRaw(localAmount, rates.localToUsd) : 0n
  const cirBtcRaw = asset === 'cirBTC' && rates ? localToCirBtcRaw(localAmount, rates.localToBtc, cirBtcDecimals) : 0n
  const transferRaw = asset === 'USDC' ? usdcRaw : cirBtcRaw

  // Balance checks
  const usdcBalance = usdc ?? 0n
  const cirBtcBalance = cirBtc ?? 0n
  const insufficientUsdc = asset === 'USDC' && usdcRaw > usdcBalance
  const insufficientCirBtc = asset === 'cirBTC' && cirBtcRaw > cirBtcBalance
  const insufficient = insufficientUsdc || insufficientCirBtc

  const recipientValid = isAddress(recipient)
  const amountValid = transferRaw > 0n

  const contractAddress = (asset === 'USDC' ? USDC_ADDRESS : CIRBTC_ADDRESS)

  const { writeContract, isPending: isTxPending } = useWriteContract({
    mutation: {
      // onSuccess fires when the wallet has signed and the tx is broadcast
      onSuccess: (hash) => {
        setTxHash(hash)
        setTxStatus('confirming') // waiting for on-chain receipt
      },
      onError: (err) => {
        setTxStatus('error')
        const msg = parseOnchainError(err)
        setTxError(msg)
        toast.error(msg)
      },
    },
  })

  const { isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: txHash as `0x${string}` | undefined,
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { enabled: !!txHash },
  })

  // Track whether we've already handled this confirmation to avoid double-firing
  const confirmedHashRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (isConfirmed && txHash && txStatus === 'confirming' && confirmedHashRef.current !== txHash) {
      confirmedHashRef.current = txHash
      const now = Date.now()
      setTxStatus('success')
      recordActivity({
        type: 'send',
        asset,
        txHash,
        from: address,
        to: recipient,
        amountRaw: transferRaw.toString(),
        decimals: asset === 'USDC' ? USDC_DECIMALS : cirBtcDecimals,
        localCurrency: currency,
        localAmount,
        status: 'confirmed',
        timestamp: now,
      })
      refetch()
      toast.success(`${asset} sent successfully!`)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfirmed, txHash])

  const handleSend = () => {
    if (!recipientValid || transferRaw === 0n) return
    if (isWrongChain) {
      void safeSwitch(ARC_TESTNET_CHAIN_ID)
      return
    }
    setTxError(undefined)
    // 'pending' = wallet prompt is open (wagmi isTxPending covers this visually)
    // We go straight to calling writeContract; txStatus advances to 'confirming' on hash receipt
    writeContract({
      address: contractAddress,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [recipient, transferRaw],
      chainId: ARC_TESTNET_CHAIN_ID,
    })
  }

  const resetForm = () => {
    setLocalAmount('')
    setRecipient('')
    setStep('form')
    setTxStatus('idle')
    setTxHash(undefined)
    setTxError(undefined)
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6 pb-28 md:pb-6">
      <div
        className="rounded-3xl overflow-hidden"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="display text-xl font-bold" style={{ color: 'var(--ink)' }}>Send</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--subtle)' }}>
            Pay in local currency, settle in crypto on Arc
          </p>
        </div>

        <div className="p-5 space-y-4">
          {/* Asset + currency selector */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1">
              <label className="text-xs font-semibold mb-1.5 block" style={{ color: 'var(--muted)' }}>
                Asset
              </label>
              <AssetSelector value={asset} onChange={setAsset} />
            </div>
            <div>
              <label className="text-xs font-semibold mb-1.5 block" style={{ color: 'var(--muted)' }}>
                Currency
              </label>
              <CurrencySelector value={currency} onChange={changeCurrency} />
            </div>
          </div>



          {/* Amount input */}
          <div>
            <label className="text-xs font-semibold mb-1.5 block" style={{ color: 'var(--muted)' }}>
              Amount ({currency})
            </label>
            <div
              className="rounded-2xl p-4"
              style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}
            >
              <div className="flex items-baseline gap-2">
                <span className="display text-2xl font-bold" style={{ color: 'var(--muted)' }}>
                  {currencyInfo.symbol}
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={localAmount}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^0-9.]/g, '')
                    if (v === '' || /^\d*\.?\d*$/.test(v)) setLocalAmount(v)
                  }}
                  placeholder="0.00"
                  className="display flex-1 bg-transparent text-3xl font-bold tabular-nums outline-none placeholder:opacity-30"
                  style={{ color: 'var(--ink)' }}
                />
              </div>
              {/* Balance */}
              {isConnected && asset === 'USDC' && (
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs" style={{ color: 'var(--subtle)' }}>USDC balance</span>
                  <button
                    className="text-xs font-medium"
                    style={{ color: 'var(--accent-hover)' }}
                    onClick={() => {
                      if (usdc !== undefined && rates) {
                        const usdcVal = parseFloat(formatUsdcAmount(usdc))
                        setLocalAmount((usdcVal / rates.localToUsd).toFixed(2))
                      }
                    }}
                  >
                    {formatUsdcAmount(usdcBalance)} USDC · Max
                  </button>
                </div>
              )}
              {isConnected && asset === 'cirBTC' && (
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs" style={{ color: 'var(--subtle)' }}>cirBTC balance</span>
                  <span className="text-xs font-medium tabular-nums" style={{ color: 'var(--subtle)' }}>
                    {formatCirBtcAmount(cirBtcBalance, cirBtcDecimals)} cirBTC
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* FX Quote */}
          <FxQuote
            localAmount={localAmount}
            currency={currency}
            asset={asset}
            rates={rates}
            loading={ratesLoading}
            error={ratesError}
            lastFetched={lastFetched}
            onRefresh={refresh}
          />

          {/* Insufficient balance warning */}
          {insufficient && isConnected && (
            <div
              className="rounded-xl px-3 py-2.5 flex items-center gap-2"
              style={{ background: 'rgba(192,41,63,0.08)' }}
            >
              <AlertTriangle className="size-3.5 shrink-0" style={{ color: 'var(--danger)' }} />
              <p className="text-xs" style={{ color: 'var(--danger)' }}>
                Insufficient {asset} balance.
              </p>
            </div>
          )}

          {/* Recipient */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                Recipient address
              </label>
              {ensName && recipientValid && (
                <span className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(99,102,241,0.10)', color: 'var(--accent)' }}>
                  <span className="size-1.5 rounded-full bg-green-500 inline-block" />
                  {ensName}
                </span>
              )}
            </div>
            <input
              type="text"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value.trim())}
              placeholder="0x..."
              className="mono w-full rounded-2xl px-4 py-3 text-sm outline-none transition-all placeholder:opacity-40"
              style={{
                background: 'var(--surface-muted)',
                border: `1px solid ${recipient && !recipientValid ? 'var(--danger)' : 'var(--border)'}`,
                color: 'var(--ink)',
              }}
            />
            {recipient && !recipientValid && (
              <p className="text-xs mt-1.5" style={{ color: 'var(--danger)' }}>
                Invalid Ethereum address
              </p>
            )}
          </div>

          {/* Arc note */}
          <div
            className="rounded-xl px-3 py-2.5 flex items-start gap-2"
            style={{ background: 'rgba(15,32,53,0.04)' }}
          >
            <Info className="size-3.5 shrink-0 mt-0.5" style={{ color: 'var(--subtle)' }} />
            <p className="text-xs" style={{ color: 'var(--subtle)' }}>
              Only the {asset} equivalent is transferred on Arc Network. The local currency amount is for reference only.
            </p>
          </div>

          {/* TX Status */}
          <TransactionStatus
            status={txStatus}
            txHash={txHash}
            error={txError}
            onReset={resetForm}
            successMessage={`${asset} sent to ${formatAddress(recipient)}`}
          />

          {/* CTA */}
          {(txStatus === 'idle' || txStatus === 'error') ? (
            isConnected ? (
              <button
                onClick={() => step === 'form' ? setStep('review') : handleSend()}
                disabled={
                  !amountValid ||
                  !recipientValid ||
                  insufficient ||
                  isTxPending
                }
                className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white flex items-center justify-center gap-2 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed disabled:scale-100"
                style={{ background: isWrongChain ? 'var(--danger)' : 'var(--accent)' }}
              >
                {isWrongChain ? (
                  isSwitching ? 'Switching network...' : 'Switch to Arc Testnet'
                ) : step === 'form' ? (
                  <>Review transaction <ArrowRight className="size-4" /></>
                ) : isTxPending ? (
                  'Confirm in wallet...'
                ) : (
                  `Send ${asset}`
                )}
              </button>
            ) : (
              <ConnectKitButton.Custom>
                {({ show }) => (
                  <button
                    onClick={show}
                    className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99]"
                    style={{ background: 'var(--accent)' }}
                  >
                    Connect Wallet
                  </button>
                )}
              </ConnectKitButton.Custom>
            )
          ) : null}

          {/* Review panel */}
          <AnimatePresence>
            {step === 'review' && txStatus === 'idle' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div
                  className="rounded-2xl p-4 space-y-2.5"
                  style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}
                >
                  <h3 className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--muted)' }}>
                    Review
                  </h3>
                  {[
                    { label: 'Recipient', value: ensName ? `${ensName} (${formatAddress(recipient)})` : formatAddress(recipient), mono: true },
                    { label: 'You send', value: `${currencyInfo.symbol}${localAmount} ${currency}` },
                    {
                      label: 'On-chain amount',
                      value: asset === 'USDC'
                        ? `${(Number(usdcRaw) / 1_000_000).toFixed(6)} USDC`
                        : `${(Number(cirBtcRaw) / 10 ** cirBtcDecimals).toFixed(8)} cirBTC`,
                    },
                    { label: 'Network', value: 'Arc Testnet' },
                    { label: 'Gas', value: 'Paid in USDC (Arc)' },
                  ].map(({ label, value, mono }) => (
                    <div key={label} className="flex items-center justify-between text-sm">
                      <span style={{ color: 'var(--subtle)' }}>{label}</span>
                      <span className={`font-medium ${mono ? 'mono text-xs' : ''}`} style={{ color: 'var(--ink)' }}>
                        {value}
                      </span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => setStep('form')}
                  className="w-full text-xs text-center mt-2 py-1.5"
                  style={{ color: 'var(--muted)' }}
                >
                  Edit
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
