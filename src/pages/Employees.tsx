import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2, Users, Pencil, Check, X, Bitcoin, DollarSign } from 'lucide-react'
import { isAddress } from 'viem'
import { toast } from 'sonner'
import { EmptyState } from '@/components/EmptyState'
import { CurrencySelector } from '@/components/CurrencySelector'
import { getEmployees, saveEmployee, deleteEmployee, updateEmployee } from '@/lib/storage'
import { CURRENCIES, CIRBTC_CONFIGURED, type CurrencyCode, type PaymentAsset } from '@/lib/constants'
import { formatAddress } from '@/lib/utils'
import type { Employee } from '@/lib/storage'

const BLANK: Omit<Employee, 'id' | 'createdAt'> = {
  name: '',
  address: '',
  employeeId: '',
  designation: '',
  currency: 'USD',
  salaryAmount: '',
  paymentAsset: 'USDC',
}

function AssetPill({
  value,
  onChange,
}: {
  value: PaymentAsset
  onChange: (a: PaymentAsset) => void
}) {
  return (
    <div
      className="flex rounded-xl overflow-hidden"
      style={{ border: '1px solid var(--border)' }}
    >
      {(['USDC', 'cirBTC'] as PaymentAsset[]).map((a) => (
        <button
          key={a}
          type="button"
          onClick={() => onChange(a)}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold transition-all"
          style={{
            background: value === a ? 'var(--accent)' : 'var(--surface-muted)',
            color: value === a ? 'white' : 'var(--muted)',
            opacity: a === 'cirBTC' && !CIRBTC_CONFIGURED ? 0.5 : 1,
          }}
        >
          {a === 'USDC' ? <DollarSign className="size-3" /> : <Bitcoin className="size-3" />}
          {a}
        </button>
      ))}
    </div>
  )
}

