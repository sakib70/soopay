import { useState } from 'react'
import { ExternalLink, Activity as ActivityIcon, Bitcoin, DollarSign, ArrowLeftRight, ArrowUpRight, ArrowDownLeft } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { getActivity, type ActivityRecord } from '@/lib/storage'
import { buildArcScanTxUrl, truncateHash, relativeTime, formatUsdcAmount, formatCirBtcAmount } from '@/lib/utils'
import { ARCSCAN_BASE } from '@/lib/constants'

const TYPE_LABELS: Record<ActivityRecord['type'], string> = {
  send:    'Send',
  receive: 'Receive',
  bridge:  'Bridge',
  payroll: 'Payroll',
}

function ActivityIcon2({ type, asset }: { type: ActivityRecord['type']; asset: 'USDC' | 'cirBTC' }) {
  const colors = {
    send:    { bg: 'rgba(192,41,63,0.10)',  fg: 'var(--danger)' },
    receive: { bg: 'rgba(22,120,74,0.10)',  fg: 'var(--success)' },
    bridge:  { bg: 'rgba(15,32,53,0.08)',   fg: 'var(--accent-hover)' },
    payroll: { bg: 'rgba(22,120,74,0.10)',  fg: 'var(--accent)' },
  }
  const { bg, fg } = colors[type]
  return (
    <div className="size-9 rounded-full flex items-center justify-center shrink-0" style={{ background: bg, color: fg }}>
      {type === 'send'    && <ArrowUpRight   className="size-4" />}
      {type === 'receive' && <ArrowDownLeft  className="size-4" />}
      {type === 'bridge'  && <ArrowLeftRight className="size-4" />}
      {type === 'payroll' && (asset === 'cirBTC' ? <Bitcoin className="size-4" /> : <DollarSign className="size-4" />)}
    </div>
  )
}

function formatAmount(record: ActivityRecord): string {
  try {
    const raw = BigInt(record.amountRaw)
    if (record.asset === 'USDC') return `${formatUsdcAmount(raw, 2)} USDC`
    return `${formatCirBtcAmount(raw, record.decimals)} cirBTC`
  } catch {
    return `— ${record.asset}`
  }
}

export function Activity() {
  const [filter, setFilter] = useState<ActivityRecord['type'] | 'all'>('all')
  const allActivity = getActivity()
  const filtered = filter === 'all' ? allActivity : allActivity.filter((a) => a.type === filter)

  const counts: Record<string, number> = { all: allActivity.length }
  for (const a of allActivity) counts[a.type] = (counts[a.type] ?? 0) + 1

  return (
    <div className="max-w-lg mx-auto px-4 py-6 pb-28 md:pb-6 space-y-5">
      <div>
        <h2 className="display text-2xl font-bold" style={{ color: 'var(--ink)' }}>Activity</h2>
        <p className="text-sm mt-0.5" style={{ color: 'var(--subtle)' }}>
          On-chain transaction history
        </p>
      </div>

      {/* Filters */}
      <div className="flex gap-1.5 flex-wrap">
        {(['all', 'send', 'payroll', 'bridge', 'receive'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="rounded-full px-3 py-1 text-xs font-medium capitalize transition-all"
            style={{
              background: filter === f ? 'var(--accent)' : 'var(--surface-muted)',
              color: filter === f ? 'white' : 'var(--ink-2)',
              border: '1px solid transparent',
            }}
          >
            {f === 'all' ? 'All' : TYPE_LABELS[f]}
            {counts[f] ? <span className="ml-1 opacity-70">({counts[f]})</span> : null}
          </button>
        ))}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <EmptyState
          Icon={ActivityIcon}
          title="No activity yet"
          description="Send or bridge USDC to see your history here"
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="rounded-2xl p-4 flex items-center gap-3"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            >
              <ActivityIcon2 type={item.type} asset={item.asset} />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                    {TYPE_LABELS[item.type]} {item.asset}
                    {item.type === 'payroll' && item.employeeCount && item.employeeCount > 1
                      ? ` · ${item.employeeCount} employees`
                      : null
                    }
                  </p>
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{
                      background: item.status === 'confirmed' ? 'rgba(22,120,74,0.10)' : 'rgba(192,41,63,0.10)',
                      color: item.status === 'confirmed' ? 'var(--success)' : 'var(--danger)',
                    }}
                  >
                    {item.status}
                  </span>
                </div>

                {/* To/From */}
                {item.to && item.type !== 'payroll' && (
                  <p className="text-xs mono truncate mt-0.5" style={{ color: 'var(--subtle)' }}>
                    → {item.to.slice(0, 10)}…{item.to.slice(-6)}
                  </p>
                )}
                {item.type === 'payroll' && item.to && (
                  <p className="text-xs mono truncate mt-0.5" style={{ color: 'var(--subtle)' }}>
                    via contract {item.to.slice(0, 10)}…
                  </p>
                )}

                {/* Tx hash */}
                <p className="text-xs mono truncate mt-0.5" style={{ color: 'var(--subtle)' }}>
                  {truncateHash(item.txHash)}
                </p>

                {/* Local amount */}
                {item.localAmount && item.localCurrency && (
                  <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                    {item.localAmount} {item.localCurrency}
                  </p>
                )}
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--subtle)' }}>
                  {relativeTime(item.timestamp)}
                </p>
              </div>

              {/* Amount + link */}
              <div className="text-right shrink-0 flex flex-col items-end gap-1.5">
                <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                  {formatAmount(item)}
                </p>
                <a
                  href={buildArcScanTxUrl(item.txHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 rounded-lg hover:bg-black/5 transition-all flex items-center gap-1 text-xs"
                  style={{ color: 'var(--subtle)' }}
                  title="View on ArcScan"
                >
                  <ExternalLink className="size-3.5" />
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      {allActivity.length > 0 && (
        <a
          href={ARCSCAN_BASE}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 text-xs font-medium py-2"
          style={{ color: 'var(--accent-hover)' }}
        >
          View all on ArcScan <ExternalLink className="size-3" />
        </a>
      )}
    </div>
  )
}
