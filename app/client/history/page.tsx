'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { getUserState, landingRoute } from '@/lib/userState'
import { formatShort } from '@/lib/booking'

type CompletedHike = {
  bookingId: string
  date: string
  destination: string | null
  dogName: string
}

type CreditActivity = {
  id: string
  creditsRemaining: number
  purchaseDate: string
  expiresAt: string | null
  usedToDate: number // derived: pack_size - remaining (we don't have raw pack size, so we track it differently)
}

type CancelledBooking = {
  bookingId: string
  date: string
  dogName: string
  creditIssued: boolean // true if cancelled_at < 5pm UB the day before
  cancelledAt: string | null
}

export default function HistoryPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [completed, setCompleted] = useState<CompletedHike[]>([])
  const [credits, setCredits] = useState<CreditActivity[]>([])
  const [cancelled, setCancelled] = useState<CancelledBooking[]>([])

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/'); return }

      const state = await getUserState(session.user.id)
      if (landingRoute(state) !== '/client/home') { router.push(landingRoute(state)); return }

      const dogNameById: Record<string, string> = {}
      for (const dog of state.dogs) dogNameById[dog.id] = dog.name

      // All bookings
      const { data: bRows } = await supabase
        .from('bookings')
        .select('id, dog_id, hike_day_id, status, cancelled_at, credit_used')
        .eq('owner_id', session.user.id)
        .in('status', ['confirmed', 'cancelled', 'no_show'])
        .order('created_at', { ascending: false })

      const bookings = (bRows ?? []) as Array<{
        id: string; dog_id: string; hike_day_id: string;
        status: string; cancelled_at: string | null; credit_used: number
      }>

      if (bookings.length) {
        const dayIds = [...new Set(bookings.map(b => b.hike_day_id))]
        const { data: dayRows } = await supabase
          .from('hike_days')
          .select('id, date, destination_override')
          .in('id', dayIds)
        const dayById: Record<string, { date: string; destination_override: string | null }> = {}
        for (const d of dayRows ?? []) dayById[d.id] = d

        const today = new Date().toISOString().slice(0, 10)

        const completedList: CompletedHike[] = []
        const cancelledList: CancelledBooking[] = []

        for (const b of bookings) {
          const day = dayById[b.hike_day_id]
          if (!day) continue

          if (b.status === 'confirmed' && day.date < today) {
            completedList.push({
              bookingId: b.id,
              date: day.date,
              destination: day.destination_override,
              dogName: dogNameById[b.dog_id] ?? 'Your dog',
            })
          }

          if (b.status === 'cancelled' || b.status === 'no_show') {
            // Credit was issued if credit_used > 0 on the row OR we check cancelled_at vs cutoff.
            // Simplest proxy: credit_used > 0 means they had credits, but that's for Trail Pack credits
            // used AT booking. For cancellation credit we check cancelled_at vs cutoff.
            let creditIssued = false
            if (b.cancelled_at && day.date) {
              const [y, m, d] = day.date.split('-').map(Number)
              const cutoff = new Date(Date.UTC(y, m - 1, d - 1, 9, 0, 0)) // 5pm UB the day before
              creditIssued = new Date(b.cancelled_at) < cutoff
            }
            cancelledList.push({
              bookingId: b.id,
              date: day.date,
              dogName: dogNameById[b.dog_id] ?? 'Your dog',
              creditIssued,
              cancelledAt: b.cancelled_at,
            })
          }
        }

        completedList.sort((a, b) => b.date.localeCompare(a.date))
        cancelledList.sort((a, b) => b.date.localeCompare(a.date))
        setCompleted(completedList)
        setCancelled(cancelledList)
      }

      // Trail Pack credits
      const nowIso = new Date().toISOString()
      const { data: creditRows } = await supabase
        .from('trail_pack_credits')
        .select('id, credits_remaining, purchase_amount, expires_at, created_at')
        .eq('owner_id', session.user.id)
        .order('created_at', { ascending: false })

      const creditList: CreditActivity[] = (creditRows ?? [])
        .filter((r: { credits_remaining: number; expires_at: string | null }) =>
          r.credits_remaining > 0 || !r.expires_at || r.expires_at > nowIso
        )
        .map((r: { id: string; credits_remaining: number; purchase_amount: number; expires_at: string | null; created_at: string }) => ({
          id: r.id,
          creditsRemaining: r.credits_remaining,
          purchaseDate: r.created_at,
          expiresAt: r.expires_at,
          usedToDate: Math.max(0, 3 - r.credits_remaining), // Trail Pack gives 3 credits
        }))

      setCredits(creditList)
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

  return (
    <main className="min-h-screen bg-white px-6 py-10">
      <div className="w-full max-w-sm mx-auto">

        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => router.push('/client/home')}
            className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 text-lg leading-none"
          >
            ←
          </button>
          <h1 className="text-lg font-semibold text-gray-900">Hike history</h1>
        </div>

        {/* ── Completed hikes ── */}
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Completed hikes</h2>
          {completed.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 p-6 text-center">
              <p className="text-sm text-gray-400">No completed hikes yet.</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
              {completed.map(h => (
                <div key={h.bookingId} className="px-4 py-3 flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">{formatShort(h.date)}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {h.dogName}{h.destination ? ` · ${h.destination}` : ''}
                    </p>
                  </div>
                  <span className="text-lg ml-3 flex-shrink-0">✅</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Trail Pack activity ── */}
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Trail Pack</h2>
          {credits.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 p-6 text-center">
              <p className="text-sm text-gray-400">No Trail Pack purchases yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {credits.map(c => (
                <div key={c.id} className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-gray-900">
                      {c.creditsRemaining} credit{c.creditsRemaining !== 1 ? 's' : ''} remaining
                    </p>
                    <span className="text-lg">🎒</span>
                  </div>
                  <div className="space-y-1">
                    <Row label="Purchased" value={formatShort(c.purchaseDate.slice(0, 10))} />
                    <Row label="Used to date" value={`${c.usedToDate} of 3`} />
                    {c.expiresAt && (
                      <Row
                        label="Expires"
                        value={new Date(c.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Cancelled bookings ── */}
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Cancelled bookings</h2>
          {cancelled.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 p-6 text-center">
              <p className="text-sm text-gray-400">No cancellations.</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
              {cancelled.map(c => (
                <div key={c.bookingId} className="px-4 py-3">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">{formatShort(c.date)}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{c.dogName}</p>
                    </div>
                    <span className={`ml-3 flex-shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${
                      c.creditIssued ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                    }`}>
                      {c.creditIssued ? 'Credit issued' : 'Fee forfeited'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

      </div>
    </main>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-xs font-medium text-gray-800">{value}</span>
    </div>
  )
}
