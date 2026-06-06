'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import { getUserState, landingRoute } from '@/lib/userState'
import { formatFull, PRICE_PER_DOG } from '@/lib/booking'
import { getPhotoUrl, type HikePhoto } from '@/lib/photos'

type Method = 'curbside' | 'home'

type BookingDetail = {
  id: string
  status: string
  hikeDate: string
  hikeDayId: string
  dogId: string
  dogName: string
  dogPhotoUrl: string | null
  destination: string | null
  pickupMethod: Method | null
  dropoffMethod: Method | null
  amountCharged: number
  creditUsed: number
  cancelledAt: string | null
  droppedOffAt: string | null
  dropoffNote: string | null
}

// Cutoff: 5pm Ulaanbaatar time (UTC+8) the day before the hike = 09:00 UTC.
// Used only for displaying policy text; enforcement is server-side in cancel_booking().
function isCreditEligible(hikeDate: string): boolean {
  const [y, m, d] = hikeDate.split('-').map(Number)
  const cutoff = new Date(Date.UTC(y, m - 1, d - 1, 9, 0, 0)) // 09:00 UTC = 17:00 UB
  return Date.now() < cutoff.getTime()
}

async function downloadPhoto(url: string) {
  try {
    const resp = await fetch(url)
    const blob = await resp.blob()
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = 'hike-photo.jpg'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(objectUrl)
  } catch {
    window.open(url, '_blank')
  }
}

// UB is UTC+8; format as "Jun 6 at 2:34pm"
function formatDropoffTime(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 8 * 60 * 60 * 1000)
  const month = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
  const day = d.toLocaleDateString('en-US', { day: 'numeric', timeZone: 'UTC' })
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC' }).toLowerCase()
  return `${month} ${day} at ${time}`
}

