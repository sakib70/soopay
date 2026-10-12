import { useState } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { CURRENCIES, type CurrencyCode } from '@/lib/constants'
import { cn } from '@/lib/utils'

interface CurrencySelectorProps {
  value: CurrencyCode
  onChange: (code: CurrencyCode) => void
  compact?: boolean
}

export function CurrencySelector({ value, onChange, compact = false }: CurrencySelectorProps) {
  const [open, setOpen] = useState(false)

  const selected = CURRENCIES.find((c) => c.code === value)!

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center gap-1.5 rounded-xl font-medium transition-all hover:bg-black/5',
          compact ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2 text-sm',
        )}
        style={{
          background: 'var(--surface-muted)',
          color: 'var(--ink)',
          border: '1px solid var(--border)',
        }}
      >
        <span>{selected.symbol}</span>
        <span>{selected.code}</span>
        <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
          />
          <div
            className="absolute left-0 top-full z-20 mt-1.5 w-52 overflow-hidden rounded-2xl py-1 shadow-xl"
            style={{
              background: 'var(--surface-strong)',
              backdropFilter: 'blur(20px)',
              border: '1px solid var(--border)',
            }}
          >
            {CURRENCIES.map((c) => (
              <button
                key={c.code}
                onClick={() => { onChange(c.code); setOpen(false) }}
                className="flex w-full items-center justify-between px-4 py-2.5 text-sm hover:bg-black/5 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-base">{c.symbol}</span>
                  <div className="text-left">
                    <div className="font-medium text-xs" style={{ color: 'var(--ink)' }}>{c.code}</div>
                    <div className="text-[10px]" style={{ color: 'var(--subtle)' }}>{c.name}</div>
                  </div>
                </div>
                {c.code === value && (
                  <Check className="size-3.5" style={{ color: 'var(--accent)' }} />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
