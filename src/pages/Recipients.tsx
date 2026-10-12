import { useState } from 'react'
import { UserCheck, Plus, Trash2, Send } from 'lucide-react'
import { isAddress } from 'viem'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { EmptyState } from '@/components/EmptyState'
import { CurrencySelector } from '@/components/CurrencySelector'
import { getRecipients, saveRecipient, deleteRecipient } from '@/lib/storage'
import { CURRENCIES, type CurrencyCode } from '@/lib/constants'
import { formatAddress } from '@/lib/utils'

export function Recipients() {
  const navigate = useNavigate()
  const [recipients, setRecipients] = useState(() => getRecipients())
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [recCurrency, setRecCurrency] = useState<CurrencyCode>('USD')
  const [memo, setMemo] = useState('')

  const handleAdd = () => {
    if (!name.trim()) { toast.error('Enter recipient name'); return }
    if (!isAddress(address)) { toast.error('Invalid wallet address'); return }
    saveRecipient({ name: name.trim(), address, currency: recCurrency, memo: memo.trim() || undefined })
    setRecipients(getRecipients())
    setShowForm(false)
    setName(''); setAddress(''); setMemo('')
    toast.success('Recipient saved')
  }

  const handleDelete = (id: string) => {
    deleteRecipient(id)
    setRecipients(getRecipients())
    toast.success('Recipient removed')
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6 pb-28 md:pb-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="display text-2xl font-bold" style={{ color: 'var(--ink)' }}>Recipients</h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--subtle)' }}>Saved addresses for quick payments</p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold text-white"
          style={{ background: 'var(--accent)' }}
        >
          <Plus className="size-3.5" />
          Add
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div
          className="rounded-2xl p-4 space-y-3"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <h3 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>New recipient</h3>
          <input
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
            style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)' }}
          />
          <input
            placeholder="Wallet address (0x...)"
            value={address}
            onChange={(e) => setAddress(e.target.value.trim())}
            className="mono w-full rounded-xl px-3 py-2.5 text-sm outline-none"
            style={{
              background: 'var(--surface-muted)',
              border: `1px solid ${address && !isAddress(address) ? 'var(--danger)' : 'var(--border)'}`,
              color: 'var(--ink)',
            }}
          />
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: 'var(--muted)' }}>Preferred currency:</span>
            <CurrencySelector value={recCurrency} onChange={setRecCurrency} compact />
          </div>
          <input
            placeholder="Memo (optional)"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
            style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)' }}
          />
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleAdd}
              className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-white"
              style={{ background: 'var(--accent)' }}
            >
              Save recipient
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="rounded-xl px-4 py-2.5 text-sm"
              style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {recipients.length === 0 && !showForm ? (
        <EmptyState
          Icon={UserCheck}
          title="No recipients yet"
          description="Save frequent recipients for quick payments"
        />
      ) : (
        <div className="space-y-2">
          {recipients.map((r) => {
            const currInfo = CURRENCIES.find((c) => c.code === r.currency)
            return (
              <div
                key={r.id}
                className="rounded-2xl p-4 flex items-center gap-3"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
              >
                <div
                  className="size-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                  style={{ background: 'var(--accent)' }}
                >
                  {r.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{r.name}</p>
                  <p className="text-xs mono truncate" style={{ color: 'var(--subtle)' }}>
                    {formatAddress(r.address)}
                  </p>
                  {r.memo && (
                    <p className="text-xs truncate mt-0.5" style={{ color: 'var(--muted)' }}>{r.memo}</p>
                  )}
                  {currInfo && (
                    <p className="text-[10px] mt-0.5" style={{ color: 'var(--subtle)' }}>
                      Prefers {currInfo.code}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => { void navigate(`/send?to=${r.address}`) }}
                    className="rounded-xl p-2 hover:bg-black/5 transition-all"
                    title="Send"
                  >
                    <Send className="size-4" style={{ color: 'var(--accent)' }} />
                  </button>
                  <button
                    onClick={() => handleDelete(r.id)}
                    className="rounded-xl p-2 hover:bg-red-50 transition-all"
                    title="Delete"
                  >
                    <Trash2 className="size-4" style={{ color: 'var(--danger)' }} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