export default function BookingDetailPage() {
  const router = useRouter()
  const params = useParams()
  const bookingId = params.id as string

  const [ready, setReady] = useState(false)
  const [userId, setUserId] = useState('')
  const [booking, setBooking] = useState<BookingDetail | null>(null)
  const [notFound, setNotFound] = useState(false)

  // Photos
  const [dogPhotos, setDogPhotos] = useState<HikePhoto[]>([])
  const [groupPhotos, setGroupPhotos] = useState<HikePhoto[]>([])
  const [lightbox, setLightbox] = useState<HikePhoto | null>(null)

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
        .select('id, owner_id, dog_id, hike_day_id, status, pickup_method, dropoff_method, amount_charged, credit_used, cancelled_at, dropped_off_at, dropoff_note')
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
      const dogPhotoById: Record<string, string | null> = {}
      for (const dog of state.dogs) {
        dogNameById[dog.id] = dog.name
        dogPhotoById[dog.id] = dog.photo_url
      }

      const detail: BookingDetail = {
        id: bRow.id,
        status: bRow.status,
        hikeDate: dayRow?.date ?? '',
        hikeDayId: bRow.hike_day_id,
        dogId: bRow.dog_id,
        dogName: dogNameById[bRow.dog_id] ?? 'Your dog',
        dogPhotoUrl: dogPhotoById[bRow.dog_id] ?? null,
        destination: dayRow?.destination_override ?? null,
        pickupMethod: bRow.pickup_method as Method | null,
        dropoffMethod: bRow.dropoff_method as Method | null,
        amountCharged: bRow.amount_charged ?? 0,
        creditUsed: bRow.credit_used ?? 0,
        cancelledAt: bRow.cancelled_at ?? null,
        droppedOffAt: bRow.dropped_off_at ?? null,
        dropoffNote: bRow.dropoff_note ?? null,
      }
      setBooking(detail)
      setEditPickup(detail.pickupMethod)
      setEditDropoff(detail.dropoffMethod)

      // Load hike photos (RLS: only visible if this client had a confirmed booking on that day)
      const { data: photoRows } = await supabase
        .from('hike_photos')
        .select('id, dog_id, storage_path, caption, taken_at')
        .eq('hike_day_id', bRow.hike_day_id)
        .order('created_at', { ascending: true })

      const allPhotos: HikePhoto[] = (photoRows ?? []).map(r => ({
        id: r.id,
        dogId: r.dog_id,
        storagePath: r.storage_path,
        caption: r.caption,
        takenAt: r.taken_at,
      }))

      setDogPhotos(allPhotos.filter(p => p.dogId === bRow.dog_id))
      setGroupPhotos(allPhotos.filter(p => p.dogId === null))

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
  const isCompleted = isConfirmed && !!booking.droppedOffAt
  const isFuture = booking.hikeDate >= new Date().toISOString().slice(0, 10)
  const canEdit = isConfirmed && isFuture && !isCompleted
  const creditEligible = booking.hikeDate ? isCreditEligible(booking.hikeDate) : false
  const isTrailPack = booking.amountCharged > PRICE_PER_DOG
  const isCredit = booking.creditUsed > 0
  const hasPhotos = dogPhotos.length > 0 || groupPhotos.length > 0

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
          {/* Dog avatar + name */}
          <div className="flex items-center gap-3 mb-4 pb-4 border-b border-gray-100">
            <DogAvatar photoUrl={booking.dogPhotoUrl} name={booking.dogName} size={44} />
            <div>
              <p className="text-sm font-semibold text-gray-900">{booking.dogName}</p>
              <BookingStatusBadge status={isCompleted ? 'completed' : booking.status} />
            </div>
          </div>

          <div className="space-y-3">
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
            className="w-full rounded-xl border border-red-200 px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors mb-5"
          >
            Cancel booking
          </button>
        )}

        {canEdit && showCancelPanel && (
          <div className="rounded-2xl border border-red-200 p-5 mb-5">
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

        {/* Completed state message */}
        {isCompleted && (
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5 text-center mb-5">
            <p className="text-sm font-medium text-blue-700">Hike completed 🥾</p>
            {booking.droppedOffAt && (
              <p className="text-xs text-blue-500 mt-1">
                Dropped off {formatDropoffTime(booking.droppedOffAt)}
              </p>
            )}
          </div>
        )}

        {/* Guide note — shown when completed and a note was left */}
        {isCompleted && booking.dropoffNote && (
          <div className="rounded-2xl border border-green-200 bg-green-50 p-5 mb-5">
            <p className="text-xs font-semibold text-green-700 mb-1.5">Note from your guide</p>
            <p className="text-sm text-gray-800 leading-relaxed">{booking.dropoffNote}</p>
          </div>
        )}

        {/* Cancelled state message */}
        {booking.status === 'cancelled' && (
          <div className="rounded-2xl border border-gray-200 p-5 text-center mb-5">
            <p className="text-sm text-gray-500">This booking was cancelled.</p>
            {booking.cancelledAt && (
              <p className="text-xs text-gray-400 mt-1">
                {new Date(booking.cancelledAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
            )}
          </div>
        )}

        {/* ── Photos section ── */}
        {hasPhotos && (
          <div className="mt-2">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Photos</h2>

            {/* Dog-specific photos first */}
            {dogPhotos.length > 0 && (
              <div className="mb-4">
                <p className="text-xs text-gray-400 mb-2">{booking.dogName}</p>
                <div className="space-y-2">
                  {dogPhotos.map(p => (
                    <PhotoCard key={p.id} photo={p} onTap={() => setLightbox(p)} />
                  ))}
                </div>
              </div>
            )}

            {/* Group photos below */}
            {groupPhotos.length > 0 && (
              <div>
                <p className="text-xs text-gray-400 mb-2">Group photos</p>
                <div className="space-y-2">
                  {groupPhotos.map(p => (
                    <PhotoCard key={p.id} photo={p} onTap={() => setLightbox(p)} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex flex-col"
          onClick={() => setLightbox(null)}
        >
          <div className="flex items-center justify-between px-5 py-4">
            <button
              onClick={() => setLightbox(null)}
              className="text-white text-sm font-medium"
            >
              ✕ Close
            </button>
            <button
              onClick={e => { e.stopPropagation(); downloadPhoto(getPhotoUrl(lightbox.storagePath)) }}
              className="text-white text-sm font-medium"
            >
              ↓ Download
            </button>
          </div>

          <div
            className="flex-1 flex items-center justify-center px-4"
            onClick={e => e.stopPropagation()}
          >
            <div
              className="w-full rounded-2xl bg-cover bg-center"
              style={{
                backgroundImage: `url(${getPhotoUrl(lightbox.storagePath)})`,
                height: '70vw',
                maxHeight: '65vh',
              }}
            />
          </div>

          {lightbox.caption && (
            <p className="text-white text-sm text-center px-6 pb-8 pt-4">{lightbox.caption}</p>
          )}
          {!lightbox.caption && <div className="pb-8" />}
        </div>
      )}
    </main>
  )
}

function DogAvatar({ photoUrl, name, size }: { photoUrl: string | null; name: string; size: number }) {
  if (photoUrl) {
    return (
      <div
        className="rounded-full bg-gray-100 bg-cover bg-center flex-shrink-0"
        style={{ width: size, height: size, backgroundImage: `url(${photoUrl})` }}
        role="img"
        aria-label={name}
      />
    )
  }
  return (
    <div
      className="rounded-full bg-green-100 flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size }}
    >
      <span style={{ fontSize: size * 0.5 }}>🐕</span>
    </div>
  )
}

function PhotoCard({ photo, onTap }: { photo: HikePhoto; onTap: () => void }) {
  return (
    <button
      onClick={onTap}
      className="w-full rounded-2xl overflow-hidden text-left"
      style={{ display: 'block' }}
    >
      <div
        className="w-full rounded-2xl bg-cover bg-center bg-gray-100 relative"
        style={{ backgroundImage: `url(${getPhotoUrl(photo.storagePath)})`, height: 200 }}
      >
        {photo.caption && (
          <div className="absolute bottom-0 left-0 right-0 rounded-b-2xl px-4 py-3"
            style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.6), transparent)' }}>
            <p className="text-xs text-white">{photo.caption}</p>
          </div>
        )}
      </div>
    </button>
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
    completed: { label: 'Completed', cls: 'bg-blue-100 text-blue-700' },
    cancelled: { label: 'Cancelled', cls: 'bg-red-100 text-red-600' },
    no_show: { label: 'No-show', cls: 'bg-red-100 text-red-600' },
    pending_payment: { label: 'Pending', cls: 'bg-amber-100 text-amber-700' },
  }
  const s = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600' }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${s.cls}`}>
      {s.label}
    </span>
  )
}
