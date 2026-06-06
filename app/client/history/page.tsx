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

// ─── Design tokens ────────────────────────────────────────────────────────────

const T = {
  bg:         '#F5F0E8',
  forest:     '#26452B',
  moss:       '#4D6B46',
  orange:     '#E08A3E',
  sand:       '#E6C89A',
  brown:      '#3B2A1F',
  cardBorder: '#E8E2D9',
  badgeBg:    '#EEE9E0',
  muted:      '#8A7E72',
  warmSand:   '#F5F0E0',
} as const

const FONT = "'Noto Sans', system-ui, sans-serif"

// ─── SVG icons ────────────────────────────────────────────────────────────────

function IconPaw({ size = 13, color = '#4D6B46' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={{ flexShrink: 0 }}>
      <circle cx="5.5" cy="5.5" r="2.5" />
      <circle cx="18.5" cy="5.5" r="2.5" />
      <circle cx="3.5" cy="11" r="2" />
      <circle cx="20.5" cy="11" r="2" />
      <path d="M12 13c-2.5 0-6 2.5-6 6 0 1.5 1 2 2 2h8c1 0 2-.5 2-2 0-3.5-3.5-6-6-6z" />
    </svg>
  )
}

function IconCheck({ size = 13, color = '#26452B' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function IconCalendar({ size = 12, color = '#4D6B46' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

function IconTag({ size = 16, color = '#E08A3E' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  )
}

function IconDot({ size = 8, color = '#E08A3E' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 8 8" style={{ flexShrink: 0 }}>
      <circle cx="4" cy="4" r="4" fill={color} />
    </svg>
  )
}

function IconX({ size = 11, color = '#C1562D' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
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
      <main style={{ backgroundColor: T.bg, fontFamily: FONT }} className="min-h-screen flex items-center justify-center px-6">
        <p style={{ color: T.muted }} className="text-sm">Loading…</p>
      </main>
    )
  }

  return (
    <main style={{ backgroundColor: T.bg, fontFamily: FONT }} className="min-h-screen px-5 pb-12">
      <div className="w-full max-w-sm mx-auto">

        {/* ── Header ── */}
        <div className="flex items-center gap-3 pt-12 pb-8">
          <button
            onClick={() => router.push('/client/home')}
            style={{ backgroundColor: T.cardBorder, color: T.forest, borderRadius: '50%', width: 36, height: 36, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0, lineHeight: 1 }}
          >
            ←
          </button>
          <h1 style={{ color: T.brown, fontWeight: 700, fontFamily: FONT }} className="text-lg">Hike history</h1>
        </div>

        {/* ── Completed hikes ── */}
        <section style={{ marginBottom: 28 }}>
          <SectionHeader title="Completed hikes" />
          {completed.length === 0 ? (
            <div style={{ backgroundColor: '#fff', border: `1px solid ${T.cardBorder}`, borderRadius: 16, padding: '20px 16px', textAlign: 'center' }}>
              <p style={{ color: T.muted, fontSize: 14, fontFamily: FONT }}>No completed hikes yet.</p>
            </div>
          ) : (
            <div style={{ backgroundColor: '#fff', border: `1px solid ${T.cardBorder}`, borderRadius: 16, overflow: 'hidden' }}>
              {completed.map((h, i) => (
                <div
                  key={h.bookingId}
                  style={i > 0 ? { borderTop: `1px solid ${T.cardBorder}`, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 } : { padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
                >
                  <div className="min-w-0">
                    <p style={{ color: T.brown, fontWeight: 700, fontFamily: FONT }} className="text-sm">
                      {formatShort(h.date)}
                    </p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <IconPaw size={13} color={T.moss} />
                      <p style={{ color: T.muted, fontSize: 13, fontFamily: FONT }}>
                        {h.dogName}{h.destination ? ` · ${h.destination}` : ''}
                      </p>
                    </div>
                  </div>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', backgroundColor: '#E8F0E5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <IconCheck size={13} color={T.forest} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Trail Pack ── */}
        <section style={{ marginBottom: 28 }}>
          <SectionHeader title="Trail Pack" />
          {packs.length === 0 ? (
            <div style={{ backgroundColor: '#fff', border: `1px solid ${T.cardBorder}`, borderRadius: 16, padding: '20px 16px', textAlign: 'center' }}>
              <p style={{ color: T.muted, fontSize: 14, fontFamily: FONT }}>No Trail Pack purchases yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {packs.map(pack => (
                <div
                  key={pack.id}
                  style={{ backgroundColor: T.warmSand, border: `1px solid ${T.sand}`, borderRadius: 16, padding: 16 }}
                >
                  <div className="flex items-center gap-3 mb-1">
                    <div style={{ width: 32, height: 32, borderRadius: '50%', backgroundColor: '#FEF3E2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <IconTag size={16} color={T.orange} />
                    </div>
                    <div>
                      <p style={{ color: T.brown, fontWeight: 700, fontSize: 16, fontFamily: FONT, lineHeight: 1.2 }}>
                        Trail Pack · 4 hikes
                      </p>
                      <p style={{ color: T.muted, fontSize: 13, fontFamily: FONT }}>
                        Purchased {formatShort(pack.purchaseDate.slice(0, 10))}
                      </p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
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
        <section style={{ paddingBottom: 16 }}>
          <SectionHeader title="Cancelled bookings" />
          {cancelled.length === 0 ? (
            <div style={{ backgroundColor: '#fff', border: `1px solid ${T.cardBorder}`, borderRadius: 16, padding: '20px 16px', textAlign: 'center' }}>
              <p style={{ color: T.muted, fontSize: 14, fontFamily: FONT }}>No cancellations.</p>
            </div>
          ) : (
            <div style={{ backgroundColor: '#fff', border: `1px solid ${T.cardBorder}`, borderRadius: 16, overflow: 'hidden' }}>
              {cancelled.map((c, i) => (
                <div
                  key={c.bookingId}
                  style={i > 0 ? { borderTop: `1px solid ${T.cardBorder}`, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 } : { padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
                >
                  <div className="min-w-0">
                    <p style={{ color: T.muted, fontFamily: FONT }} className="text-sm">
                      {formatShort(c.date)}
                    </p>
                    <p style={{ color: T.muted, fontSize: 13, fontFamily: FONT }} className="mt-0.5">
                      {c.dogName}
                    </p>
                  </div>
                  <span style={c.creditIssued
                    ? { backgroundColor: '#E8F0E5', color: T.forest, borderRadius: 20, padding: '3px 10px', fontSize: 12, fontFamily: FONT, flexShrink: 0, whiteSpace: 'nowrap' }
                    : { backgroundColor: '#FBE9E3', color: '#C1562D', borderRadius: 20, padding: '3px 10px', fontSize: 12, fontFamily: FONT, flexShrink: 0, whiteSpace: 'nowrap' }
                  }>
                    {c.creditIssued ? 'Credit issued' : 'Fee forfeited'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

      </div>
    </main>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div style={{ width: 3, height: 16, backgroundColor: T.forest, borderRadius: 2, flexShrink: 0 }} />
      <h2 style={{ color: T.brown, fontWeight: 700, fontFamily: FONT }} className="text-sm">{title}</h2>
    </div>
  )
}

function SlotRow({ index, slot }: { index: number; slot: HikeSlot }) {
  let iconBg: string
  let iconEl: React.ReactNode
  let mainText: string
  let mainColor: string
  let detail: string | null = null
  let detailColor: string = T.muted

  if (slot.status === 'used') {
    iconBg = '#E8F0E5'
    iconEl = <IconCheck size={12} color={T.forest} />
    mainText = 'Used'
    mainColor = T.brown
    const parts: string[] = []
    if (slot.date) parts.push(formatShort(slot.date))
    if (slot.dogName) parts.push(slot.dogName)
    if (slot.destination) parts.push(slot.destination)
    detail = parts.length > 0 ? parts.join(' · ') : null
    detailColor = T.muted
  } else if (slot.status === 'upcoming') {
    iconBg = T.badgeBg
    iconEl = <IconCalendar size={12} color={T.moss} />
    mainText = slot.date ? formatShort(slot.date) : 'Upcoming'
    mainColor = T.forest
    const parts: string[] = []
    if (slot.dogName) parts.push(slot.dogName)
    detail = parts.length > 0 ? parts.join(' · ') : null
    detailColor = T.moss
  } else if (slot.status === 'cancelled') {
    iconBg = '#FBE9E3'
    iconEl = <IconX size={11} color="#C1562D" />
    mainText = 'Cancelled'
    mainColor = T.muted
    const parts: string[] = []
    if (slot.date) parts.push(formatShort(slot.date))
    if (slot.dogName) parts.push(slot.dogName)
    detail = parts.length > 0 ? parts.join(' · ') : null
    detailColor = T.muted
  } else {
    // available
    iconBg = T.badgeBg
    iconEl = <IconDot size={8} color={T.orange} />
    mainText = 'Available'
    mainColor = T.orange
    detail = slot.expiresAt
      ? `Expires ${new Date(slot.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
      : null
    detailColor = T.muted
  }

  return (
    <div className="flex items-center gap-2">
      <span style={{ color: T.muted, fontSize: 13, fontFamily: FONT, width: 14, textAlign: 'right', flexShrink: 0 }}>
        {index}
      </span>
      <div style={{ width: 22, height: 22, borderRadius: '50%', backgroundColor: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {iconEl}
      </div>
      <p style={{ fontSize: 13, fontFamily: FONT, lineHeight: 1.4 }} className="min-w-0">
        <span style={{ color: mainColor }}>{mainText}</span>
        {detail && <span style={{ color: detailColor }}> · {detail}</span>}
      </p>
    </div>
  )
}
