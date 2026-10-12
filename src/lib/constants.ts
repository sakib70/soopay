// Soopay constants

export const ARC_TESTNET_CHAIN_ID = 5042002


// USDC is a verified predeploy on Arc (same address on mainnet + testnet)
export const USDC_ADDRESS = '0x3600000000000000000000000000000000000000' as const
export const USDC_DECIMALS = 6

// cirBTC — official Arc Testnet Circle Wrapped Bitcoin
// Verified: symbol=cirBTC, name=Circle Wrapped Bitcoin, decimals=8
// Contract: https://testnet.arcscan.app/address/0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF
export const CIRBTC_ADDRESS = (
  import.meta.env.VITE_CIRBTC_ADDRESS || '0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF'
) as `0x${string}`
export const CIRBTC_DECIMALS = 8 // verified: decimals() returns 8
export const CIRBTC_CONFIGURED = true // address verified on-chain

// SoopayPayroll — deployed on Arc Testnet
// Contract: https://testnet.arcscan.app/address/0xcf48794299977efa8236f571d222adff3850ea4b
export const PAYROLL_CONTRACT_ADDRESS = '0xcf48794299977efa8236f571d222adff3850ea4b' as const
export const PAYROLL_AGENT_CONTRACT   = '0x8d9c32954a5c9c4e75d63783b85d4d53893170d5' as const

// Explorer
export const ARCSCAN_BASE = 'https://testnet.arcscan.app'



// Supported local currencies
export const CURRENCIES = [
  { code: 'USD', name: 'US Dollar',          symbol: '$',  flag: 'US' },
  { code: 'EUR', name: 'Euro',               symbol: '€',  flag: 'EU' },
  { code: 'BDT', name: 'Bangladeshi Taka',   symbol: '৳',  flag: 'BD' },
  { code: 'INR', name: 'Indian Rupee',       symbol: '₹',  flag: 'IN' },
  { code: 'PKR', name: 'Pakistani Rupee',    symbol: '₨',  flag: 'PK' },
  { code: 'NGN', name: 'Nigerian Naira',     symbol: '₦',  flag: 'NG' },
  { code: 'IDR', name: 'Indonesian Rupiah',  symbol: 'Rp', flag: 'ID' },
  { code: 'VND', name: 'Vietnamese Dong',    symbol: '₫',  flag: 'VN' },
  { code: 'THB', name: 'Thai Baht',          symbol: '฿',  flag: 'TH' },
  { code: 'PHP', name: 'Philippine Peso',    symbol: '₱',  flag: 'PH' },
] as const

export type CurrencyCode = typeof CURRENCIES[number]['code']

export const DEFAULT_CURRENCY: CurrencyCode = 'USD'

// Supported payment assets
export const PAYMENT_ASSETS = ['USDC', 'cirBTC'] as const
export type PaymentAsset = typeof PAYMENT_ASSETS[number]

// Storage keys
export const STORAGE_KEYS = {
  CURRENCY:      'soopay_currency',
  RECIPIENTS:    'soopay_recipients',
  EMPLOYEES:     'soopay_employees',
  THEME:         'soopay_theme',
  ACTIVITY:      'soopay_activity',
  DEFAULT_ASSET: 'soopay_default_asset',
  EXPENSES:      'soopay_expenses',
} as const

// SoopayPayroll ABI (minimal — only what the frontend needs)
export const PAYROLL_ABI = [
  {
    name: 'batchPay',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token',      type: 'address' },
      { name: 'recipients', type: 'address[]' },
      { name: 'amounts',    type: 'uint256[]' },
    ],
    outputs: [
      { name: 'successCount', type: 'uint256' },
      { name: 'totalPaid',    type: 'uint256' },
    ],
  },
  {
    name: 'isTokenAllowed',
    type: 'function',
    stateMutability: 'view',
    inputs:  [{ name: 'token', type: 'address' }],
    outputs: [{ name: '',      type: 'bool'    }],
  },
  {
    name: 'MAX_BATCH_SIZE',
    type: 'function',
    stateMutability: 'view',
    inputs:  [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'BatchPaid',
    type: 'event',
    inputs: [
      { name: 'payer',          type: 'address', indexed: true },
      { name: 'token',          type: 'address', indexed: true },
      { name: 'successCount',   type: 'uint256', indexed: false },
      { name: 'totalPaid',      type: 'uint256', indexed: false },
    ],
  },
  {
    name: 'SkippedPayment',
    type: 'event',
    inputs: [
      { name: 'payer',     type: 'address', indexed: true },
      { name: 'token',     type: 'address', indexed: true },
      { name: 'recipient', type: 'address', indexed: true },
      { name: 'amount',    type: 'uint256', indexed: false },
      { name: 'reason',    type: 'string',  indexed: false },
    ],
  },
] as const
