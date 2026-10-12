import { STORAGE_KEYS, DEFAULT_CURRENCY, type CurrencyCode, type PaymentAsset } from './constants'
import { genId } from './utils'

// ─── Manual Expenses ──────────────────────────────────────────────────────────

export const EXPENSE_CATEGORIES = [
  'Software & Tools',
  'Infrastructure',
  'Marketing',
  'Legal & Compliance',
  'Accounting',
  'Travel',
  'Office & Equipment',
  'Payroll (Off-chain)',
  'Contractor',
  'Fees & Commissions',
  'Other',
] as const

export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number]

export interface ManualExpense {
  id: string
  date: string          // ISO date string YYYY-MM-DD
  category: ExpenseCategory
  description: string
  amount: number        // in the specified currency
  currency: CurrencyCode | 'USD'
  notes?: string
  createdAt: number
  updatedAt: number
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Recipient {
  id: string
  name: string
  address: string
  employeeId?: string
  designation?: string
  currency?: CurrencyCode
  memo?: string
  createdAt: number
}

export interface Employee {
  id: string
  name: string
  address: string
  employeeId?: string
  designation?: string
  currency: CurrencyCode
  salaryAmount: string    // in local currency — NEVER stored as crypto
  paymentAsset: PaymentAsset
  createdAt: number
}

export interface ActivityRecord {
  id: string
  type: 'send' | 'receive' | 'bridge' | 'payroll'
  asset: 'USDC' | 'cirBTC'
  txHash: string
  from?: string
  to?: string
  amountRaw: string   // bigint as string
  decimals: number
  localCurrency?: CurrencyCode
  localAmount?: string
  employeeCount?: number  // for payroll batches
  memo?: string
  status: 'confirmed' | 'failed'
  timestamp: number
}

// ─── Currency ────────────────────────────────────────────────────────────────

export function getCurrency(): CurrencyCode {
  return (localStorage.getItem(STORAGE_KEYS.CURRENCY) as CurrencyCode) || DEFAULT_CURRENCY
}

export function setCurrency(code: CurrencyCode): void {
  localStorage.setItem(STORAGE_KEYS.CURRENCY, code)
}

// ─── Default asset ────────────────────────────────────────────────────────────

export function getDefaultAsset(): PaymentAsset {
  return (localStorage.getItem(STORAGE_KEYS.DEFAULT_ASSET) as PaymentAsset) || 'USDC'
}

export function setDefaultAsset(asset: PaymentAsset): void {
  localStorage.setItem(STORAGE_KEYS.DEFAULT_ASSET, asset)
}

// ─── Recipients ──────────────────────────────────────────────────────────────

export function getRecipients(): Recipient[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.RECIPIENTS) || '[]') as Recipient[]
  } catch {
    return []
  }
}

export function saveRecipient(r: Omit<Recipient, 'id' | 'createdAt'>): Recipient {
  const list = getRecipients()
  const item: Recipient = { ...r, id: genId(), createdAt: Date.now() }
  list.unshift(item)
  localStorage.setItem(STORAGE_KEYS.RECIPIENTS, JSON.stringify(list))
  return item
}

export function deleteRecipient(id: string): void {
  const list = getRecipients().filter((r) => r.id !== id)
  localStorage.setItem(STORAGE_KEYS.RECIPIENTS, JSON.stringify(list))
}

export function updateRecipient(id: string, updates: Partial<Recipient>): void {
  const list = getRecipients().map((r) => (r.id === id ? { ...r, ...updates } : r))
  localStorage.setItem(STORAGE_KEYS.RECIPIENTS, JSON.stringify(list))
}

// ─── Employees ───────────────────────────────────────────────────────────────

export function getEmployees(): Employee[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEYS.EMPLOYEES) || '[]') as Employee[]
    // Migrate legacy records that don't have paymentAsset
    return raw.map((e) => ({
      ...e,
      paymentAsset: e.paymentAsset ?? 'USDC',
    }))
  } catch {
    return []
  }
}

export function saveEmployee(e: Omit<Employee, 'id' | 'createdAt'>): Employee {
  const list = getEmployees()
  const item: Employee = { ...e, id: genId(), createdAt: Date.now() }
  list.unshift(item)
  localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(list))
  return item
}

export function deleteEmployee(id: string): void {
  const list = getEmployees().filter((e) => e.id !== id)
  localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(list))
}

export function updateEmployee(id: string, updates: Partial<Employee>): void {
  const list = getEmployees().map((e) => (e.id === id ? { ...e, ...updates } : e))
  localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(list))
}

// ─── Activity ─────────────────────────────────────────────────────────────────

export function getActivity(): ActivityRecord[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.ACTIVITY) || '[]') as ActivityRecord[]
  } catch {
    return []
  }
}

export function recordActivity(a: Omit<ActivityRecord, 'id'>): ActivityRecord {
  const list = getActivity()
  const item: ActivityRecord = { ...a, id: genId() }
  list.unshift(item)
  // Cap at 200 records
  if (list.length > 200) list.length = 200
  localStorage.setItem(STORAGE_KEYS.ACTIVITY, JSON.stringify(list))
  return item
}

// ─── Manual Expenses (off-chain) ─────────────────────────────────────────────

export function getExpenses(): ManualExpense[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.EXPENSES) || '[]') as ManualExpense[]
  } catch {
    return []
  }
}

export function saveExpense(e: Omit<ManualExpense, 'id' | 'createdAt' | 'updatedAt'>): ManualExpense {
  const list = getExpenses()
  const now = Date.now()
  const item: ManualExpense = { ...e, id: genId(), createdAt: now, updatedAt: now }
  list.unshift(item)
  localStorage.setItem(STORAGE_KEYS.EXPENSES, JSON.stringify(list))
  return item
}

export function updateExpense(id: string, updates: Partial<Omit<ManualExpense, 'id' | 'createdAt'>>): void {
  const list = getExpenses().map((e) =>
    e.id === id ? { ...e, ...updates, updatedAt: Date.now() } : e
  )
  localStorage.setItem(STORAGE_KEYS.EXPENSES, JSON.stringify(list))
}

export function deleteExpense(id: string): void {
  const list = getExpenses().filter((e) => e.id !== id)
  localStorage.setItem(STORAGE_KEYS.EXPENSES, JSON.stringify(list))
}
