import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { isAddress } from 'viem'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

export function isValidAddress(addr: string): boolean {
  return isAddress(addr)
}

export function copyToClipboard(text: string): Promise<void> {
  return navigator.clipboard.writeText(text)
}

export function buildArcScanTxUrl(txHash: string): string {
  return `https://testnet.arcscan.app/tx/${txHash}`
}

export function buildArcScanAddressUrl(address: string): string {
  return `https://testnet.arcscan.app/address/${address}`
}

/** Format a number with commas and up to `decimals` fraction digits */
export function formatNumber(value: number, decimals = 2): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(value)
}

/** Format a local currency amount */
export function formatLocalAmount(amount: number, code: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${code}`
  }
}

/** Format USDC amount from raw bigint (6 decimals) */
export function formatUsdcAmount(raw: bigint, fractionDigits = 2): string {
  const whole = raw / 1_000_000n
  const frac = raw % 1_000_000n
  const fracStr = frac.toString().padStart(6, '0').slice(0, fractionDigits)
  return `${whole.toString()}.${fracStr}`
}

/** Format cirBTC amount from raw bigint (8 decimals) */
export function formatCirBtcAmount(raw: bigint, fractionDigits = 8): string {
  const divisor = 10n ** 8n
  const whole = raw / divisor
  const frac = raw % divisor
  const fracStr = frac.toString().padStart(8, '0').slice(0, fractionDigits)
  return `${whole.toString()}.${fracStr}`
}

/** Parse USDC string to raw bigint (6 decimals) */
export function parseUsdcAmount(value: string): bigint {
  const trimmed = value.replace(/,/g, '')
  const parts = trimmed.split('.')
  const whole = BigInt(parts[0] || '0')
  const fracStr = (parts[1] || '').padEnd(6, '0').slice(0, 6)
  const frac = BigInt(fracStr)
  return whole * 1_000_000n + frac
}

/** Parse cirBTC string to raw bigint (8 decimals) */
export function parseCirBtcAmount(value: string, decimals: number): bigint {
  const trimmed = value.replace(/,/g, '')
  const parts = trimmed.split('.')
  const whole = BigInt(parts[0] || '0')
  const divisor = 10n ** BigInt(decimals)
  const fracStr = (parts[1] || '').padEnd(decimals, '0').slice(0, decimals)
  const frac = BigInt(fracStr)
  return whole * divisor + frac
}

/** Relative time formatter */
export function relativeTime(dateMs: number): string {
  const diffSec = Math.floor((Date.now() - dateMs) / 1000)
  if (diffSec < 60) return 'just now'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`
  return `${Math.floor(diffSec / 86400)}d ago`
}

/** Generate a unique id */
export function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export function truncateHash(hash: string, chars = 8): string {
  return `${hash.slice(0, chars + 2)}...${hash.slice(-chars)}`
}
