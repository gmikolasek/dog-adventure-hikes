'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import { getUserState } from '@/lib/userState'
import { formatFull, PRICE_PER_DOG } from '@/lib/booking'
import { getPhotoUrl, type HikePhoto } from '@/lib/photos'

const FONT = "'Noto Sans', system-ui, sans-serif"
const forest = '#26452B'
const brown = '#3B2A1F'
const muted = '#8A7E72'
const cardBorder = '#E8E2D9'
const bg = '#F5F0E8'
const badgeBg = '#EEE9E0'
const completeBg = '#E8F0E5'
const red = '#ef4444'

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
      <main style={{ minHeight: '100vh', backgroundColor: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 24px', fontFamily: FONT }}>
        <p style={{ fontSize: 14, color: muted }}>Loading…</p>
      </main>
    )
  }

  if (notFound || !booking) {
    return (
      <main style={{ minHeight: '100vh', backgroundColor: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 24px', fontFamily: FONT }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: muted, marginBottom: 16 }}>Booking not found.</p>
          <button
            onClick={() => router.push('/client/home')}
            style={{ fontSize: 14, color: forest, background: 'none', border: 'none', cursor: 'pointer', fontFamily: FONT }}
          >
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
    <main style={{ minHeight: '100vh', backgroundColor: bg, padding: '40px 24px', fontFamily: FONT }}>
      <div style={{ width: '100%', maxWidth: 390, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
          <button
            onClick={() => router.push('/client/home')}
            style={{
              width: 32, height: 32, borderRadius: '50%',
              backgroundColor: cardBorder, border: 'none',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', flexShrink: 0,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 12L6 8l4-4" stroke={forest} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: brown, margin: 0 }}>
              {booking.hikeDate ? formatFull(booking.hikeDate) : 'Booking'}
            </h1>
            {booking.destination && (
              <p style={{ fontSize: 13, color: muted, margin: '2px 0 0' }}>{booking.destination}</p>
            )}
          </div>
        </div>

        {/* Booking details card */}
        <div style={{ backgroundColor: 'white', border: `1px solid ${cardBorder}`, borderRadius: 16, padding: 16, marginBottom: 16 }}>
          {/* Dog avatar + name */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, paddingBottom: 16, borderBottom: `1px solid ${cardBorder}` }}>
            <DogAvatar photoUrl={booking.dogPhotoUrl} name={booking.dogName} size={44} />
            <div>
              <p style={{ fontSize: 16, fontWeight: 700, color: brown, margin: 0 }}>{booking.dogName}</p>
              <BookingStatusBadge status={isCompleted ? 'completed' : booking.status} />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <DetailRow label="Pickup" value={booking.pickupMethod ?? '—'} capitalize />
            <DetailRow label="Drop-off" value={booking.dropoffMethod ?? '—'} capitalize />
            <div style={{ paddingTop: 12, borderTop: `1px solid ${cardBorder}` }}>
              {isCredit ? (
                <DetailRow label="Paid with" value="Trail Pack credit" />
              ) : isTrailPack ? (
                <>
                  <DetailRow label="Amount paid" value={`₮${booking.amountCharged.toLocaleString()}`} />
                  <p style={{ fontSize: 11, color: '#B45309', margin: '4px 0 0', textAlign: 'right' }}>Trail Pack · 4 hikes</p>
                </>
              ) : (
                <DetailRow label="Amount paid" value={`₮${booking.amountCharged.toLocaleString()}`} />
              )}
            </div>
          </div>
        </div>

        {/* Method editor — only for confirmed future bookings */}
        {canEdit && (
          <div style={{ backgroundColor: 'white', border: `1px solid ${cardBorder}`, borderRadius: 16, padding: 16, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <div style={{ width: 3, height: 16, backgroundColor: forest, borderRadius: 2 }} />
              <h2 style={{ fontSize: 14, fontWeight: 700, color: brown, margin: 0 }}>Change pickup / drop-off</h2>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <MethodToggle label="Pickup" value={editPickup} onChange={setEditPickup} />
              <MethodToggle label="Drop-off" value={editDropoff} onChange={setEditDropoff} />
            </div>

            {methodsChanged && (
              <button
                onClick={saveMethod}
                disabled={saving}
                style={{
                  width: '100%', marginTop: 16,
                  backgroundColor: forest, color: 'white',
                  borderRadius: 12, fontWeight: 600,
                  padding: '14px', border: 'none',
                  fontSize: 14, cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.6 : 1, fontFamily: FONT,
                }}
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            )}
            {saveSuccess && (
              <p style={{ fontSize: 12, color: forest, textAlign: 'center', marginTop: 8 }}>Saved.</p>
            )}
          </div>
        )}

        {/* Cancel button — only for confirmed future bookings */}
        {canEdit && !showCancelPanel && (
          <button
            onClick={() => setShowCancelPanel(true)}
            style={{
              width: '100%', borderRadius: 12,
              border: `1px solid ${red}`,
              padding: '14px', fontSize: 14, fontWeight: 600,
              color: red, backgroundColor: 'white',
              cursor: 'pointer', marginBottom: 16, fontFamily: FONT,
            }}
          >
            Cancel booking
          </button>
        )}

        {/* Cancel panel */}
        {canEdit && showCancelPanel && (
          <div style={{ backgroundColor: 'white', border: `1px solid ${red}`, borderRadius: 16, padding: 16, marginBottom: 16 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: brown, margin: '0 0 12px' }}>Cancel this booking?</h2>

            <div style={{ borderRadius: 10, backgroundColor: bg, padding: 14, marginBottom: 16 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: brown, margin: '0 0 6px' }}>Cancellation policy</p>
              {creditEligible ? (
                <p style={{ fontSize: 12, color: muted, margin: 0, lineHeight: 1.5 }}>
                  You&apos;re cancelling before 5pm the day before the hike.{' '}
                  <span style={{ color: forest, fontWeight: 600 }}>
                    Your booking fee will be converted to 1 Trail Pack credit, valid for 60 days.
                  </span>
                </p>
              ) : (
                <p style={{ fontSize: 12, color: muted, margin: 0, lineHeight: 1.5 }}>
                  The cancellation window has passed (5pm the day before the hike).{' '}
                  <span style={{ color: red, fontWeight: 600 }}>
                    Your booking fee will be forfeited — no credit will be issued.
                  </span>
                </p>
              )}
            </div>

            {cancelError && (
              <p style={{ fontSize: 12, color: red, marginBottom: 12 }}>{cancelError}</p>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                onClick={confirmCancel}
                disabled={cancelling}
                style={{
                  width: '100%', backgroundColor: red, color: 'white',
                  padding: '14px', borderRadius: 12, border: 'none',
                  fontSize: 14, fontWeight: 600,
                  cursor: cancelling ? 'not-allowed' : 'pointer',
                  opacity: cancelling ? 0.6 : 1, fontFamily: FONT,
                }}
              >
                {cancelling ? 'Cancelling…' : 'Confirm cancellation'}
              </button>
              <button
                onClick={() => { setShowCancelPanel(false); setCancelError('') }}
                style={{
                  width: '100%', backgroundColor: 'white',
                  border: `1px solid ${cardBorder}`, color: brown,
                  borderRadius: 12, padding: '12px 24px',
                  fontSize: 14, fontWeight: 400, cursor: 'pointer', fontFamily: FONT,
                }}
              >
                Keep booking
              </button>
            </div>
          </div>
        )}

        {/* Completed state */}
        {isCompleted && (
          <div style={{ backgroundColor: completeBg, border: '1px solid #C8DEC4', borderRadius: 16, padding: 16, textAlign: 'center', marginBottom: 16 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: forest, margin: 0 }}>Hike completed</p>
            {booking.droppedOffAt && (
              <p style={{ fontSize: 12, color: '#4D6B46', margin: '4px 0 0' }}>
                Dropped off {formatDropoffTime(booking.droppedOffAt)}
              </p>
            )}
          </div>
        )}

        {/* Guide note */}
        {isCompleted && booking.dropoffNote && (
          <div style={{ backgroundColor: completeBg, border: '1px solid #C8DEC4', borderRadius: 16, padding: 16, marginBottom: 16 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: forest, margin: '0 0 6px' }}>Note from your guide</p>
            <p style={{ fontSize: 14, color: brown, margin: 0, lineHeight: 1.6 }}>{booking.dropoffNote}</p>
          </div>
        )}

        {/* Cancelled state */}
        {booking.status === 'cancelled' && (
          <div style={{ backgroundColor: 'white', border: `1px solid ${cardBorder}`, borderRadius: 16, padding: 16, textAlign: 'center', marginBottom: 16 }}>
            <p style={{ fontSize: 14, color: muted, margin: 0 }}>This booking was cancelled.</p>
            {booking.cancelledAt && (
              <p style={{ fontSize: 12, color: muted, margin: '4px 0 0' }}>
                {new Date(booking.cancelledAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
            )}
          </div>
        )}

        {/* Photos section */}
        {hasPhotos && (
          <div style={{ marginTop: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <div style={{ width: 3, height: 16, backgroundColor: forest, borderRadius: 2 }} />
              <h2 style={{ fontSize: 14, fontWeight: 700, color: brown, margin: 0 }}>Photos</h2>
            </div>

            {dogPhotos.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 12, color: muted, margin: '0 0 8px' }}>{booking.dogName}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {dogPhotos.map(p => (
                    <PhotoCard key={p.id} photo={p} onTap={() => setLightbox(p)} />
                  ))}
                </div>
              </div>
            )}

            {groupPhotos.length > 0 && (
              <div>
                <p style={{ fontSize: 12, color: muted, margin: '0 0 8px' }}>Group photos</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
          className="fixed inset-0 z-50 flex flex-col"
          style={{ backgroundColor: 'rgba(0,0,0,0.9)' }}
          onClick={() => setLightbox(null)}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px' }}>
            <button
              onClick={() => setLightbox(null)}
              style={{ color: 'white', fontSize: 14, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', fontFamily: FONT }}
            >
              ✕ Close
            </button>
            <button
              onClick={e => { e.stopPropagation(); downloadPhoto(getPhotoUrl(lightbox.storagePath)) }}
              style={{ color: 'white', fontSize: 14, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', fontFamily: FONT }}
            >
              ↓ Download
            </button>
          </div>

          <div
            className="flex-1 flex items-center justify-center px-4"
            onClick={e => e.stopPropagation()}
          >
            <div
              style={{
                width: '100%', borderRadius: 16,
                backgroundImage: `url(${getPhotoUrl(lightbox.storagePath)})`,
                backgroundSize: 'cover', backgroundPosition: 'center',
                height: '70vw', maxHeight: '65vh',
              }}
            />
          </div>

          {lightbox.caption && (
            <p style={{ color: 'white', fontSize: 14, textAlign: 'center', padding: '16px 24px 32px', fontFamily: FONT }}>{lightbox.caption}</p>
          )}
          {!lightbox.caption && <div style={{ paddingBottom: 32 }} />}
        </div>
      )}
    </main>
  )
}

function DogAvatar({ photoUrl, name, size }: { photoUrl: string | null; name: string; size: number }) {
  if (photoUrl) {
    return (
      <div
        style={{
          width: size, height: size, borderRadius: '50%',
          backgroundColor: badgeBg,
          backgroundImage: `url(${photoUrl})`,
          backgroundSize: 'cover', backgroundPosition: 'center',
          flexShrink: 0,
        }}
        role="img"
        aria-label={name}
      />
    )
  }
  return (
    <div
      style={{
        width: size, height: size, borderRadius: '50%',
        backgroundColor: badgeBg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <span style={{ fontSize: size * 0.5 }}>🐕</span>
    </div>
  )
}

function PhotoCard({ photo, onTap }: { photo: HikePhoto; onTap: () => void }) {
  return (
    <button
      onClick={onTap}
      style={{ width: '100%', borderRadius: 16, overflow: 'hidden', display: 'block', border: 'none', padding: 0, cursor: 'pointer' }}
    >
      <div
        style={{
          width: '100%', borderRadius: 16,
          backgroundImage: `url(${getPhotoUrl(photo.storagePath)})`,
          backgroundSize: 'cover', backgroundPosition: 'center',
          backgroundColor: badgeBg, height: 200, position: 'relative',
        }}
      >
        {photo.caption && (
          <div
            style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              borderBottomLeftRadius: 16, borderBottomRightRadius: 16,
              padding: '12px 16px',
              background: 'linear-gradient(to top, rgba(0,0,0,0.6), transparent)',
            }}
          >
            <p style={{ fontSize: 12, color: 'white', margin: 0 }}>{photo.caption}</p>
          </div>
        )}
      </div>
    </button>
  )
}

function DetailRow({ label, value, capitalize }: { label: string; value: string; capitalize?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{ fontSize: 12, color: muted }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 600, color: brown, textTransform: capitalize ? 'capitalize' : undefined }}>{value}</span>
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
      <p style={{ fontSize: 12, color: muted, margin: '0 0 8px' }}>{label}</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {(['curbside', 'home'] as Method[]).map(m => (
          <button
            key={m}
            onClick={() => onChange(m)}
            style={{
              padding: '10px', borderRadius: 12, fontSize: 14, fontWeight: 600,
              textTransform: 'capitalize', cursor: 'pointer', fontFamily: FONT,
              border: value === m ? `1px solid ${forest}` : `1px solid ${cardBorder}`,
              backgroundColor: value === m ? forest : 'white',
              color: value === m ? 'white' : brown,
            }}
          >
            {m}
          </button>
        ))}
      </div>
    </div>
  )
}

function BookingStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    confirmed: { label: 'Confirmed', bg: completeBg, color: forest },
    completed: { label: 'Completed', bg: completeBg, color: forest },
    cancelled: { label: 'Cancelled', bg: '#FEE2E2', color: '#B91C1C' },
    no_show: { label: 'No-show', bg: '#FEE2E2', color: '#B91C1C' },
    pending_payment: { label: 'Pending', bg: '#FEF3C7', color: '#B45309' },
  }
  const s = map[status] ?? { label: status, bg: badgeBg, color: muted }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 8px', borderRadius: 999,
      fontSize: 12, fontWeight: 600,
      backgroundColor: s.bg, color: s.color,
      marginTop: 4,
    }}>
      {s.label}
    </span>
  )
}