function EmployeeForm({
  initial,
  onSave,
  onCancel,
  saveLabel = 'Add employee',
}: {
  initial: Omit<Employee, 'id' | 'createdAt'>
  onSave: (data: Omit<Employee, 'id' | 'createdAt'>) => void
  onCancel: () => void
  saveLabel?: string
}) {
  const [form, setForm] = useState(initial)
  const set = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }))

  const handleSubmit = () => {
    if (!form.name.trim()) { toast.error('Enter employee name'); return }
    if (!isAddress(form.address)) { toast.error('Invalid wallet address'); return }
    if (!form.salaryAmount || parseFloat(form.salaryAmount) <= 0) { toast.error('Enter a valid salary'); return }
    if (form.paymentAsset === 'cirBTC' && !CIRBTC_CONFIGURED) {
      toast.error('cirBTC not configured — set VITE_CIRBTC_ADDRESS first')
      return
    }
    onSave({ ...form, name: form.name.trim(), designation: form.designation?.trim() || undefined, employeeId: form.employeeId?.trim() || undefined })
  }

  const currInfo = CURRENCIES.find((c) => c.code === form.currency)

  return (
    <div
      className="rounded-2xl p-4 space-y-3"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2">
          <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Full name *</label>
          <input
            placeholder="e.g. Rahim Ahmed"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
            style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)' }}
          />
        </div>
        <div>
          <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Employee ID</label>
          <input
            placeholder="EMP-001"
            value={form.employeeId ?? ''}
            onChange={(e) => set('employeeId', e.target.value)}
            className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
            style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)' }}
          />
        </div>
        <div>
          <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Designation</label>
          <input
            placeholder="Engineer"
            value={form.designation ?? ''}
            onChange={(e) => set('designation', e.target.value)}
            className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
            style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)' }}
          />
        </div>
      </div>

      <div>
        <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Wallet address *</label>
        <input
          placeholder="0x..."
          value={form.address}
          onChange={(e) => set('address', e.target.value.trim())}
          className="mono w-full rounded-xl px-3 py-2.5 text-sm outline-none"
          style={{
            background: 'var(--surface-muted)',
            border: `1px solid ${form.address && !isAddress(form.address) ? 'var(--danger)' : 'var(--border)'}`,
            color: 'var(--ink)',
          }}
        />
        {form.address && !isAddress(form.address) && (
          <p className="text-xs mt-1" style={{ color: 'var(--danger)' }}>Invalid address</p>
        )}
      </div>

      <div>
        <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>
          Monthly salary (local currency) *
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span
              className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold"
              style={{ color: 'var(--muted)' }}
            >
              {currInfo?.symbol}
            </span>
            <input
              placeholder="0"
              value={form.salaryAmount}
              onChange={(e) => {
                const v = e.target.value.replace(/[^0-9.]/g, '')
                if (v === '' || /^\d*\.?\d*$/.test(v)) set('salaryAmount', v)
              }}
              className="tabular-nums w-full rounded-xl pl-8 pr-3 py-2.5 text-sm outline-none"
              style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)' }}
            />
          </div>
          <CurrencySelector value={form.currency} onChange={(c: CurrencyCode) => set('currency', c)} compact />
        </div>
        <p className="text-xs mt-1" style={{ color: 'var(--subtle)' }}>
          Salary is stored in {form.currency}. Crypto equivalent is calculated at payment time using live FX rates.
        </p>
      </div>

      <div>
        <label className="text-xs font-medium mb-2 block" style={{ color: 'var(--muted)' }}>Payment asset</label>
        <AssetPill value={form.paymentAsset} onChange={(a) => setForm((p) => ({ ...p, paymentAsset: a }))} />
        {form.paymentAsset === 'cirBTC' && !CIRBTC_CONFIGURED && (
          <p className="text-xs mt-1.5" style={{ color: 'var(--warning)' }}>
            cirBTC address not configured. Set VITE_CIRBTC_ADDRESS in .env first.
          </p>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={handleSubmit}
          className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-white"
          style={{ background: 'var(--accent)' }}
        >
          {saveLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl px-4 py-2.5 text-sm font-medium"
          style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

export function Employees() {
  const [employees, setEmployees] = useState(() => getEmployees())
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const refresh = () => setEmployees(getEmployees())

  const handleAdd = (data: Omit<Employee, 'id' | 'createdAt'>) => {
    saveEmployee(data)
    refresh()
    setShowAdd(false)
    toast.success('Employee added')
  }

  const handleUpdate = (id: string, data: Omit<Employee, 'id' | 'createdAt'>) => {
    updateEmployee(id, data)
    refresh()
    setEditingId(null)
    toast.success('Employee updated')
  }

  const handleDelete = (id: string, name: string) => {
    deleteEmployee(id)
    refresh()
    toast.success(`${name} removed`)
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6 pb-28 md:pb-6 space-y-5">
      <div className="flex items-center gap-3">
        <Link to="/payroll" className="rounded-xl p-2 hover:bg-black/5 transition-all">
          <ArrowLeft className="size-4" style={{ color: 'var(--ink)' }} />
        </Link>
        <div className="flex-1">
          <h2 className="display text-xl font-bold" style={{ color: 'var(--ink)' }}>Employees</h2>
          <p className="text-xs" style={{ color: 'var(--subtle)' }}>
            {employees.length} employee{employees.length !== 1 ? 's' : ''} on payroll
          </p>
        </div>
        <button
          onClick={() => { setShowAdd((v) => !v); setEditingId(null) }}
          className="flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold text-white"
          style={{ background: 'var(--accent)' }}
        >
          <Plus className="size-3.5" />
          Add
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <EmployeeForm
          initial={{ ...BLANK }}
          onSave={handleAdd}
          onCancel={() => setShowAdd(false)}
          saveLabel="Add employee"
        />
      )}

      {/* List */}
      {employees.length === 0 && !showAdd ? (
        <EmptyState
          Icon={Users}
          title="No employees yet"
          description="Add employees to start running payroll"
          action={
            <button
              onClick={() => setShowAdd(true)}
              className="rounded-xl px-4 py-2 text-sm font-semibold text-white"
              style={{ background: 'var(--accent)' }}
            >
              Add first employee
            </button>
          }
        />
      ) : (
        <div className="space-y-2">
          {employees.map((emp) => {
            const currInfo = CURRENCIES.find((c) => c.code === emp.currency)
            const isEditing = editingId === emp.id

            if (isEditing) {
              return (
                <EmployeeForm
                  key={emp.id}
                  initial={{
                    name: emp.name,
                    address: emp.address,
                    employeeId: emp.employeeId ?? '',
                    designation: emp.designation ?? '',
                    currency: emp.currency,
                    salaryAmount: emp.salaryAmount,
                    paymentAsset: emp.paymentAsset,
                  }}
                  onSave={(data) => handleUpdate(emp.id, data)}
                  onCancel={() => setEditingId(null)}
                  saveLabel="Save changes"
                />
              )
            }

            return (
              <div
                key={emp.id}
                className="rounded-2xl p-4 flex items-center gap-3"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
              >
                {/* Avatar */}
                <div
                  className="size-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                  style={{
                    background: emp.paymentAsset === 'cirBTC' ? 'var(--warning)' : 'var(--accent)',
                  }}
                >
                  {emp.name.slice(0, 2).toUpperCase()}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{emp.name}</p>
                    {emp.designation && (
                      <span className="text-xs rounded-full px-2 py-0.5" style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}>
                        {emp.designation}
                      </span>
                    )}
                    {emp.employeeId && (
                      <span className="text-xs mono" style={{ color: 'var(--subtle)' }}>{emp.employeeId}</span>
                    )}
                  </div>
                  <p className="text-xs mono truncate mt-0.5" style={{ color: 'var(--subtle)' }}>
                    {formatAddress(emp.address)}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <p className="text-xs tabular-nums" style={{ color: 'var(--muted)' }}>
                      {currInfo?.symbol}{emp.salaryAmount} {emp.currency}/mo
                    </p>
                    <span
                      className="flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                      style={{
                        background: emp.paymentAsset === 'cirBTC' ? 'rgba(160,92,16,0.12)' : 'rgba(22,120,74,0.10)',
                        color: emp.paymentAsset === 'cirBTC' ? 'var(--warning)' : 'var(--success)',
                      }}
                    >
                      {emp.paymentAsset === 'cirBTC' ? <Bitcoin className="size-2.5" /> : <DollarSign className="size-2.5" />}
                      {emp.paymentAsset}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => { setEditingId(emp.id); setShowAdd(false) }}
                    className="rounded-xl p-2 hover:bg-black/5 transition-all"
                    title="Edit"
                  >
                    <Pencil className="size-3.5" style={{ color: 'var(--subtle)' }} />
                  </button>
                  <button
                    onClick={() => handleDelete(emp.id, emp.name)}
                    className="rounded-xl p-2 hover:bg-red-50 transition-all"
                    title="Remove"
                  >
                    <Trash2 className="size-3.5" style={{ color: 'var(--danger)' }} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {employees.length > 0 && (
        <div className="rounded-2xl px-4 py-3" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between text-xs">
            <span style={{ color: 'var(--muted)' }}>USDC employees</span>
            <span className="font-semibold" style={{ color: 'var(--ink)' }}>
              {employees.filter((e) => e.paymentAsset === 'USDC').length}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs mt-1">
            <span style={{ color: 'var(--muted)' }}>cirBTC employees</span>
            <span className="font-semibold" style={{ color: 'var(--ink)' }}>
              {employees.filter((e) => e.paymentAsset === 'cirBTC').length}
            </span>
          </div>
        </div>
      )}

      {/* Back to payroll */}
      <Link
        to="/payroll"
        className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition-all hover:bg-black/5"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--ink)' }}
      >
        <Check className="size-4" style={{ color: 'var(--success)' }} />
        Done — go to Payroll
        <X className="size-4 ml-auto" style={{ color: 'var(--subtle)' }} />
      </Link>
    </div>
  )
}
