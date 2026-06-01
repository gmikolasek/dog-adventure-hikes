'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

// Shape an exception row will take once the bookings table exists (Phase 4).
type ExceptionType = 'cancellation' | 'no_show' | 'holding_fee'
type ExceptionRow = {
  id: string
  type: ExceptionType
  clientName: string
  dogName: string
  date: string
  amount: number | null // holding fee / forfeited fee in ₮
  note: string | null
}

type Filter = 'all' | ExceptionType

const TABS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'cancellation', label: 'Cancellations' },
  { key: 'no_show', label: 'No-shows' },
  { key: 'holding_fee', label: 'Holding fees' },
]

const EMPTY: Record<Filter, { icon: string; text: string }> = {
  all: { icon: '✅', text: 'No exceptions logged.' },
  cancellation: { icon: '🚫', text: 'No cancellations yet.' },
  no_show: { icon: '🕒', text: 'No no-shows recorded.' },
  holding_fee: { icon: '💸', text: 'No holding fees charged.' },
}

export default function ExceptionsLog() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')

  // No bookings table yet, so there are no exceptions. The UI is wired to
  // render `rows` once that data source exists in Phase 4.
  const [rows] = useState<ExceptionRow[]>([])

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/'); return }
      const { data: profile } = await supabase
        .from('users').select('role').eq('id', session.user.id).maybeSingle()
      if (profile?.role !== 'staff') { router.push('/onboarding'); return }
      setReady(true)
    }
    load()
  }, [router])

  if (!ready) {
    return (
      <main className="min-h-screen bg-white flex items-center justify-center px-6">
        <p className="text-sm text-gray-400">Loading…</p>
      </main>
    )
  }

  const visible = filter === 'all' ? rows : rows.filter(r => r.type === filter)

  return (
    <main className="min-h-screen bg-white px-6 py-10">
      <div className="w-full max-w-sm mx-auto">

        <button
          onClick={() => router.push('/staff')}
          className="text-sm text-gray-500 hover:text-gray-700 mb-6"
        >
          ← Dashboard
        </button>

        <div className="mb-5">
          <h1 className="text-2xl font-semibold text-gray-900">Exceptions</h1>
          <p className="text-gray-500 mt-1 text-sm">Cancellations, no-shows &amp; holding fees</p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-2 mb-6">
          <MiniStat label="Cancellations" value={rows.filter(r => r.type === 'cancellation').length} />
          <MiniStat label="No-shows" value={rows.filter(r => r.type === 'no_show').length} />
          <MiniStat label="Holding ₮" value={rows.filter(r => r.type === 'holding_fee').reduce((s, r) => s + (r.amount ?? 0), 0)} />
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-5 overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                filter === t.key ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* List / empty state */}
        {visible.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 p-8 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-50 mb-3">
              <span className="text-2xl">{EMPTY[filter].icon}</span>
            </div>
            <p className="text-sm text-gray-500">{EMPTY[filter].text}</p>
            <p className="text-xs text-gray-400 mt-1">
              Exceptions will appear here once the booking flow is live.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {visible.map(row => (
              <ExceptionCard key={row.id} row={row} />
            ))}
          </div>
        )}

      </div>
    </main>
  )
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-gray-200 p-3 text-center">
      <p className="text-xl font-semibold text-gray-900">{value.toLocaleString()}</p>
      <p className="text-[11px] text-gray-500 mt-0.5">{label}</p>
    </div>
  )
}

const TYPE_BADGE: Record<ExceptionType, { label: string; cls: string }> = {
  cancellation: { label: 'Cancellation', cls: 'bg-amber-100 text-amber-700' },
  no_show: { label: 'No-show', cls: 'bg-red-100 text-red-700' },
  holding_fee: { label: 'Holding fee', cls: 'bg-blue-100 text-blue-700' },
}

function ExceptionCard({ row }: { row: ExceptionRow }) {
  const badge = TYPE_BADGE[row.type]
  return (
    <div className="rounded-2xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-semibold text-gray-900">{row.clientName}</span>
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${badge.cls}`}>
          {badge.label}
        </span>
      </div>
      <p className="text-xs text-gray-500">{row.dogName} · {row.date}</p>
      {row.amount != null && <p className="text-xs text-gray-700 mt-1">₮{row.amount.toLocaleString()}</p>}
      {row.note && <p className="text-xs text-gray-600 mt-1">{row.note}</p>}
    </div>
  )
}
