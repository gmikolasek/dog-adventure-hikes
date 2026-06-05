'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import { formatFull } from '@/lib/booking'

// ---- Types ------------------------------------------------------------------

type RunBooking = {
  id: string
  dogId: string
  dogName: string
  ownerName: string | null
  ownerPhone: string | null
  ownerAddress: string | null
  pickupMethod: 'curbside' | 'home' | null
  dropoffMethod: 'curbside' | 'home' | null
  status: string
  pickedUpAt: string | null
  droppedOffAt: string | null
  zoneId: string | null
  zoneName: string | null
}

type RunMode = 'pickup' | 'hike' | 'dropoff'

function deriveMode(bookings: RunBooking[]): RunMode {
  if (bookings.length === 0) return 'pickup'
  const active = bookings.filter(b => b.status !== 'no_show')
  const allPickedUp = active.every(b => b.pickedUpAt)
  if (!allPickedUp) return 'pickup'
  const allDroppedOff = active.filter(b => b.pickedUpAt).every(b => b.droppedOffAt)
  if (allDroppedOff) return 'dropoff' // sweep complete, stay in dropoff view
  // Check if any drop-off has been done yet
  const anyDropped = active.some(b => b.droppedOffAt)
  return anyDropped ? 'dropoff' : 'hike'
}

function fmtTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

// ---- Page -------------------------------------------------------------------

