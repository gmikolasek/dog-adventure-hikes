'use client'

import { useState, useEffect, Suspense } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import { getUserState, landingRoute, type Dog } from '@/lib/userState'
import {
  PRICE_PER_DOG, TRAIL_PACK_PRICE, TRAIL_PACK_SAVING, TRAIL_PACK_CREDITS,
  getAvailableCredits, deductCredits, addTrailPack, getBookedCounts, spotsLeft,
  formatFull, type HikeDay, type CreditRow, type Method,
} from '@/lib/booking'

export default function Payment() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-white flex items-center justify-center px-6">
        <p className="text-sm text-gray-400">Loading…</p>
      </main>
    }>
      <PaymentInner />
    </Suspense>
  )
}

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

  // ---- Pricing breakdown ----
  const dogCount = dogs.length
  const creditsToUse = Math.min(availableCredits, dogCount)
  const dogsToCharge = dogCount - creditsToUse
  const canBuyPack = dogsToCharge >= 1
  const applyPack = buyTrailPack && canBuyPack
  // The pack covers one charged hike today; extra charged dogs pay normally.
  const total = applyPack
    ? TRAIL_PACK_PRICE + Math.max(0, dogsToCharge - 1) * PRICE_PER_DOG
    : dogsToCharge * PRICE_PER_DOG

  async function confirm() {
    if (!hikeDay) return
    setConfirming(true)
    setError('')

    // Best-effort capacity guard (DB doesn't enforce it during placeholder payment).
    const counts = await getBookedCounts()
    if (!hikeDay.allow_over_capacity && spotsLeft(hikeDay, counts) < dogCount) {
      setError('This day just filled up. Please pick another day.')
      setConfirming(false)
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
      return
    }

    // Deduct any auto-applied credits, then bank the new pack's credits.
    if (creditsToUse > 0) await deductCredits(creditRows, creditsToUse)
    if (applyPack) await addTrailPack(ownerId)

    setConfirmed(true)
    setConfirming(false)
  }

  if (!ready) {
    return (
      <main className="min-h-screen bg-white flex items-center justify-center px-6">
        <p className="text-sm text-gray-400">Loading…</p>
      </main>
    )
  }

  if (confirmed) {
    return (
      <main className="min-h-screen bg-white flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-100 mb-6">
            <span className="text-4xl">✓</span>
          </div>
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">Booking confirmed</h1>
          <p className="text-gray-500 text-sm leading-relaxed mb-8">
            {hikeDay && formatFull(hikeDay.date)} · {dogCount} dog{dogCount > 1 ? 's' : ''}.
            {applyPack && ` Your Trail Pack added ${TRAIL_PACK_CREDITS} credits.`}
            {!applyPack && creditsToUse > 0 && ` ${creditsToUse} credit${creditsToUse > 1 ? 's' : ''} used.`}
          </p>
          <button
            onClick={() => router.push('/client/home')}
            className="w-full bg-green-600 text-white py-3.5 rounded-xl font-medium text-sm hover:bg-green-700 transition-colors"
          >
            Back to home
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-white px-6 py-10">
      <div className="w-full max-w-sm mx-auto">

        <button onClick={() => router.push('/client/book')} className="text-sm text-gray-500 hover:text-gray-700 mb-6">
          ← Back
        </button>

        <h1 className="text-2xl font-semibold text-gray-900 mb-1">Payment</h1>
        <p className="text-gray-500 text-sm mb-6">Review your booking</p>

        {/* Order summary */}
        <div className="rounded-2xl border border-gray-200 p-5 mb-4">
          <p className="text-xs text-gray-400 mb-3">Order summary</p>

          <SummaryRow label="Hike day" value={hikeDay ? formatFull(hikeDay.date) : ''} />
          {hikeDay?.destination_override && <SummaryRow label="Destination" value={hikeDay.destination_override} />}
          <SummaryRow label="Pickup" value={pickup ?? ''} capitalize />
          <SummaryRow label="Drop-off" value={dropoff ?? ''} capitalize />

          <div className="space-y-2 my-3 pt-3 border-t border-gray-100">
            {dogs.map((dog, i) => {
              const covered = i < creditsToUse
              return (
                <div key={dog.id} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">{dog.name}</span>
                  {covered ? (
                    <span className="text-green-600 text-xs font-medium">Credit applied</span>
                  ) : (
                    <span className="text-gray-900">₮{PRICE_PER_DOG.toLocaleString()}</span>
                  )}
                </div>
              )
            })}
          </div>

          {applyPack && (
            <div className="flex items-center justify-between text-sm text-green-700 mb-3">
              <span>Trail Pack discount</span>
              <span>−₮{TRAIL_PACK_SAVING.toLocaleString()}</span>
            </div>
          )}

          <div className="flex items-center justify-between pt-3 border-t border-gray-100">
            <span className="text-sm font-semibold text-gray-900">Total</span>
            <span className="text-lg font-semibold text-gray-900">₮{total.toLocaleString()}</span>
          </div>
        </div>

        {/* Trail Pack nudge */}
        {canBuyPack && (
          <button
            type="button"
            onClick={() => setBuyTrailPack(v => !v)}
            className={`w-full text-left rounded-2xl border-2 p-4 mb-4 transition-colors ${
              applyPack ? 'border-green-500 bg-green-50' : 'border-green-200 bg-green-50'
            }`}
          >
            <div className="flex items-start gap-3">
              <span className={`w-5 h-5 mt-0.5 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${
                applyPack ? 'border-green-600 bg-green-600 text-white' : 'border-gray-300 bg-white'
              }`}>
                {applyPack && <span className="text-xs">✓</span>}
              </span>
              <div>
                <p className="text-sm font-semibold text-gray-900">Add a Trail Pack 🎒</p>
                <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">
                  4 hikes for ₮{TRAIL_PACK_PRICE.toLocaleString()} — save ₮{TRAIL_PACK_SAVING.toLocaleString()}.
                  Covers today and banks {TRAIL_PACK_CREDITS} credits for future hikes.
                </p>
              </div>
            </div>
          </button>
        )}

        {availableCredits > 0 && (
          <p className="text-xs text-gray-500 mb-4 px-1">
            You have {availableCredits} Trail Pack credit{availableCredits > 1 ? 's' : ''}.
            {creditsToUse > 0 && ` ${creditsToUse} will be used for this booking.`}
          </p>
        )}

        {/* Payment method */}
        <p className="text-sm font-medium text-gray-700 mb-2">Payment method</p>
        <div className="rounded-2xl border-2 border-green-500 bg-green-50 p-4 mb-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-white border border-gray-200 flex items-center justify-center flex-shrink-0">
            <span className="text-[11px] font-bold text-green-700">Store<br/>Pay</span>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">Storepay</p>
            <p className="text-xs text-gray-500">Buy now, pay later (coming soon)</p>
          </div>
        </div>

        {/* Cancellation reminder */}
        <div className="rounded-xl bg-gray-50 p-4 mb-6">
          <p className="text-xs font-medium text-gray-700 mb-1">Cancellation policy</p>
          <p className="text-xs text-gray-500 leading-relaxed">
            Before 5pm the day before the hike (UB time): fee held as 1 Trail Pack credit, valid
            60 days. After 5pm the day before or no-show: full fee forfeited. Service-cancelled
            hikes are fully credited.
          </p>
        </div>

        {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

        <button
          onClick={confirm}
          disabled={confirming}
          className="w-full bg-green-600 text-white py-3.5 rounded-xl font-medium text-sm disabled:opacity-50 hover:bg-green-700 transition-colors"
        >
          {confirming ? 'Confirming…' : total === 0 ? 'Confirm with credit' : `Confirm & pay ₮${total.toLocaleString()}`}
        </button>
        <p className="text-xs text-gray-400 text-center mt-3">
          Storepay isn&apos;t live yet — tapping confirms your booking without a real charge.
        </p>

      </div>
    </main>
  )
}

function SummaryRow({ label, value, capitalize }: { label: string; value: string; capitalize?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm mb-2">
      <span className="text-gray-600">{label}</span>
      <span className={`font-medium text-gray-900 ${capitalize ? 'capitalize' : ''}`}>{value}</span>
    </div>
  )
}
