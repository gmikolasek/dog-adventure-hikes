'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import { getUserState, landingRoute } from '@/lib/userState'
import { formatFull, PRICE_PER_DOG } from '@/lib/booking'

type Method = 'curbside' | 'home'

type BookingDetail = {
  id: string
  status: string
  hikeDate: string
  destination: string | null
  dogName: string
  pickupMethod: Method | null
  dropoffMethod: Method | null
  amountCharged: number
  creditUsed: number
  cancelledAt: string | null
}

// Cutoff: 5pm Ulaanbaatar time (UTC+8) the day before the hike = 09:00 UTC.
// Used only for displaying policy text; enforcement is server-side in cancel_booking().
function isCreditEligible(hikeDate: string): boolean {
  const [y, m, d] = hikeDate.split('-').map(Number)
  const cutoff = new Date(Date.UTC(y, m - 1, d - 1, 9, 0, 0)) // 09:00 UTC = 17:00 UB
  return Date.now() < cutoff.getTime()
}

export default function BookingDetailPage() {
  const router = useRouter()
  const params = useParams()
  const bookingId = params.id as string

  const [ready, setReady] = useState(false)
  const [userId, setUserId] = useState('')
  const [booking, setBooking] = useState<BookingDetail | null>(null)
  const [notFound, setNotFound] = useState(false)

  // Method editor state
  const [editPickup, setEditPickup] = useState<Method | null>(null)
  const [editDropoff, setEditDropoff] = useState<Method | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Cancellation state
  const [showCancelPanel, setShowCancelPanel] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState('')

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/'); return }

      const state = await getUserState(session.user.id)
      if (landingRoute(state) !== '/client/home') { router.push(landingRoute(state)); return }

      setUserId(session.user.id)

      // Fetch the booking. Query includes owner_id filter as defence-in-depth
      // alongside RLS — if either were misconfigured the other still blocks access.
      const { data: bRow } = await supabase
        .from('bookings')
        .select('id, owner_id, dog_id, hike_day_id, status, pickup_method, dropoff_method, amount_charged, credit_used, cancelled_at')
        .eq('id', bookingId)
        .eq('owner_id', session.user.id)
        .maybeSingle()

      // Explicit application-level ownership check — never trust RLS alone.
      if (!bRow || bRow.owner_id !== session.user.id) {
        setNotFound(true)
        setReady(true)
        return
      }

      const { data: dayRow } = await supabase
        .from('hike_days')
        .select('date, destination_override')
        .eq('id', bRow.hike_day_id)
        .maybeSingle()

      const dogNameById: Record<string, string> = {}
      for (const dog of state.dogs) dogNameById[dog.id] = dog.name

      const detail: BookingDetail = {
        id: bRow.id,
        status: bRow.status,
        hikeDate: dayRow?.date ?? '',
        destination: dayRow?.destination_override ?? null,
        dogName: dogNameById[bRow.dog_id] ?? 'Your dog',
        pickupMethod: bRow.pickup_method as Method | null,
        dropoffMethod: bRow.dropoff_method as Method | null,
        amountCharged: bRow.amount_charged ?? 0,
        creditUsed: bRow.credit_used ?? 0,
        cancelledAt: bRow.cancelled_at ?? null,
      }
      setBooking(detail)
      setEditPickup(detail.pickupMethod)
      setEditDropoff(detail.dropoffMethod)
      setReady(true)
    }
    load()
  }, [router, bookingId])

  const methodsChanged = booking
    ? editPickup !== booking.pickupMethod || editDropoff !== booking.dropoffMethod
    : false

  async function saveMethod() {
    if (!booking) return
    setSaving(true)
    setSaveSuccess(false)
    const { error } = await supabase
      .from('bookings')
      .update({ pickup_method: editPickup, dropoff_method: editDropoff })
      .eq('id', booking.id)
      .eq('owner_id', userId)
    setSaving(false)
    if (!error) {
      setBooking(prev => prev ? { ...prev, pickupMethod: editPickup, dropoffMethod: editDropoff } : prev)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2500)
    }
  }

  // Cancellation goes through the cancel_booking() SECURITY DEFINER RPC so that
  // eligibility is computed server-side and the credit insert is atomic with the
  // booking update. The client cannot bypass the cutoff by calling the insert
  // directly because the function is the authoritative gatekeeper.
  async function confirmCancel() {
    if (!booking) return
    setCancelling(true)
    setCancelError('')

    const { data: result, error: rpcErr } = await supabase
      .rpc('cancel_booking', { booking_id: booking.id })

    if (rpcErr) {
      setCancelError(rpcErr.message)
      setCancelling(false)
      return
    }

    if (result?.error) {
      setCancelError('Unable to cancel — booking may already be cancelled or not found.')
      setCancelling(false)
      return
    }

    setBooking(prev => prev ? { ...prev, status: 'cancelled', cancelledAt: new Date().toISOString() } : prev)
    setShowCancelPanel(false)
    setCancelling(false)
  }

  if (!ready) {
    return (
      <main className="min-h-screen bg-white flex items-center justify-center px-6">
        <p className="text-sm text-gray-400">Loading…</p>
      </main>
    )
  }

  if (notFound || !booking) {
    return (
      <main className="min-h-screen bg-white flex items-center justify-center px-6">
        <div className="text-center">
          <p className="text-sm text-gray-500 mb-4">Booking not found.</p>
          <button onClick={() => router.push('/client/home')} className="text-sm text-green-600">
            Back to home
          </button>
        </div>
      </main>
    )
  }

  const isConfirmed = booking.status === 'confirmed'
  const isFuture = booking.hikeDate >= new Date().toISOString().slice(0, 10)
  const canEdit = isConfirmed && isFuture
  const creditEligible = booking.hikeDate ? isCreditEligible(booking.hikeDate) : false
  const isTrailPack = booking.amountCharged > PRICE_PER_DOG
  const isCredit = booking.creditUsed > 0

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
          <div>
            <h1 className="text-lg font-semibold text-gray-900 leading-tight">
              {booking.hikeDate ? formatFull(booking.hikeDate) : 'Booking'}
            </h1>
            {booking.destination && (
              <p className="text-xs text-gray-500 mt-0.5">{booking.destination}</p>
            )}
          </div>
        </div>

        {/* Booking details card */}
        <div className="rounded-2xl border border-gray-200 p-5 mb-5">
          <div className="space-y-3">
            <DetailRow label="Dog" value={booking.dogName} />
            <DetailRow label="Pickup" value={booking.pickupMethod ?? '—'} capitalize />
            <DetailRow label="Drop-off" value={booking.dropoffMethod ?? '—'} capitalize />
            <div className="pt-3 border-t border-gray-100">
              {isCredit ? (
                <DetailRow label="Paid with" value="Trail Pack credit" />
              ) : isTrailPack ? (
                <>
                  <DetailRow label="Amount paid" value={`₮${booking.amountCharged.toLocaleString()}`} />
                  <p className="text-[11px] text-amber-600 mt-0.5 text-right">Trail Pack · 4 hikes</p>
                </>
              ) : (
                <DetailRow label="Amount paid" value={`₮${booking.amountCharged.toLocaleString()}`} />
              )}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Status</span>
              <BookingStatusBadge status={booking.status} />
            </div>
          </div>
        </div>

        {/* Method editor — only for confirmed future bookings */}
        {canEdit && (
          <div className="rounded-2xl border border-gray-200 p-5 mb-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Change pickup / drop-off</h2>

            <div className="space-y-4">
              <MethodToggle label="Pickup" value={editPickup} onChange={setEditPickup} />
              <MethodToggle label="Drop-off" value={editDropoff} onChange={setEditDropoff} />
            </div>

            {methodsChanged && (
              <button
                onClick={saveMethod}
                disabled={saving}
                className="w-full mt-4 bg-green-600 text-white py-3 rounded-xl text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            )}
            {saveSuccess && (
              <p className="text-xs text-green-600 text-center mt-2">Saved.</p>
            )}
          </div>
        )}

        {/* Cancel section — only for confirmed future bookings */}
        {canEdit && !showCancelPanel && (
          <button
            onClick={() => setShowCancelPanel(true)}
            className="w-full rounded-xl border border-red-200 px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
          >
            Cancel booking
          </button>
        )}

        {canEdit && showCancelPanel && (
          <div className="rounded-2xl border border-red-200 p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Cancel this booking?</h2>

            <div className="rounded-xl bg-gray-50 p-4 mb-4 text-xs text-gray-600 leading-relaxed space-y-1.5">
              <p className="font-medium text-gray-700">Cancellation policy</p>
              {creditEligible ? (
                <p>
                  You&apos;re cancelling before 5pm the day before the hike.{' '}
                  <span className="text-green-700 font-medium">
                    Your booking fee will be converted to 1 Trail Pack credit, valid for 60 days.
                  </span>
                </p>
              ) : (
                <p>
                  The cancellation window has passed (5pm the day before the hike).{' '}
                  <span className="text-red-600 font-medium">
                    Your booking fee will be forfeited — no credit will be issued.
                  </span>
                </p>
              )}
            </div>

            {cancelError && (
              <p className="text-xs text-red-500 mb-3">{cancelError}</p>
            )}

            <div className="space-y-2">
              <button
                onClick={confirmCancel}
                disabled={cancelling}
                className="w-full bg-red-600 text-white py-3 rounded-xl text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {cancelling ? 'Cancelling…' : 'Confirm cancellation'}
              </button>
              <button
                onClick={() => { setShowCancelPanel(false); setCancelError('') }}
                className="w-full py-3 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Keep booking
              </button>
            </div>
          </div>
        )}

        {/* Cancelled state message */}
        {booking.status === 'cancelled' && (
          <div className="rounded-2xl border border-gray-200 p-5 text-center">
            <p className="text-sm text-gray-500">This booking was cancelled.</p>
            {booking.cancelledAt && (
              <p className="text-xs text-gray-400 mt-1">
                {new Date(booking.cancelledAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
            )}
          </div>
        )}

      </div>
    </main>
  )
}

function DetailRow({ label, value, capitalize }: { label: string; value: string; capitalize?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-sm font-medium text-gray-900 ${capitalize ? 'capitalize' : ''}`}>{value}</span>
    </div>
  )
}

function MethodToggle({ label, value, onChange }: {
  label: string
  value: Method | null
  onChange: (m: Method) => void
}) {
  return (
    <div>
      <p className="text-xs text-gray-500 mb-1.5">{label}</p>
      <div className="grid grid-cols-2 gap-2">
        {(['curbside', 'home'] as Method[]).map(m => (
          <button
            key={m}
            onClick={() => onChange(m)}
            className={`py-2.5 rounded-xl text-sm font-medium border transition-colors capitalize ${
              value === m
                ? 'bg-green-600 text-white border-green-600'
                : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
            }`}
          >
            {m}
          </button>
        ))}
      </div>
    </div>
  )
}

function BookingStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    confirmed: { label: 'Confirmed', cls: 'bg-green-100 text-green-700' },
    cancelled: { label: 'Cancelled', cls: 'bg-red-100 text-red-600' },
    no_show: { label: 'No-show', cls: 'bg-red-100 text-red-600' },
    pending_payment: { label: 'Pending', cls: 'bg-amber-100 text-amber-700' },
  }
  const s = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600' }
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${s.cls}`}>
      {s.label}
    </span>
  )
}
