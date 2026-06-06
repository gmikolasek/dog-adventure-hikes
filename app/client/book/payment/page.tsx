'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import { getUserState, landingRoute, type Dog } from '@/lib/userState'
import {
  PRICE_PER_DOG, TRAIL_PACK_PRICE, TRAIL_PACK_SAVING, TRAIL_PACK_CREDITS,
  getAvailableCredits, deductCredits, addTrailPack, getBookedCounts, spotsLeft,
  formatFull, type HikeDay, type CreditRow, type Method,
} from '@/lib/booking'

// ─── Design tokens ────────────────────────────────────────────────────────────

const T = {
  bg:         '#F5F0E8',
  forest:     '#26452B',
  moss:       '#4D6B46',
  brown:      '#3B2A1F',
  muted:      '#8A7E72',
  cardBorder: '#E8E2D9',
  divider:    '#F0EBE3',
  badgeBg:    '#EEE9E0',
  selectedBg: '#E8F0E5',
  orange:     '#E08A3E',
  sand:       '#E6C89A',
  packBg:     '#F5F0E0',
} as const

const FONT = "'Noto Sans', system-ui, sans-serif"

// ─── Icons ────────────────────────────────────────────────────────────────────

function IconArrowLeft({ size = 16, color = T.forest }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5M12 5l-7 7 7 7" />
    </svg>
  )
}

