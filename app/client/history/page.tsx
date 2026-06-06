'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { getUserState, landingRoute } from '@/lib/userState'
import { formatShort, TRAIL_PACK_PRICE, TRAIL_PACK_CREDITS } from '@/lib/booking'

// ─── Types ───────────────────────────────────────────────────────────────────

type HikeSlotStatus = 'used' | 'upcoming' | 'available' | 'cancelled'

type HikeSlot = {
  status: HikeSlotStatus
  date?: string
  dogName?: string
  destination?: string | null
  expiresAt?: string | null
}

type TrailPackDisplay = {
  id: string
  purchaseDate: string
  expiresAt: string | null
  slots: HikeSlot[] // always 4: [purchase hike, credit 2, credit 3, credit 4]
}

type CompletedHike = {
  bookingId: string
  date: string
  destination: string | null
  dogName: string
}

type CancelledBooking = {
  bookingId: string
  date: string
  dogName: string
  creditIssued: boolean
  cancelledAt: string | null
}

type BookingRow = {
  id: string
  dog_id: string
  hike_day_id: string
  status: string
  cancelled_at: string | null
  credit_used: number
  amount_charged: number
  dropped_off_at: string | null
  created_at: string
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function HistoryPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [completed, setCompleted] = useState<CompletedHike[]>([])
  const [packs, setPacks] = useState<TrailPackDisplay[]>([])
  const [cancelled, setCancelled] = useState<CancelledBooking[]>([])

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/'); return }

      const state = await getUserState(session.user.id)
      if (landingRoute(state) !== '/client/home') { router.push(landingRoute(state)); return }

      const dogNameById: Record<string, string> = {}
      for (const dog of state.dogs) dogNameById[dog.id] = dog.name

      const today = new Date().toISOString().slice(0, 10)

      // All bookings ordered chronologically (needed for pack pairing)
      const { data: bRows } = await supabase
        .from('bookings')
        .select('id, dog_id, hike_day_id, status, cancelled_at, credit_used, amount_charged, dropped_off_at, created_at')
        .eq('owner_id', session.user.id)
        .in('status', ['confirmed', 'cancelled', 'no_show'])
        .order('created_at', { ascending: true })

      const bookings = (bRows ?? []) as BookingRow[]
      console.log('[history] today (UTC):', today, '| bookings fetched:', bookings.length, bookings.map(b => ({ id: b.id.slice(0, 8), status: b.status, hike_day_id: b.hike_day_id.slice(0, 8), dropped_off_at: b.dropped_off_at })))

      let dayById: Record<string, { date: string; destination_override: string | null }> = {}
      if (bookings.length) {
        const dayIds = [...new Set(bookings.map(b => b.hike_day_id))]
        const { data: dayRows } = await supabase
          .from('hike_days')
          .select('id, date, destination_override')
          .in('id', dayIds)
        console.log('[history] hike_days fetched:', (dayRows ?? []).length, (dayRows ?? []).map(d => ({ id: d.id.slice(0, 8), date: d.date })))
        for (const d of dayRows ?? []) dayById[d.id] = d
      }

      // Trail Pack credits — all rows including historical (no active-only filter)
      const { data: creditRows } = await supabase
        .from('trail_pack_credits')
        .select('id, credits_remaining, expires_at, created_at')
        .eq('owner_id', session.user.id)
        .order('created_at', { ascending: true })

      const rawPackRows = (creditRows ?? []) as Array<{
        id: string; credits_remaining: number; expires_at: string | null; created_at: string
      }>

      // Deduplicate: a fast double-submit can insert two near-identical rows
      // within the same second. Keep the first of any group sharing a
      // second-level created_at timestamp (they're the same logical purchase).
      const seenSecond = new Set<string>()
      const packRows = rawPackRows.filter(r => {
        const key = r.created_at.slice(0, 19) // "YYYY-MM-DDTHH:MM:SS"
        if (seenSecond.has(key)) return false
        seenSecond.add(key)
        return true
      })

      // Helpers
      function bookingSlot(b: BookingRow | undefined): HikeSlot {
        if (!b) return { status: 'available' }
        const day = dayById[b.hike_day_id]
        const date = day?.date
        const destination = day?.destination_override ?? null
        const dogName = dogNameById[b.dog_id] ?? 'Your dog'
        if (b.status === 'cancelled' || b.status === 'no_show') {
          return { status: 'cancelled', date, dogName }
        }
        if (b.dropped_off_at || (date && date < today)) {
          return { status: 'used', date, dogName, destination }
        }
        return { status: 'upcoming', date, dogName }
      }

      // Pack-purchase bookings: amount_charged = TRAIL_PACK_PRICE (the hike that triggered the pack buy)
      const packPurchaseBookings = bookings.filter(b => b.amount_charged === TRAIL_PACK_PRICE)
      // Credit-used bookings (non-cancelled): used a banked credit for a hike
      const creditUsedBookings = bookings.filter(b => b.credit_used > 0 && b.status !== 'cancelled')

      // Pair each trail_pack_credits row with its purchase hike and credit-used bookings.
      // Bookings are matched chronologically: purchase hike = most recent pack-purchase booking
      // created at or before this credits row; banked credits = bookings in the window after
      // this row's created_at and before the next row's created_at.
      const usedPurchaseIds = new Set<string>()

      const packDisplays: TrailPackDisplay[] = packRows.map((pack, idx) => {
        const nextPack = packRows[idx + 1]

        // Credit 1 — the hike paid at pack purchase time
        const purchaseBooking = packPurchaseBookings
          .filter(b => b.created_at <= pack.created_at && !usedPurchaseIds.has(b.id))
          .at(-1) // last in ascending order = most recent before this pack
        if (purchaseBooking) usedPurchaseIds.add(purchaseBooking.id)

        // Credits 2-4 — bookings that consumed banked credits from this pack
        const creditsInWindow = creditUsedBookings.filter(b => {
          if (b.created_at <= pack.created_at) return false
          if (nextPack && b.created_at >= nextPack.created_at) return false
          return true
        })
        const creditsUsed = TRAIL_PACK_CREDITS - pack.credits_remaining // 0–3

        const slots: HikeSlot[] = [bookingSlot(purchaseBooking)]
        for (let i = 0; i < TRAIL_PACK_CREDITS; i++) {
          slots.push(i < creditsUsed
            ? bookingSlot(creditsInWindow[i])
            : { status: 'available', expiresAt: pack.expires_at }
          )
        }

        return { id: pack.id, purchaseDate: pack.created_at, expiresAt: pack.expires_at, slots }
      })

      // Completed + cancelled lists
      const completedList: CompletedHike[] = []
      const cancelledList: CancelledBooking[] = []

      for (const b of bookings) {
        const day = dayById[b.hike_day_id]
        if (!day) continue

        // A hike is "completed" if the date is strictly in the past OR if
        // dropped_off_at is set (dog was returned today — same-day hikes pass
        // the date < today check only starting tomorrow UTC).
        if (b.status === 'confirmed' && (b.dropped_off_at || day.date < today)) {
          console.log('[history] completed hit:', { date: day.date, today, dropped_off_at: b.dropped_off_at })
          completedList.push({
            bookingId: b.id,
            date: day.date,
            destination: day.destination_override,
            dogName: dogNameById[b.dog_id] ?? 'Your dog',
          })
        }

        if (b.status === 'cancelled' || b.status === 'no_show') {
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
      setPacks(packDisplays)
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

        {/* ── Trail Pack ── */}
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Trail Pack</h2>
          {packs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 p-6 text-center">
              <p className="text-sm text-gray-400">No Trail Pack purchases yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {packs.map(pack => (
                <div key={pack.id} className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-4">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-semibold text-gray-900">Trail Pack · 4 hikes</p>
                    <span className="text-lg">🎒</span>
                  </div>
                  <p className="text-xs text-gray-500 mb-3">
                    Purchased {formatShort(pack.purchaseDate.slice(0, 10))}
                  </p>
                  <div className="space-y-1.5">
                    {pack.slots.map((slot, i) => (
                      <SlotRow key={i} index={i + 1} slot={slot} />
                    ))}
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

// ─── Slot row ─────────────────────────────────────────────────────────────────

function SlotRow({ index, slot }: { index: number; slot: HikeSlot }) {
  let icon: string
  let textColor: string
  let label: string

  if (slot.status === 'used') {
    icon = '✅'
    textColor = 'text-gray-700'
    const parts: string[] = []
    if (slot.date) parts.push(formatShort(slot.date))
    if (slot.dogName) parts.push(slot.dogName)
    if (slot.destination) parts.push(slot.destination)
    label = `Used · ${parts.join(' · ')}`
  } else if (slot.status === 'upcoming') {
    icon = '🗓'
    textColor = 'text-blue-700'
    const parts: string[] = []
    if (slot.date) parts.push(formatShort(slot.date))
    if (slot.dogName) parts.push(slot.dogName)
    label = `Upcoming · ${parts.join(' · ')}`
  } else if (slot.status === 'cancelled') {
    icon = '❌'
    textColor = 'text-gray-400'
    const parts: string[] = []
    if (slot.date) parts.push(formatShort(slot.date))
    if (slot.dogName) parts.push(slot.dogName)
    label = `Cancelled · ${parts.join(' · ')}`
  } else {
    icon = '✨'
    textColor = 'text-amber-700'
    label = slot.expiresAt
      ? `Available · expires ${new Date(slot.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
      : 'Available'
  }

  return (
    <div className="flex items-start gap-2">
      <span className="text-[11px] font-semibold text-gray-400 mt-0.5 w-4 flex-shrink-0 text-right">{index}</span>
      <span className="text-sm flex-shrink-0 leading-tight">{icon}</span>
      <span className={`text-xs ${textColor} leading-relaxed`}>{label}</span>
    </div>
  )
}