export default function RunPage() {
  const router = useRouter()
  const params = useParams()
  const date = params.date as string

  const [ready, setReady] = useState(false)
  const [hikeDayId, setHikeDayId] = useState('')
  const [destination, setDestination] = useState<string | null>(null)
  const [bookings, setBookings] = useState<RunBooking[]>([])
  const [mode, setMode] = useState<RunMode>('pickup')
  const [busy, setBusy] = useState<string | null>(null) // booking id being updated
  const [confirmNoShow, setConfirmNoShow] = useState<string | null>(null) // booking id

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/'); return }

    const { data: profile } = await supabase
      .from('users').select('role').eq('id', session.user.id).maybeSingle()
    if (profile?.role !== 'staff') { router.push('/onboarding'); return }

    const { data: dayRow } = await supabase
      .from('hike_days')
      .select('id, destination_override')
      .eq('date', date)
      .maybeSingle()
    if (!dayRow) { setReady(true); return }

    setHikeDayId(dayRow.id)
    setDestination(dayRow.destination_override)

    const { data: bRows } = await supabase
      .from('bookings')
      .select('id, dog_id, owner_id, status, pickup_method, dropoff_method, picked_up_at, dropped_off_at')
      .eq('hike_day_id', dayRow.id)
      .in('status', ['confirmed', 'no_show'])

    const raw = bRows ?? []
    if (!raw.length) { setReady(true); return }

    const dogIds = [...new Set(raw.map(b => b.dog_id))]
    const ownerIds = [...new Set(raw.map(b => b.owner_id))]

    const [{ data: dogRows }, { data: ownerRows }, { data: zoneRows }] = await Promise.all([
      supabase.from('dogs').select('id, name').in('id', dogIds),
      supabase.from('users').select('id, name, phone, address, zone_id').in('id', ownerIds),
      supabase.from('zones').select('id, name'),
    ])

    const dogById: Record<string, string> = {}
    for (const d of dogRows ?? []) dogById[d.id] = d.name

    const ownerById: Record<string, { name: string | null; phone: string | null; address: string | null; zone_id: string | null }> = {}
    for (const u of ownerRows ?? []) ownerById[u.id] = u

    const zoneNameById: Record<string, string> = {}
    for (const z of zoneRows ?? []) zoneNameById[z.id] = z.name

    const mapped: RunBooking[] = raw.map(b => {
      const owner = ownerById[b.owner_id]
      const zoneId = owner?.zone_id ?? null
      return {
        id: b.id,
        dogId: b.dog_id,
        dogName: dogById[b.dog_id] ?? 'Unknown',
        ownerName: owner?.name ?? null,
        ownerPhone: owner?.phone ?? null,
        ownerAddress: owner?.address ?? null,
        pickupMethod: b.pickup_method as 'curbside' | 'home' | null,
        dropoffMethod: b.dropoff_method as 'curbside' | 'home' | null,
        status: b.status,
        pickedUpAt: b.picked_up_at ?? null,
        droppedOffAt: b.dropped_off_at ?? null,
        zoneId,
        zoneName: zoneId ? (zoneNameById[zoneId] ?? null) : null,
      }
    }).sort((a, b) => (a.zoneName ?? '').localeCompare(b.zoneName ?? ''))

    setBookings(mapped)
    setMode(deriveMode(mapped))
    setReady(true)
  }, [date, router])

  useEffect(() => { load() }, [load])

  async function confirmPickup(bookingId: string) {
    setBusy(bookingId)
    const now = new Date().toISOString()
    const { error } = await supabase
      .from('bookings')
      .update({ picked_up_at: now })
      .eq('id', bookingId)
    if (!error) {
      setBookings(prev => {
        const updated = prev.map(b =>
          b.id === bookingId ? { ...b, pickedUpAt: now } : b
        )
        setMode(deriveMode(updated))
        return updated
      })
    }
    setBusy(null)
  }

  async function markNoShow(bookingId: string) {
    setBusy(bookingId)
    const { error } = await supabase
      .from('bookings')
      .update({ status: 'no_show' })
      .eq('id', bookingId)
    if (!error) {
      setBookings(prev => {
        const updated = prev.map(b =>
          b.id === bookingId ? { ...b, status: 'no_show' } : b
        )
        setMode(deriveMode(updated))
        return updated
      })
    }
    setConfirmNoShow(null)
    setBusy(null)
  }

  async function confirmDropoff(bookingId: string) {
    setBusy(bookingId)
    const now = new Date().toISOString()
    const { error } = await supabase
      .from('bookings')
      .update({ dropped_off_at: now })
      .eq('id', bookingId)
    if (!error) {
      setBookings(prev => {
        const updated = prev.map(b =>
          b.id === bookingId ? { ...b, droppedOffAt: now } : b
        )
        setMode(deriveMode(updated))
        return updated
      })
    }
    setBusy(null)
  }

  if (!ready) {
    return (
      <main className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-sm text-gray-400">Loading…</p>
      </main>
    )
  }

  const formattedDate = (() => { try { return formatFull(date) } catch { return date } })()
  const activeBookings = bookings.filter(b => b.status !== 'no_show')
  const onHike = activeBookings.filter(b => b.pickedUpAt && !b.droppedOffAt)
  const droppedOff = activeBookings.filter(b => b.droppedOffAt)
  const noShows = bookings.filter(b => b.status === 'no_show')

  // Pickup order = zone-sorted (already). Dropoff order = reverse.
  const pickupOrder = activeBookings
  const dropoffOrder = [...activeBookings.filter(b => b.pickedUpAt)].reverse()

  // Next unpicked / undropped dog
  const nextPickup = pickupOrder.find(b => !b.pickedUpAt)
  const nextDropoff = dropoffOrder.find(b => !b.droppedOffAt)

  const allDroppedOff = activeBookings.length > 0 && activeBookings.every(b => b.droppedOffAt)

  return (
    <main className="min-h-screen bg-white flex flex-col">

      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-5 pt-10 pb-4">
        <button
          onClick={() => router.push(`/staff/hikes/${date}`)}
          className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-gray-100 text-gray-600 text-lg leading-none flex-shrink-0"
        >
          ←
        </button>
        <div className="min-w-0">
          <h1 className="text-base font-semibold text-gray-900 leading-tight truncate">
            {mode === 'pickup' ? 'Pickup sweep' : mode === 'hike' ? 'On the hike' : 'Drop-off sweep'}
          </h1>
          <p className="text-xs text-gray-400 truncate">{formattedDate}{destination ? ` · ${destination}` : ''}</p>
        </div>
        {/* Mode pill */}
        <span className={`ml-auto flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
          mode === 'pickup' ? 'bg-amber-100 text-amber-700'
          : mode === 'hike' ? 'bg-green-100 text-green-700'
          : 'bg-blue-100 text-blue-700'
        }`}>
          {mode === 'pickup' ? 'Pickup' : mode === 'hike' ? 'Hiking' : 'Drop-off'}
        </span>
      </div>

      {/* ── Mode indicator tabs ── */}
      <div className="flex gap-0 border-b border-gray-100 px-5 mb-2">
        {(['pickup', 'hike', 'dropoff'] as RunMode[]).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 py-2.5 text-xs font-medium capitalize border-b-2 transition-colors ${
              mode === m ? 'border-green-600 text-green-700' : 'border-transparent text-gray-400'
            }`}
          >
            {m === 'pickup' ? 'Pickup' : m === 'hike' ? 'Hike' : 'Drop-off'}
          </button>
        ))}
      </div>

      {/* ── No-show confirmation overlay ── */}
      {confirmNoShow && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end">
          <div className="w-full bg-white rounded-t-3xl p-6">
            <p className="text-base font-semibold text-gray-900 mb-1">Mark as no-show?</p>
            <p className="text-sm text-gray-500 mb-6">
              {bookings.find(b => b.id === confirmNoShow)?.dogName} — fee will be forfeited.
            </p>
            <button
              onClick={() => markNoShow(confirmNoShow)}
              disabled={busy === confirmNoShow}
              className="w-full bg-red-600 text-white py-4 rounded-2xl text-base font-semibold mb-3 disabled:opacity-50"
            >
              {busy === confirmNoShow ? 'Saving…' : 'Confirm no-show'}
            </button>
            <button
              onClick={() => setConfirmNoShow(null)}
              className="w-full py-4 rounded-2xl text-base font-medium text-gray-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── PICKUP MODE ── */}
      {mode === 'pickup' && (
        <div className="flex-1 overflow-y-auto px-5 pb-10">

          {/* Next pickup — hero card */}
          {nextPickup && (
            <div className="rounded-3xl bg-green-50 border-2 border-green-500 p-5 mb-4 mt-2">
              <p className="text-[11px] font-semibold text-green-600 uppercase tracking-wide mb-1">Next pickup</p>
              <p className="text-2xl font-bold text-gray-900 mb-0.5">{nextPickup.dogName}</p>
              <p className="text-sm text-gray-600">{nextPickup.ownerName}</p>
              {nextPickup.ownerAddress && (
                <p className="text-sm text-gray-500 mt-1">{nextPickup.ownerAddress}</p>
              )}
              {nextPickup.zoneName && (
                <p className="text-xs text-gray-400 mt-1">{nextPickup.zoneName}</p>
              )}
              <div className="flex gap-2 mt-1">
                {nextPickup.pickupMethod && (
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                    nextPickup.pickupMethod === 'home' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {nextPickup.pickupMethod}
                  </span>
                )}
              </div>

              <button
                onClick={() => confirmPickup(nextPickup.id)}
                disabled={busy === nextPickup.id}
                className="w-full mt-5 bg-green-600 text-white py-5 rounded-2xl text-lg font-bold disabled:opacity-50 active:bg-green-700"
              >
                {busy === nextPickup.id ? 'Saving…' : 'Confirm pickup ✓'}
              </button>

              <button
                onClick={() => setConfirmNoShow(nextPickup.id)}
                className="w-full mt-2 py-3.5 rounded-2xl text-sm font-medium text-red-500 border border-red-200"
              >
                Mark no-show
              </button>
            </div>
          )}

          {/* All other dogs in pickup order */}
          <div className="space-y-2">
            {pickupOrder.filter(b => b.id !== nextPickup?.id).map(b => (
              <div
                key={b.id}
                className={`rounded-2xl border px-4 py-3 flex items-center gap-3 ${
                  b.status === 'no_show' ? 'border-gray-100 opacity-50' : 'border-gray-200'
                }`}
              >
                {b.pickedUpAt ? (
                  <span className="text-2xl flex-shrink-0">✅</span>
                ) : b.status === 'no_show' ? (
                  <span className="text-xl flex-shrink-0">🚫</span>
                ) : (
                  <span className="w-7 h-7 rounded-full border-2 border-gray-300 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{b.dogName}</p>
                  <p className="text-xs text-gray-500">{b.ownerName}</p>
                  {b.zoneName && <p className="text-[11px] text-gray-400">{b.zoneName}</p>}
                </div>
                <div className="text-right flex-shrink-0">
                  {b.pickedUpAt && (
                    <p className="text-xs font-medium text-green-600">{fmtTime(b.pickedUpAt)}</p>
                  )}
                  {b.status === 'no_show' && (
                    <p className="text-xs text-red-400">No-show</p>
                  )}
                  {!b.pickedUpAt && b.status !== 'no_show' && (
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => confirmPickup(b.id)}
                        disabled={!!busy}
                        className="text-xs text-green-600 font-medium py-1 px-2 rounded-lg border border-green-200 active:bg-green-50"
                      >
                        {busy === b.id ? '…' : 'Pickup'}
                      </button>
                      <button
                        onClick={() => setConfirmNoShow(b.id)}
                        className="text-[11px] text-red-400"
                      >
                        No-show
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {!nextPickup && noShows.length === 0 && (
            <div className="mt-6 text-center">
              <p className="text-lg font-semibold text-green-700">All dogs picked up!</p>
              <p className="text-sm text-gray-400 mt-1">Switching to hike mode…</p>
            </div>
          )}
        </div>
      )}

      {/* ── HIKE MODE ── */}
      {mode === 'hike' && (
        <div className="flex-1 flex flex-col items-center justify-center px-5 pb-10">
          <div className="w-32 h-32 rounded-full bg-green-100 flex items-center justify-center mb-6">
            <span className="text-5xl">🥾</span>
          </div>
          <p className="text-5xl font-bold text-gray-900 mb-2">{onHike.length}</p>
          <p className="text-base text-gray-500 mb-1">
            dog{onHike.length !== 1 ? 's' : ''} on the hike
          </p>
          {destination && <p className="text-sm text-green-600 font-medium mb-8">{destination}</p>}

          {/* Dog list */}
          <div className="w-full space-y-2 mb-10">
            {onHike.map(b => (
              <div key={b.id} className="rounded-2xl border border-gray-100 px-4 py-3 flex items-center gap-3">
                <span className="text-xl">🐕</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{b.dogName}</p>
                  {b.zoneName && <p className="text-xs text-gray-400">{b.zoneName}</p>}
                </div>
                <p className="text-xs text-green-600">{fmtTime(b.pickedUpAt)}</p>
              </div>
            ))}
            {noShows.length > 0 && (
              <p className="text-xs text-gray-400 text-center pt-2">
                +{noShows.length} no-show{noShows.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>

          <button
            onClick={() => setMode('dropoff')}
            className="w-full bg-blue-600 text-white py-5 rounded-2xl text-lg font-bold active:bg-blue-700"
          >
            Start drop-off sweep →
          </button>
        </div>
      )}

      {/* ── DROPOFF MODE ── */}
      {mode === 'dropoff' && (
        <div className="flex-1 overflow-y-auto px-5 pb-10">

          {/* Next dropoff — hero card */}
          {nextDropoff && !allDroppedOff && (
            <div className="rounded-3xl bg-blue-50 border-2 border-blue-400 p-5 mb-4 mt-2">
              <p className="text-[11px] font-semibold text-blue-600 uppercase tracking-wide mb-1">Next drop-off</p>
              <p className="text-2xl font-bold text-gray-900 mb-0.5">{nextDropoff.dogName}</p>
              <p className="text-sm text-gray-600">{nextDropoff.ownerName}</p>
              {nextDropoff.ownerPhone && (
                <p className="text-sm text-blue-600 font-medium mt-1">{nextDropoff.ownerPhone}</p>
              )}
              {nextDropoff.ownerAddress && (
                <p className="text-sm text-gray-500 mt-1">{nextDropoff.ownerAddress}</p>
              )}
              {nextDropoff.dropoffMethod && (
                <span className={`inline-block text-[11px] px-2 py-0.5 rounded-full font-medium mt-2 ${
                  nextDropoff.dropoffMethod === 'home' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                }`}>
                  {nextDropoff.dropoffMethod}
                </span>
              )}

              <button
                onClick={() => confirmDropoff(nextDropoff.id)}
                disabled={busy === nextDropoff.id}
                className="w-full mt-5 bg-blue-600 text-white py-5 rounded-2xl text-lg font-bold disabled:opacity-50 active:bg-blue-700"
              >
                {busy === nextDropoff.id ? 'Saving…' : 'Confirm drop-off ✓'}
              </button>
            </div>
          )}

          {/* All dropped off */}
          {allDroppedOff && (
            <div className="rounded-3xl bg-green-50 border border-green-200 p-6 mt-2 mb-4 text-center">
              <p className="text-3xl mb-2">🎉</p>
              <p className="text-lg font-bold text-green-700">All dogs home!</p>
              <p className="text-sm text-gray-500 mt-1">Great hike today.</p>
            </div>
          )}

          {/* Dog list in dropoff order */}
          <div className="space-y-2">
            {dropoffOrder.map(b => (
              <div
                key={b.id}
                className={`rounded-2xl border px-4 py-3 flex items-center gap-3 ${
                  b.id === nextDropoff?.id && !allDroppedOff ? 'opacity-0 h-0 overflow-hidden' : 'border-gray-200'
                }`}
              >
                {b.droppedOffAt ? (
                  <span className="text-2xl flex-shrink-0">✅</span>
                ) : (
                  <span className="w-7 h-7 rounded-full border-2 border-gray-300 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{b.dogName}</p>
                  <p className="text-xs text-gray-500">{b.ownerName}</p>
                  {b.ownerAddress && <p className="text-xs text-gray-400 truncate">{b.ownerAddress}</p>}
                </div>
                <div className="text-right flex-shrink-0">
                  {b.droppedOffAt ? (
                    <p className="text-xs font-medium text-blue-600">{fmtTime(b.droppedOffAt)}</p>
                  ) : b.id !== nextDropoff?.id ? (
                    <button
                      onClick={() => confirmDropoff(b.id)}
                      disabled={!!busy}
                      className="text-xs text-blue-600 font-medium py-1 px-2 rounded-lg border border-blue-200 active:bg-blue-50"
                    >
                      {busy === b.id ? '…' : 'Drop-off'}
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>

          {droppedOff.length > 0 && !allDroppedOff && (
            <p className="text-xs text-gray-400 text-center mt-4">
              {droppedOff.length} of {dropoffOrder.length} dropped off
            </p>
          )}
        </div>
      )}

    </main>
  )
}