function IconCheck({ size = 14, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function IconTag({ size = 16, color = T.orange }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

function IconInfo({ size = 15, color = T.orange }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="8" strokeWidth="3" />
      <line x1="12" y1="12" x2="12" y2="16" />
    </svg>
  )
}

// ─── Page shell ───────────────────────────────────────────────────────────────

export default function Payment() {
  return (
    <Suspense fallback={
      <main style={{ backgroundColor: T.bg, fontFamily: FONT }} className="min-h-screen flex items-center justify-center px-6">
        <p style={{ color: T.muted, fontSize: 14 }}>Loading…</p>
      </main>
    }>
      <PaymentInner />
    </Suspense>
  )
}

// ─── Inner page ───────────────────────────────────────────────────────────────

function PaymentInner() {
  const router = useRouter()
  const params = useSearchParams()

  const dayId = params.get('day')
  const dogIds = (params.get('dogs') ?? '').split(',').filter(Boolean)
  const pickup = params.get('pickup') as Method | null
  const dropoff = params.get('dropoff') as Method | null

  const [ready, setReady] = useState(false)
  const [ownerId, setOwnerId] = useState('')
  const [hikeDay, setHikeDay] = useState<HikeDay | null>(null)
  const [dogs, setDogs] = useState<Dog[]>([])
  const [creditRows, setCreditRows] = useState<CreditRow[]>([])
  const [availableCredits, setAvailableCredits] = useState(0)

  const [buyTrailPack, setBuyTrailPack] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState('')
  const confirmLock = useRef(false)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/'); return }
      setOwnerId(session.user.id)

      const state = await getUserState(session.user.id)
      if (landingRoute(state) !== '/client/home') { router.push(landingRoute(state)); return }

      if (!dayId || dogIds.length === 0 || !pickup || !dropoff) { router.push('/client/book'); return }

      const { data: dayRow } = await supabase.from('hike_days').select('*').eq('id', dayId).maybeSingle()
      const selectedDogs = state.dogs.filter(d => dogIds.includes(d.id))
      if (!dayRow || selectedDogs.length === 0) { router.push('/client/book'); return }
      setHikeDay(dayRow as HikeDay)
      setDogs(selectedDogs)

      const credit = await getAvailableCredits(session.user.id)
      setCreditRows(credit.rows)
      setAvailableCredits(credit.total)

      setReady(true)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  const dogCount = dogs.length
  const creditsToUse = Math.min(availableCredits, dogCount)
  const dogsToCharge = dogCount - creditsToUse
  const canBuyPack = dogsToCharge >= 1
  const applyPack = buyTrailPack && canBuyPack
  const total = applyPack
    ? TRAIL_PACK_PRICE + Math.max(0, dogsToCharge - 1) * PRICE_PER_DOG
    : dogsToCharge * PRICE_PER_DOG

  async function confirm() {
    if (!hikeDay || confirmLock.current) return
    confirmLock.current = true
    setConfirming(true)
    setError('')

    const counts = await getBookedCounts()
    if (!hikeDay.allow_over_capacity && spotsLeft(hikeDay, counts) < dogCount) {
      setError('This day just filled up. Please pick another day.')
      setConfirming(false)
      confirmLock.current = false
      return
    }

    const rows = dogs.map((dog, i) => {
      const coveredByCredit = i < creditsToUse
      const chargedIndex = i - creditsToUse
      let amount_charged = 0
      let discount_applied = 0
      let credit_used = 0
      if (coveredByCredit) {
        credit_used = 1
      } else if (applyPack && chargedIndex === 0) {
        amount_charged = TRAIL_PACK_PRICE
        discount_applied = TRAIL_PACK_SAVING
      } else {
        amount_charged = PRICE_PER_DOG
      }
      return {
        dog_id: dog.id,
        owner_id: ownerId,
        hike_day_id: hikeDay.id,
        status: 'confirmed',
        pickup_method: pickup,
        dropoff_method: dropoff,
        amount_charged,
        discount_applied,
        credit_used,
      }
    })

    const { error: insErr } = await supabase.from('bookings').insert(rows)
    if (insErr) {
      setError(insErr.message)
      setConfirming(false)
      confirmLock.current = false
      return
    }

    if (creditsToUse > 0) await deductCredits(creditRows, creditsToUse)
    if (applyPack) await addTrailPack(ownerId)

    setConfirmed(true)
    setConfirming(false)
  }

  if (!ready) {
    return (
      <main style={{ backgroundColor: T.bg, fontFamily: FONT }} className="min-h-screen flex items-center justify-center px-6">
        <p style={{ color: T.muted, fontSize: 14 }}>Loading…</p>
      </main>
    )
  }

  if (confirmed) {
    return (
      <main style={{ backgroundColor: T.bg, fontFamily: FONT }} className="min-h-screen flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm text-center">
          <div style={{ width: 72, height: 72, borderRadius: '50%', backgroundColor: T.selectedBg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', backgroundColor: T.forest, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <IconCheck size={18} color="#fff" />
            </div>
          </div>
          <h1 style={{ color: T.brown, fontWeight: 700, fontSize: 24, fontFamily: FONT, marginBottom: 8 }}>Booking confirmed</h1>
          <p style={{ color: T.muted, fontSize: 14, fontFamily: FONT, lineHeight: 1.6, marginBottom: 32 }}>
            {hikeDay && formatFull(hikeDay.date)} · {dogCount} dog{dogCount > 1 ? 's' : ''}.
            {applyPack && ` Your Trail Pack added ${TRAIL_PACK_CREDITS} credits.`}
            {!applyPack && creditsToUse > 0 && ` ${creditsToUse} credit${creditsToUse > 1 ? 's' : ''} used.`}
          </p>
          <button
            onClick={() => router.push('/client/home')}
            style={{ width: '100%', backgroundColor: T.forest, color: '#fff', borderRadius: 12, padding: '15px 0', fontFamily: FONT, fontWeight: 600, fontSize: 15, border: 'none', cursor: 'pointer' }}
          >
            Back to home
          </button>
        </div>
      </main>
    )
  }

  return (
    <main style={{ backgroundColor: T.bg, fontFamily: FONT }} className="min-h-screen pb-12">
      <div className="w-full max-w-sm mx-auto px-5">

        {/* ── Header ── */}
        <div className="flex items-center pt-12 pb-6">
          <button
            onClick={() => router.push('/client/book')}
            style={{ backgroundColor: T.cardBorder, borderRadius: '50%', width: 36, height: 36, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer', flexShrink: 0 }}
          >
            <IconArrowLeft size={16} color={T.forest} />
          </button>
          <div style={{ width: 36 }} />
        </div>

        {/* ── Title ── */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ color: T.brown, fontWeight: 700, fontSize: 26, fontFamily: FONT, lineHeight: 1.2, marginBottom: 4 }}>Payment</h1>
          <p style={{ color: T.muted, fontSize: 14, fontFamily: FONT }}>Review your booking</p>
        </div>

        {/* ── Order summary ── */}
        <div style={{ backgroundColor: '#fff', border: `1px solid ${T.cardBorder}`, borderRadius: 16, padding: 16, marginBottom: 12 }}>
          <p style={{ color: T.muted, fontSize: 12, fontFamily: FONT, fontWeight: 600, letterSpacing: '0.05em', marginBottom: 12 }}>ORDER SUMMARY</p>

          <SummaryRow label="Hike day" value={hikeDay ? formatFull(hikeDay.date) : ''} />
          {hikeDay?.destination_override && <SummaryRow label="Destination" value={hikeDay.destination_override} />}
          <SummaryRow label="Pickup" value={pickup ?? ''} capitalize />
          <SummaryRow label="Drop-off" value={dropoff ?? ''} capitalize />

          {/* Dogs */}
          <div style={{ borderTop: `1px solid ${T.divider}`, marginTop: 10, paddingTop: 10 }}>
            {dogs.map((dog, i) => {
              const covered = i < creditsToUse
              return (
                <div key={dog.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ color: T.brown, fontWeight: 700, fontSize: 14, fontFamily: FONT }}>{dog.name}</span>
                  {covered ? (
                    <span style={{ backgroundColor: T.selectedBg, color: T.forest, borderRadius: 20, padding: '2px 10px', fontSize: 12, fontFamily: FONT, fontWeight: 500 }}>
                      Credit applied
                    </span>
                  ) : (
                    <span style={{ color: T.brown, fontSize: 14, fontFamily: FONT }}>₮{PRICE_PER_DOG.toLocaleString()}</span>
                  )}
                </div>
              )
            })}
          </div>

          {/* Pack discount */}
          {applyPack && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ color: T.moss, fontSize: 14, fontFamily: FONT }}>Trail Pack discount</span>
              <span style={{ color: T.moss, fontSize: 14, fontFamily: FONT }}>−₮{TRAIL_PACK_SAVING.toLocaleString()}</span>
            </div>
          )}

          {/* Total */}
          <div style={{ borderTop: `1px solid ${T.cardBorder}`, marginTop: 8, paddingTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ color: T.brown, fontWeight: 700, fontSize: 14, fontFamily: FONT }}>Total</span>
            <span style={{ color: T.forest, fontWeight: 700, fontSize: 18, fontFamily: FONT }}>₮{total.toLocaleString()}</span>
          </div>
        </div>

        {/* ── Trail Pack notice ── */}
        {canBuyPack && (
          <button
            type="button"
            onClick={() => setBuyTrailPack(v => !v)}
            style={{
              width: '100%', textAlign: 'left', backgroundColor: T.packBg,
              border: `1px solid ${T.sand}`, borderRadius: 12, padding: '12px 16px',
              marginBottom: 12, cursor: 'pointer', outline: 'none', display: 'flex', alignItems: 'flex-start', gap: 10,
            }}
          >
            <div style={{ width: 28, height: 28, borderRadius: '50%', backgroundColor: applyPack ? T.forest : '#FEF3E2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
              {applyPack
                ? <IconCheck size={13} color="#fff" />
                : <IconTag size={14} color={T.orange} />
              }
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ color: T.brown, fontWeight: 700, fontSize: 14, fontFamily: FONT, marginBottom: 3 }}>
                Add a Trail Pack
              </p>
              <p style={{ color: T.muted, fontSize: 13, fontFamily: FONT, lineHeight: 1.5 }}>
                4 hikes for ₮{TRAIL_PACK_PRICE.toLocaleString()} — save ₮{TRAIL_PACK_SAVING.toLocaleString()}.
                Covers today and banks {TRAIL_PACK_CREDITS} credits for future hikes.
              </p>
            </div>
          </button>
        )}

        {availableCredits > 0 && (
          <p style={{ color: T.muted, fontSize: 13, fontFamily: FONT, marginBottom: 16, paddingLeft: 4 }}>
            You have {availableCredits} Trail Pack credit{availableCredits > 1 ? 's' : ''}.
            {creditsToUse > 0 && ` ${creditsToUse} will be used for this booking.`}
          </p>
        )}

        {/* ── Payment method ── */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{ width: 3, height: 16, backgroundColor: T.forest, borderRadius: 2, flexShrink: 0 }} />
            <p style={{ color: T.brown, fontWeight: 700, fontSize: 14, fontFamily: FONT }}>Payment method</p>
          </div>
          <div style={{ backgroundColor: '#fff', border: `2px solid ${T.forest}`, borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ backgroundColor: T.forest, borderRadius: 6, padding: '3px 7px', flexShrink: 0 }}>
              <span style={{ color: '#fff', fontSize: 11, fontFamily: FONT, fontWeight: 700, lineHeight: 1.3, display: 'block', textAlign: 'center' }}>
                Store<br />Pay
              </span>
            </div>
            <div>
              <p style={{ color: T.brown, fontWeight: 700, fontSize: 14, fontFamily: FONT, marginBottom: 2 }}>Storepay</p>
              <p style={{ color: T.muted, fontSize: 13, fontFamily: FONT }}>Buy now, pay later (coming soon)</p>
            </div>
          </div>
        </div>

        {/* ── Cancellation policy ── */}
        <div style={{ backgroundColor: '#fff', border: `1px solid ${T.cardBorder}`, borderRadius: 12, padding: '14px 16px', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <IconInfo size={15} color={T.orange} />
            <p style={{ color: T.brown, fontWeight: 700, fontSize: 14, fontFamily: FONT }}>Cancellation policy</p>
          </div>
          <p style={{ color: T.muted, fontSize: 13, fontFamily: FONT, lineHeight: 1.5 }}>
            Before 5pm the day before the hike (UB time): fee held as 1 Trail Pack credit, valid
            60 days. After 5pm the day before or no-show: full fee forfeited. Service-cancelled
            hikes are fully credited.
          </p>
        </div>

        {error && <p style={{ color: '#C1562D', fontSize: 13, fontFamily: FONT, marginBottom: 12 }}>{error}</p>}

        {/* ── Confirm button ── */}
        <button
          onClick={confirm}
          disabled={confirming}
          style={{
            width: '100%', backgroundColor: T.forest, color: '#fff',
            borderRadius: 12, padding: '15px 0', border: 'none',
            fontFamily: FONT, fontWeight: 600, fontSize: 15,
            cursor: confirming ? 'default' : 'pointer', opacity: confirming ? 0.6 : 1,
          }}
        >
          {confirming ? 'Confirming…' : total === 0 ? 'Confirm with credit' : `Confirm & pay ₮${total.toLocaleString()}`}
        </button>
        <p style={{ color: T.muted, fontSize: 12, fontFamily: FONT, textAlign: 'center', fontStyle: 'italic', marginTop: 10 }}>
          Storepay isn&apos;t live yet — tapping confirms your booking without a real charge.
        </p>

      </div>
    </main>
  )
}

// ─── Summary row ──────────────────────────────────────────────────────────────

function SummaryRow({ label, value, capitalize }: { label: string; value: string; capitalize?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
      <span style={{ color: T.muted, fontSize: 14, fontFamily: FONT }}>{label}</span>
      <span style={{ color: T.brown, fontSize: 14, fontFamily: FONT, textTransform: capitalize ? 'capitalize' : 'none' }}>{value}</span>
    </div>
  )
}
