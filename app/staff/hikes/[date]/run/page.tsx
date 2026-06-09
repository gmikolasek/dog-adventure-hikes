'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import { formatFull } from '@/lib/booking'
import { uploadHikePhoto } from '@/lib/photos'

const FONT = "'Noto Sans', system-ui, sans-serif"

const NOTIF_BUTTONS = [
  { key: '30min',   label: '30 min',     message: 'Your dog will be dropped off in approximately 30 minutes. 🐾' },
  { key: '15min',   label: '15 min',     message: 'Your dog will be dropped off in approximately 15 minutes. 🐾' },
  { key: '5min',    label: '5 min',      message: 'Your dog will be dropped off in approximately 5 minutes! 🐾' },
  { key: 'arrived', label: 'Arrived',    message: 'We have arrived! Please come take your dog. 🐾' },
] as const

// ---- Icons ------------------------------------------------------------------

function BackArrow() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#26452B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}

function PawLight({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="rgba(255,255,255,0.35)">
      <circle cx="6" cy="5.5" r="1.8" /><circle cx="11" cy="4" r="1.8" />
      <circle cx="16" cy="4" r="1.8" /><circle cx="20.5" cy="7" r="1.6" />
      <ellipse cx="12.5" cy="15.5" rx="6" ry="5" />
    </svg>
  )
}

function PawDark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#C0B8AE">
      <circle cx="6" cy="5.5" r="1.8" /><circle cx="11" cy="4" r="1.8" />
      <circle cx="16" cy="4" r="1.8" /><circle cx="20.5" cy="7" r="1.6" />
      <ellipse cx="12.5" cy="15.5" rx="6" ry="5" />
    </svg>
  )
}

function DragHandleIcon({ color = '#C0B8AE' }: { color?: string }) {
  return (
    <svg width={20} height={20} viewBox="0 0 20 20" fill={color}>
      <rect x="3" y="4"  width="14" height="2" rx="1"/>
      <rect x="3" y="9"  width="14" height="2" rx="1"/>
      <rect x="3" y="14" width="14" height="2" rx="1"/>
    </svg>
  )
}

function MountainIcon() {
  return (
    <svg width={48} height={48} viewBox="0 0 24 24" fill="none" stroke="#4D6B46" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3l4 8 5-5 5 15H2L8 3z" />
    </svg>
  )
}

// ---- Types ------------------------------------------------------------------

type RunBooking = {
  id: string
  dogId: string
  dogName: string
  dogPhotoUrl: string | null
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
  pickupOrder: number | null
  dropoffOrder: number | null
}

type RunMode = 'pickup' | 'hike' | 'dropoff'

type AddDogResult = {
  dogId: string
  dogName: string
  dogPhotoUrl: string | null
  ownerId: string
  ownerName: string | null
}

function sortByPickupOrder(a: RunBooking, b: RunBooking): number {
  if (a.pickupOrder === null && b.pickupOrder === null) return 0
  if (a.pickupOrder === null) return 1
  if (b.pickupOrder === null) return -1
  return a.pickupOrder - b.pickupOrder
}

function sortByDropoffOrder(a: RunBooking, b: RunBooking): number {
  const aOrd = a.dropoffOrder ?? a.pickupOrder
  const bOrd = b.dropoffOrder ?? b.pickupOrder
  if (aOrd === null && bOrd === null) return 0
  if (aOrd === null) return 1
  if (bOrd === null) return -1
  return aOrd - bOrd
}

function deriveMode(bookings: RunBooking[]): RunMode {
  if (bookings.length === 0) return 'pickup'
  const active = bookings.filter(b => b.status !== 'no_show')
  const allPickedUp = active.every(b => b.pickedUpAt)
  if (!allPickedUp) return 'pickup'
  const allDroppedOff = active.filter(b => b.pickedUpAt).every(b => b.droppedOffAt)
  if (allDroppedOff) return 'dropoff'
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
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmNoShow, setConfirmNoShow] = useState<string | null>(null)
  const [confirmUndo, setConfirmUndo] = useState<{ bookingId: string; type: 'pickup' | 'dropoff' } | null>(null)

  const [dropoffPhoto, setDropoffPhoto] = useState<Record<string, File>>({})
  const [dropoffNote, setDropoffNote] = useState<Record<string, string>>({})
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [showAddDog, setShowAddDog] = useState(false)
  const [addDogQuery, setAddDogQuery] = useState('')
  const [addDogResults, setAddDogResults] = useState<AddDogResult[]>([])
  const [addDogSelected, setAddDogSelected] = useState<AddDogResult | null>(null)
  const [addDogPickup, setAddDogPickup] = useState<'curbside' | 'home'>('home')
  const [addDogBusy, setAddDogBusy] = useState(false)
  const [addDogError, setAddDogError] = useState('')
  const [savingOrder, setSavingOrder] = useState(false)
  const [savingDropoffOrder, setSavingDropoffOrder] = useState(false)

  // Hiking finished notification
  const [hikingFinishedBusy, setHikingFinishedBusy] = useState(false)
  const [hikingFinishedCount, setHikingFinishedCount] = useState<number | null>(null)

  // Per-dog notification state: bookingId → array of sent button keys
  const [sentNotifs, setSentNotifs] = useState<Record<string, string[]>>({})
  const [notifBusy, setNotifBusy] = useState<Record<string, string | null>>({})

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
      .select('id, dog_id, owner_id, status, pickup_method, dropoff_method, picked_up_at, dropped_off_at, pickup_order, dropoff_order')
      .eq('hike_day_id', dayRow.id)
      .in('status', ['confirmed', 'no_show'])

    const raw = bRows ?? []
    if (!raw.length) { setReady(true); return }

    const dogIds = [...new Set(raw.map(b => b.dog_id))]
    const ownerIds = [...new Set(raw.map(b => b.owner_id))]

    const [{ data: dogRows }, { data: ownerRows }, { data: zoneRows }] = await Promise.all([
      supabase.from('dogs').select('id, name, photo_url').in('id', dogIds),
      supabase.from('users').select('id, name, phone, address, zone_id').in('id', ownerIds),
      supabase.from('zones').select('id, name'),
    ])

    const dogById: Record<string, { name: string; photoUrl: string | null }> = {}
    for (const d of dogRows ?? []) dogById[d.id] = { name: d.name, photoUrl: d.photo_url ?? null }

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
        dogName: dogById[b.dog_id]?.name ?? 'Unknown',
        dogPhotoUrl: dogById[b.dog_id]?.photoUrl ?? null,
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
        pickupOrder: b.pickup_order ?? null,
        dropoffOrder: b.dropoff_order ?? null,
      }
    }).sort(sortByPickupOrder)

    setBookings(mapped)
    setMode(deriveMode(mapped))
    setReady(true)
  }, [date, router])

  useEffect(() => { load() }, [load])

  async function confirmPickup(bookingId: string) {
    setBusy(bookingId)
    const now = new Date().toISOString()
    const { error } = await supabase
      .from('bookings').update({ picked_up_at: now }).eq('id', bookingId)
    if (!error) {
      setBookings(prev => {
        const updated = prev.map(b => b.id === bookingId ? { ...b, pickedUpAt: now } : b)
        setMode(deriveMode(updated))
        return updated
      })
    }
    setBusy(null)
  }

  async function markNoShow(bookingId: string) {
    setBusy(bookingId)
    const { error } = await supabase
      .from('bookings').update({ status: 'no_show' }).eq('id', bookingId)
    if (!error) {
      setBookings(prev => {
        const updated = prev.map(b => b.id === bookingId ? { ...b, status: 'no_show' } : b)
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
    const note = dropoffNote[bookingId]?.trim() || null
    const photoFile = dropoffPhoto[bookingId]

    if (photoFile) {
      const booking = bookings.find(b => b.id === bookingId)
      const result = await uploadHikePhoto(photoFile, hikeDayId)
      if (result) {
        await supabase.from('hike_photos').insert({
          hike_day_id: hikeDayId,
          dog_id: booking?.dogId ?? null,
          storage_path: result.storagePath,
          caption: null,
          taken_at: now,
        })
      }
    }

    const { error } = await supabase
      .from('bookings').update({ dropped_off_at: now, dropoff_note: note }).eq('id', bookingId)
    if (!error) {
      setBookings(prev => {
        const updated = prev.map(b => b.id === bookingId ? { ...b, droppedOffAt: now } : b)
        setMode(deriveMode(updated))
        return updated
      })
      setDropoffPhoto(prev => { const n = { ...prev }; delete n[bookingId]; return n })
      setDropoffNote(prev => { const n = { ...prev }; delete n[bookingId]; return n })
    }
    setBusy(null)
  }

  async function undoPickup(bookingId: string) {
    setBusy(bookingId)
    const { error } = await supabase
      .from('bookings').update({ picked_up_at: null }).eq('id', bookingId)
    if (!error) {
      setBookings(prev => {
        const updated = prev.map(b => b.id === bookingId ? { ...b, pickedUpAt: null } : b)
        setMode(deriveMode(updated))
        return updated
      })
    }
    setConfirmUndo(null)
    setBusy(null)
  }

  async function undoDropoff(bookingId: string) {
    setBusy(bookingId)
    const { error } = await supabase
      .from('bookings').update({ dropped_off_at: null, dropoff_note: null }).eq('id', bookingId)
    if (!error) {
      setBookings(prev => {
        const updated = prev.map(b => b.id === bookingId ? { ...b, droppedOffAt: null } : b)
        setMode(deriveMode(updated))
        return updated
      })
    }
    setConfirmUndo(null)
    setBusy(null)
  }

  async function onPickupDragEnd(result: DropResult) {
    if (!result.destination || result.destination.index === result.source.index) return
    const pending = bookings.filter(b => !b.pickedUpAt && b.status !== 'no_show')
    const nonPending = bookings.filter(b => b.pickedUpAt || b.status === 'no_show')
    const items = Array.from(pending)
    const [moved] = items.splice(result.source.index, 1)
    items.splice(result.destination.index, 0, moved)
    setBookings([...items, ...nonPending])
    setSavingOrder(true)
    await Promise.all(
      items.map((b, i) => supabase.from('bookings').update({ pickup_order: i }).eq('id', b.id))
    )
    setSavingOrder(false)
  }

  async function onDropoffDragEnd(result: DropResult) {
    if (!result.destination || result.destination.index === result.source.index) return
    const pending = bookings
      .filter(b => b.status !== 'no_show' && !!b.pickedUpAt && !b.droppedOffAt)
      .sort(sortByDropoffOrder)
    const rest = bookings.filter(b => !pending.find(p => p.id === b.id))
    const items = Array.from(pending)
    const [moved] = items.splice(result.source.index, 1)
    items.splice(result.destination.index, 0, moved)
    setBookings([...items, ...rest])
    setSavingDropoffOrder(true)
    await Promise.all(
      items.map((b, i) => supabase.from('bookings').update({ dropoff_order: i }).eq('id', b.id))
    )
    setSavingDropoffOrder(false)
  }

  async function sendNotif(bookingId: string, key: string, phone: string, message: string) {
    setNotifBusy(prev => ({ ...prev, [bookingId]: key }))
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        await fetch('/api/notify', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ phone, message, hikeDayId }),
        })
      }
    } catch { /* mark sent regardless */ }
    setSentNotifs(prev => ({ ...prev, [bookingId]: [...(prev[bookingId] ?? []), key] }))
    setNotifBusy(prev => ({ ...prev, [bookingId]: null }))
  }

  async function sendHikingFinished() {
    setHikingFinishedBusy(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setHikingFinishedBusy(false); return }

    const activeBookings = bookings.filter(b => b.status !== 'no_show')
    const phones = [...new Set(activeBookings.map(b => b.ownerPhone).filter(Boolean) as string[])]

    for (const phone of phones) {
      try {
        await fetch('/api/notify', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            phone,
            message: 'Hiking is finished! We are on our way home. 🐾 Your dog had a great time today!',
            hikeDayId,
          }),
        })
      } catch { /* continue */ }
    }

    setHikingFinishedCount(phones.length)
    setHikingFinishedBusy(false)
  }

  async function handleAddDogSearch(q: string) {
    setAddDogQuery(q)
    setAddDogSelected(null)
    if (q.length < 2) { setAddDogResults([]); return }
    const { data } = await supabase
      .from('dogs')
      .select('id, name, photo_url, owner_id')
      .in('approval_status', ['approved', 'approved_with_conditions'])
      .ilike('name', `%${q}%`)
      .limit(10)
    if (!data?.length) { setAddDogResults([]); return }
    const ownerIds = [...new Set((data as { owner_id: string }[]).map(d => d.owner_id))]
    const { data: ownerRows } = await supabase
      .from('users').select('id, name').in('id', ownerIds)
    const ownerMap: Record<string, string | null> = {}
    for (const u of (ownerRows ?? [])) ownerMap[u.id] = u.name
    const existingDogIds = new Set(bookings.map(b => b.dogId))
    setAddDogResults(
      (data as { id: string; name: string; photo_url: string | null; owner_id: string }[])
        .filter(d => !existingDogIds.has(d.id))
        .map(d => ({ dogId: d.id, dogName: d.name, dogPhotoUrl: d.photo_url ?? null, ownerId: d.owner_id, ownerName: ownerMap[d.owner_id] ?? null }))
    )
  }

  function closeAddDog() {
    setShowAddDog(false)
    setAddDogQuery('')
    setAddDogResults([])
    setAddDogSelected(null)
    setAddDogPickup('home')
    setAddDogError('')
  }

  async function handleAddDog() {
    if (!addDogSelected || !hikeDayId) return
    setAddDogBusy(true)
    setAddDogError('')
    const { data: newBooking, error } = await supabase
      .from('bookings')
      .insert({
        hike_day_id: hikeDayId,
        dog_id: addDogSelected.dogId,
        owner_id: addDogSelected.ownerId,
        status: 'confirmed',
        pickup_method: addDogPickup,
        dropoff_method: 'home',
        amount_charged: 0,
        credit_used: 0,
        staff_added: true,
      })
      .select('id')
      .single()
    if (error || !newBooking) {
      setAddDogError('Failed to add — ' + (error?.message ?? 'unknown error'))
      setAddDogBusy(false)
      return
    }
    const { data: ownerRow } = await supabase
      .from('users').select('name, phone, address, zone_id').eq('id', addDogSelected.ownerId).maybeSingle()
    let zoneName: string | null = null
    if (ownerRow?.zone_id) {
      const { data: zoneRow } = await supabase
        .from('zones').select('name').eq('id', ownerRow.zone_id).maybeSingle()
      zoneName = zoneRow?.name ?? null
    }
    const newEntry: RunBooking = {
      id: (newBooking as { id: string }).id,
      dogId: addDogSelected.dogId,
      dogName: addDogSelected.dogName,
      dogPhotoUrl: addDogSelected.dogPhotoUrl,
      ownerName: ownerRow?.name ?? addDogSelected.ownerName,
      ownerPhone: ownerRow?.phone ?? null,
      ownerAddress: ownerRow?.address ?? null,
      pickupMethod: addDogPickup,
      dropoffMethod: 'home',
      status: 'confirmed',
      pickedUpAt: null,
      droppedOffAt: null,
      zoneId: ownerRow?.zone_id ?? null,
      zoneName,
      pickupOrder: null,
      dropoffOrder: null,
    }
    setBookings(prev => {
      const updated = [...prev, newEntry].sort(sortByPickupOrder)
      setMode(deriveMode(updated))
      return updated
    })
    setAddDogBusy(false)
    closeAddDog()
  }

  if (!ready) {
    return (
      <main style={{ minHeight: '100vh', backgroundColor: '#F5F0E8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT }}>
        <p style={{ fontSize: 14, color: '#8A7E72' }}>Loading…</p>
      </main>
    )
  }

  const formattedDate = (() => { try { return formatFull(date) } catch { return date } })()
  const activeBookings = bookings.filter(b => b.status !== 'no_show')
  const onHike = activeBookings.filter(b => b.pickedUpAt && !b.droppedOffAt)
  const noShows = bookings.filter(b => b.status === 'no_show')

  const pendingDogs = activeBookings.filter(b => !b.pickedUpAt)
  const pickedUpDogs = activeBookings.filter(b => b.pickedUpAt)
  const dropoffPending = activeBookings.filter(b => !!b.pickedUpAt && !b.droppedOffAt).sort(sortByDropoffOrder)
  const droppedOffDogs = activeBookings.filter(b => !!b.droppedOffAt)

  const nextPickup = pendingDogs[0] ?? null
  const nextDropoff = dropoffPending[0] ?? null

  const allDroppedOff = activeBookings.length > 0 && activeBookings.every(b => b.droppedOffAt)

  const modeLabel = mode === 'pickup' ? 'Pickup' : mode === 'hike' ? 'Hiking' : 'Drop-off'
  const headerTitle = mode === 'pickup' ? 'Pickup' : mode === 'hike' ? 'On the hike' : 'Drop-off'

  // Suppress unused variable warning
  void nextPickup

  return (
    <main style={{ minHeight: '100svh', backgroundColor: '#F5F0E8', fontFamily: FONT, display: 'flex', flexDirection: 'column' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '48px 20px 16px' }}>
        <button
          onClick={() => router.push(`/staff/hikes/${date}`)}
          style={{ width: 32, height: 32, borderRadius: '50%', backgroundColor: '#E8E2D9', border: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, padding: 0 }}
        >
          <BackArrow />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#3B2A1F', fontFamily: FONT, margin: 0, lineHeight: 1.2 }}>
            {headerTitle}
          </h1>
          <p style={{ fontSize: 13, color: '#8A7E72', fontFamily: FONT, margin: 0, marginTop: 2 }}>
            {formattedDate}{destination ? ` · ${destination}` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <button
            onClick={() => setShowAddDog(true)}
            style={{ backgroundColor: '#EEE9E0', color: '#26452B', borderRadius: 20, padding: '5px 12px', fontSize: 13, fontWeight: 600, fontFamily: FONT, border: 'none', cursor: 'pointer' }}
          >
            + Add dog
          </button>
          <span style={{ backgroundColor: '#E08A3E', color: 'white', borderRadius: 20, padding: '4px 10px', fontSize: 12, fontWeight: 600, fontFamily: FONT }}>
            {modeLabel}
          </span>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div style={{ display: 'flex', backgroundColor: 'white', borderBottom: '1px solid #E8E2D9' }}>
        {(['pickup', 'hike', 'dropoff'] as RunMode[]).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            style={{
              flex: 1, padding: '12px 0', fontSize: 14, fontWeight: 600, fontFamily: FONT,
              border: 'none', borderBottom: mode === m ? '2px solid #26452B' : '2px solid transparent',
              color: mode === m ? '#26452B' : '#8A7E72',
              backgroundColor: 'transparent', cursor: 'pointer',
            }}
          >
            {m === 'pickup' ? 'Pickup' : m === 'hike' ? 'Hike' : 'Drop-Off'}
          </button>
        ))}
      </div>

      {/* ── Add Dog Modal ── */}
      {showAddDog && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 50, display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ width: '100%', backgroundColor: 'white', borderRadius: '24px 24px 0 0', padding: 24, maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <p style={{ fontSize: 16, fontWeight: 700, color: '#3B2A1F', fontFamily: FONT, margin: 0 }}>Add dog to hike</p>
              <button
                onClick={closeAddDog}
                style={{ width: 32, height: 32, borderRadius: '50%', backgroundColor: '#EEE9E0', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 14, color: '#8A7E72' }}
              >
                ✕
              </button>
            </div>
            <input
              type="text"
              placeholder="Search by dog name…"
              value={addDogQuery}
              onChange={e => handleAddDogSearch(e.target.value)}
              autoFocus
              style={{ width: '100%', border: '1px solid #E8E2D9', borderRadius: 10, padding: '10px 12px', fontSize: 14, color: '#171717', WebkitTextFillColor: '#171717', backgroundColor: 'white', outline: 'none', fontFamily: FONT, boxSizing: 'border-box', marginBottom: 12 }}
            />
            {!addDogSelected && addDogResults.length > 0 && (
              <div style={{ border: '1px solid #E8E2D9', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
                {addDogResults.map((r, i) => (
                  <button
                    key={r.dogId}
                    onClick={() => setAddDogSelected(r)}
                    style={{ width: '100%', padding: '12px 16px', textAlign: 'left', backgroundColor: 'white', border: 'none', borderTop: i > 0 ? '1px solid #E8E2D9' : 'none', cursor: 'pointer', fontFamily: FONT }}
                  >
                    <p style={{ fontSize: 14, fontWeight: 600, color: '#3B2A1F', margin: 0 }}>{r.dogName}</p>
                    <p style={{ fontSize: 12, color: '#8A7E72', margin: 0 }}>{r.ownerName ?? '—'}</p>
                  </button>
                ))}
              </div>
            )}
            {addDogQuery.length >= 2 && !addDogSelected && addDogResults.length === 0 && (
              <p style={{ fontSize: 14, color: '#8A7E72', fontFamily: FONT, marginBottom: 12 }}>No approved dogs found.</p>
            )}
            {addDogSelected && (
              <>
                <div style={{ border: '1px solid #E8E2D9', borderRadius: 12, backgroundColor: '#E8F0E5', padding: '12px 16px', marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 600, color: '#3B2A1F', fontFamily: FONT, margin: 0 }}>{addDogSelected.dogName}</p>
                      <p style={{ fontSize: 12, color: '#8A7E72', fontFamily: FONT, margin: 0 }}>{addDogSelected.ownerName ?? '—'}</p>
                    </div>
                    <button onClick={() => setAddDogSelected(null)} style={{ fontSize: 12, color: '#8A7E72', fontFamily: FONT, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                      Change
                    </button>
                  </div>
                </div>
                <div style={{ marginBottom: 20 }}>
                  <p style={{ fontSize: 13, color: '#8A7E72', fontFamily: FONT, marginBottom: 8 }}>Pickup method</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {(['home', 'curbside'] as const).map(m => (
                      <button
                        key={m}
                        onClick={() => setAddDogPickup(m)}
                        style={{
                          padding: '10px', borderRadius: 10, fontSize: 14, fontWeight: 500, fontFamily: FONT, cursor: 'pointer', textTransform: 'capitalize',
                          backgroundColor: addDogPickup === m ? '#26452B' : 'white',
                          color: addDogPickup === m ? 'white' : '#3B2A1F',
                          border: addDogPickup === m ? 'none' : '1px solid #E8E2D9',
                        }}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
            {addDogError && <p style={{ fontSize: 12, color: '#ef4444', fontFamily: FONT, marginBottom: 12 }}>{addDogError}</p>}
            <button
              onClick={handleAddDog}
              disabled={!addDogSelected || addDogBusy}
              style={{ width: '100%', backgroundColor: '#26452B', color: 'white', padding: '14px', borderRadius: 12, fontSize: 16, fontWeight: 600, fontFamily: FONT, border: 'none', cursor: 'pointer', marginBottom: 8, opacity: (!addDogSelected || addDogBusy) ? 0.5 : 1 }}
            >
              {addDogBusy ? 'Adding…' : 'Add to hike'}
            </button>
            <button
              onClick={closeAddDog}
              style={{ width: '100%', padding: '12px', fontSize: 16, fontWeight: 500, color: '#8A7E72', fontFamily: FONT, background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Undo confirmation overlay ── */}
      {confirmUndo && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 50, display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ width: '100%', backgroundColor: 'white', borderRadius: '24px 24px 0 0', padding: 24 }}>
            <p style={{ fontSize: 16, fontWeight: 700, color: '#3B2A1F', fontFamily: FONT, marginBottom: 4 }}>
              Undo {confirmUndo.type === 'pickup' ? 'pickup' : 'drop-off'}?
            </p>
            <p style={{ fontSize: 14, color: '#8A7E72', fontFamily: FONT, marginBottom: 24 }}>
              This will reset the {confirmUndo.type === 'pickup' ? 'pickup' : 'drop-off'} record for{' '}
              {bookings.find(b => b.id === confirmUndo.bookingId)?.dogName}.
            </p>
            <button
              onClick={() => confirmUndo.type === 'pickup' ? undoPickup(confirmUndo.bookingId) : undoDropoff(confirmUndo.bookingId)}
              disabled={busy === confirmUndo.bookingId}
              style={{ width: '100%', backgroundColor: '#3B2A1F', color: 'white', padding: '14px', borderRadius: 12, fontSize: 16, fontWeight: 600, fontFamily: FONT, border: 'none', cursor: 'pointer', marginBottom: 12, opacity: busy === confirmUndo.bookingId ? 0.5 : 1 }}
            >
              {busy === confirmUndo.bookingId ? 'Saving…' : 'Yes, undo'}
            </button>
            <button
              onClick={() => setConfirmUndo(null)}
              style={{ width: '100%', padding: '12px', fontSize: 16, color: '#8A7E72', fontFamily: FONT, background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── No-show confirmation overlay ── */}
      {confirmNoShow && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 50, display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ width: '100%', backgroundColor: 'white', borderRadius: '24px 24px 0 0', padding: 24 }}>
            <p style={{ fontSize: 16, fontWeight: 700, color: '#3B2A1F', fontFamily: FONT, marginBottom: 4 }}>Mark as no-show?</p>
            <p style={{ fontSize: 14, color: '#8A7E72', fontFamily: FONT, marginBottom: 24 }}>
              {bookings.find(b => b.id === confirmNoShow)?.dogName} — fee will be forfeited.
            </p>
            <button
              onClick={() => markNoShow(confirmNoShow)}
              disabled={busy === confirmNoShow}
              style={{ width: '100%', backgroundColor: '#ef4444', color: 'white', padding: '14px', borderRadius: 12, fontSize: 16, fontWeight: 600, fontFamily: FONT, border: 'none', cursor: 'pointer', marginBottom: 12, opacity: busy === confirmNoShow ? 0.5 : 1 }}
            >
              {busy === confirmNoShow ? 'Saving…' : 'Confirm no-show'}
            </button>
            <button
              onClick={() => setConfirmNoShow(null)}
              style={{ width: '100%', padding: '12px', fontSize: 16, color: '#8A7E72', fontFamily: FONT, background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ══ PICKUP MODE ══ */}
      {mode === 'pickup' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px 40px' }}>

          {pendingDogs.length > 1 && (
            <p style={{ fontSize: 12, color: '#8A7E72', fontStyle: 'italic', fontFamily: FONT, textAlign: 'right', marginBottom: 8 }}>
              {savingOrder ? 'Saving…' : 'Hold to reorder'}
            </p>
          )}

          <DragDropContext onDragEnd={onPickupDragEnd}>
            <Droppable droppableId="pickup-queue">
              {(provided) => (
                <div ref={provided.innerRef} {...provided.droppableProps}>
                  {pendingDogs.map((b, i) => (
                    <Draggable key={b.id} draggableId={b.id} index={i}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          style={{
                            ...provided.draggableProps.style,
                            marginBottom: 8,
                            boxShadow: snapshot.isDragging ? '0 4px 16px rgba(0,0,0,0.15)' : 'none',
                          }}
                        >
                          {i === 0 ? (
                            /* Hero card */
                            <div style={{ backgroundColor: '#26452B', borderRadius: 16, padding: 16 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                                <p style={{ fontSize: 11, fontWeight: 700, color: '#E6C89A', letterSpacing: '0.1em', fontFamily: FONT, margin: 0, textTransform: 'uppercase' }}>
                                  Next Pickup
                                </p>
                                <div {...(provided.dragHandleProps ?? {})} style={{ cursor: 'grab', lineHeight: 0 }}>
                                  <DragHandleIcon color="rgba(255,255,255,0.4)" />
                                </div>
                              </div>
                              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 16 }}>
                                {b.dogPhotoUrl ? (
                                  <img src={b.dogPhotoUrl} alt="" style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', border: '2px solid white', flexShrink: 0 }} />
                                ) : (
                                  <div style={{ width: 64, height: 64, borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.12)', border: '2px solid rgba(255,255,255,0.25)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <PawLight size={28} />
                                  </div>
                                )}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <p style={{ fontSize: 20, fontWeight: 700, color: 'white', fontFamily: FONT, margin: '0 0 2px' }}>{b.dogName}</p>
                                  <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', fontFamily: FONT, margin: '0 0 2px' }}>{b.ownerName}</p>
                                  {b.ownerAddress && (
                                    <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', fontFamily: FONT, margin: '0 0 4px' }}>{b.ownerAddress}</p>
                                  )}
                                  {b.zoneName && (
                                    <p style={{ fontSize: 12, color: '#E6C89A', fontFamily: FONT, margin: '0 0 6px' }}>{b.zoneName}</p>
                                  )}
                                  {b.pickupMethod && (
                                    <span style={{ backgroundColor: 'rgba(255,255,255,0.2)', color: 'white', borderRadius: 20, padding: '2px 10px', fontSize: 12, fontFamily: FONT }}>
                                      {b.pickupMethod}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <NotifRow
                                booking={b}
                                sentKeys={sentNotifs[b.id] ?? []}
                                busyKey={notifBusy[b.id] ?? null}
                                onSend={(key, msg) => sendNotif(b.id, key, b.ownerPhone!, msg)}
                                dark
                              />
                              <button
                                onClick={() => confirmPickup(b.id)}
                                disabled={busy === b.id}
                                style={{ width: '100%', backgroundColor: '#E08A3E', color: 'white', borderRadius: 12, padding: '14px', fontSize: 16, fontWeight: 600, fontFamily: FONT, border: 'none', cursor: 'pointer', marginTop: 12, marginBottom: 8, opacity: busy === b.id ? 0.5 : 1 }}
                              >
                                {busy === b.id ? 'Saving…' : 'Confirm pickup ✓'}
                              </button>
                              <button
                                onClick={() => setConfirmNoShow(b.id)}
                                style={{ width: '100%', backgroundColor: 'transparent', border: 'none', color: '#FBE9E3', fontSize: 14, fontFamily: FONT, cursor: 'pointer', padding: '8px', textAlign: 'center' }}
                              >
                                Mark no-show
                              </button>
                            </div>
                          ) : (
                            /* Regular card */
                            <div style={{ backgroundColor: 'white', border: '1px solid #E8E2D9', borderRadius: 16, padding: 16 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                {b.dogPhotoUrl ? (
                                  <img src={b.dogPhotoUrl} alt="" style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', border: '2px solid #26452B', flexShrink: 0 }} />
                                ) : (
                                  <div style={{ width: 56, height: 56, borderRadius: '50%', backgroundColor: '#EEE9E0', border: '2px solid #26452B', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <PawDark size={22} />
                                  </div>
                                )}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <p style={{ fontSize: 16, fontWeight: 700, color: '#3B2A1F', fontFamily: FONT, margin: '0 0 2px' }}>{b.dogName}</p>
                                  <p style={{ fontSize: 13, color: '#8A7E72', fontFamily: FONT, margin: '0 0 4px' }}>
                                    {b.ownerName}{b.zoneName ? ` · ${b.zoneName}` : ''}
                                  </p>
                                  {b.pickupMethod && (
                                    <span style={{ backgroundColor: '#EEE9E0', color: '#3B2A1F', borderRadius: 20, padding: '2px 10px', fontSize: 12, fontFamily: FONT }}>
                                      {b.pickupMethod}
                                    </span>
                                  )}
                                </div>
                                <div
                                  {...(provided.dragHandleProps ?? {})}
                                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, flexShrink: 0, cursor: 'grab' }}
                                >
                                  <DragHandleIcon />
                                </div>
                              </div>
                              <NotifRow
                                booking={b}
                                sentKeys={sentNotifs[b.id] ?? []}
                                busyKey={notifBusy[b.id] ?? null}
                                onSend={(key, msg) => sendNotif(b.id, key, b.ownerPhone!, msg)}
                                dark={false}
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>

          {/* Already picked up (static) */}
          {pickedUpDogs.map(b => (
            <div key={b.id} style={{ backgroundColor: 'white', border: '1px solid #E8E2D9', borderRadius: 16, padding: 16, marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {b.dogPhotoUrl ? (
                  <img src={b.dogPhotoUrl} alt="" style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', border: '2px solid #26452B', flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 56, height: 56, borderRadius: '50%', backgroundColor: '#EEE9E0', border: '2px solid #26452B', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <PawDark size={22} />
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 16, fontWeight: 700, color: '#3B2A1F', fontFamily: FONT, margin: '0 0 2px' }}>{b.dogName}</p>
                  <p style={{ fontSize: 13, color: '#8A7E72', fontFamily: FONT, margin: 0 }}>{b.ownerName}</p>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: '#26452B', fontFamily: FONT, margin: '0 0 2px' }}>{fmtTime(b.pickedUpAt)}</p>
                  <button
                    onClick={() => setConfirmUndo({ bookingId: b.id, type: 'pickup' })}
                    style={{ fontSize: 11, color: '#8A7E72', fontFamily: FONT, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                  >
                    Undo
                  </button>
                </div>
              </div>
            </div>
          ))}

          {/* No-shows (static) */}
          {noShows.map(b => (
            <div key={b.id} style={{ backgroundColor: 'white', border: '1px solid #E8E2D9', borderRadius: 16, padding: 16, marginBottom: 8, opacity: 0.55 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {b.dogPhotoUrl ? (
                  <img src={b.dogPhotoUrl} alt="" style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', border: '2px solid #E8E2D9', flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 56, height: 56, borderRadius: '50%', backgroundColor: '#EEE9E0', border: '2px solid #E8E2D9', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <PawDark size={22} />
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 16, fontWeight: 700, color: '#3B2A1F', fontFamily: FONT, margin: '0 0 2px' }}>{b.dogName}</p>
                  <p style={{ fontSize: 13, color: '#8A7E72', fontFamily: FONT, margin: 0 }}>{b.ownerName}</p>
                </div>
                <p style={{ fontSize: 12, color: '#C1562D', fontFamily: FONT, flexShrink: 0 }}>No-show</p>
              </div>
            </div>
          ))}

          {pendingDogs.length === 0 && noShows.length === 0 && (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <p style={{ fontSize: 16, fontWeight: 700, color: '#26452B', fontFamily: FONT, margin: '0 0 4px' }}>All dogs picked up!</p>
              <p style={{ fontSize: 14, color: '#8A7E72', fontFamily: FONT, margin: 0 }}>Switching to hike mode…</p>
            </div>
          )}

        </div>
      )}

      {/* ══ HIKE MODE ══ */}
      {mode === 'hike' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 20px 40px' }}>
          <div style={{ width: 96, height: 96, borderRadius: '50%', backgroundColor: '#E8F0E5', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
            <MountainIcon />
          </div>
          <p style={{ fontSize: 48, fontWeight: 700, color: '#3B2A1F', fontFamily: FONT, margin: '0 0 4px' }}>{onHike.length}</p>
          <p style={{ fontSize: 16, color: '#8A7E72', fontFamily: FONT, margin: '0 0 4px' }}>
            dog{onHike.length !== 1 ? 's' : ''} on the hike
          </p>
          {destination && (
            <p style={{ fontSize: 14, color: '#26452B', fontWeight: 600, fontFamily: FONT, margin: '0 0 28px' }}>{destination}</p>
          )}

          <div style={{ width: '100%', marginBottom: 24 }}>
            {onHike.map(b => (
              <div key={b.id} style={{ backgroundColor: 'white', border: '1px solid #E8E2D9', borderRadius: 16, padding: 16, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
                {b.dogPhotoUrl ? (
                  <img src={b.dogPhotoUrl} alt="" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', border: '2px solid #26452B', flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 44, height: 44, borderRadius: '50%', backgroundColor: '#EEE9E0', border: '2px solid #26452B', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <PawDark size={18} />
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: '#3B2A1F', fontFamily: FONT, margin: 0 }}>{b.dogName}</p>
                  {b.zoneName && <p style={{ fontSize: 12, color: '#8A7E72', fontFamily: FONT, margin: 0 }}>{b.zoneName}</p>}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p style={{ fontSize: 12, color: '#26452B', fontFamily: FONT, margin: '0 0 2px' }}>{fmtTime(b.pickedUpAt)}</p>
                  <button
                    onClick={() => setConfirmUndo({ bookingId: b.id, type: 'pickup' })}
                    style={{ fontSize: 11, color: '#8A7E72', fontFamily: FONT, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                  >
                    Undo pickup
                  </button>
                </div>
              </div>
            ))}
            {noShows.length > 0 && (
              <p style={{ fontSize: 12, color: '#8A7E72', fontFamily: FONT, textAlign: 'center', padding: '8px 0 0' }}>
                +{noShows.length} no-show{noShows.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>

          <button
            onClick={() => setMode('dropoff')}
            style={{ width: '100%', backgroundColor: '#26452B', color: 'white', padding: '14px', borderRadius: 12, fontSize: 16, fontWeight: 600, fontFamily: FONT, border: 'none', cursor: 'pointer', marginBottom: 12 }}
          >
            Start drop-off →
          </button>

          {/* Hiking finished button */}
          {hikingFinishedCount !== null ? (
            <p style={{ fontSize: 14, color: '#8A7E72', fontFamily: FONT, textAlign: 'center' }}>
              Sent to {hikingFinishedCount} owner{hikingFinishedCount !== 1 ? 's' : ''} ✓
            </p>
          ) : (
            <button
              onClick={sendHikingFinished}
              disabled={hikingFinishedBusy}
              style={{
                width: '100%', backgroundColor: 'white', border: '1px solid #E8E2D9',
                color: '#3B2A1F', borderRadius: 12, padding: '12px', fontSize: 14,
                fontFamily: FONT, cursor: hikingFinishedBusy ? 'not-allowed' : 'pointer',
                opacity: hikingFinishedBusy ? 0.6 : 1,
              }}
            >
              {hikingFinishedBusy ? 'Sending…' : 'Hiking finished — on our way home 🏠'}
            </button>
          )}
        </div>
      )}

      {/* ══ DROPOFF MODE ══ */}
      {mode === 'dropoff' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px 40px' }}>

          {allDroppedOff && (
            <div style={{ backgroundColor: '#E8F0E5', border: '1px solid #C5D9BF', borderRadius: 16, padding: 24, marginBottom: 12, textAlign: 'center' }}>
              <p style={{ fontSize: 28, margin: '0 0 8px' }}>🎉</p>
              <p style={{ fontSize: 18, fontWeight: 700, color: '#26452B', fontFamily: FONT, margin: '0 0 4px' }}>All dogs home!</p>
              <p style={{ fontSize: 14, color: '#4D6B46', fontFamily: FONT, margin: 0 }}>Great hike today.</p>
            </div>
          )}

          {!allDroppedOff && dropoffPending.length > 1 && (
            <p style={{ fontSize: 12, color: '#8A7E72', fontStyle: 'italic', fontFamily: FONT, textAlign: 'right', marginBottom: 8 }}>
              {savingDropoffOrder ? 'Saving…' : 'Hold to reorder'}
            </p>
          )}

          {/* Draggable dropoff queue */}
          {!allDroppedOff && (
            <DragDropContext onDragEnd={onDropoffDragEnd}>
              <Droppable droppableId="dropoff-queue">
                {(provided) => (
                  <div ref={provided.innerRef} {...provided.droppableProps}>
                    {dropoffPending.map((b, i) => (
                      <Draggable key={b.id} draggableId={b.id} index={i}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            style={{
                              ...provided.draggableProps.style,
                              marginBottom: 8,
                              boxShadow: snapshot.isDragging ? '0 4px 16px rgba(0,0,0,0.15)' : 'none',
                            }}
                          >
                            {i === 0 ? (
                              /* Hero card */
                              <div style={{ backgroundColor: '#26452B', borderRadius: 16, padding: 16 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                                  <p style={{ fontSize: 11, fontWeight: 700, color: '#E6C89A', letterSpacing: '0.1em', fontFamily: FONT, margin: 0, textTransform: 'uppercase' }}>
                                    Next Drop-Off
                                  </p>
                                  <div {...(provided.dragHandleProps ?? {})} style={{ cursor: 'grab', lineHeight: 0 }}>
                                    <DragHandleIcon color="rgba(255,255,255,0.4)" />
                                  </div>
                                </div>
                                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 16 }}>
                                  {b.dogPhotoUrl ? (
                                    <img src={b.dogPhotoUrl} alt="" style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', border: '2px solid white', flexShrink: 0 }} />
                                  ) : (
                                    <div style={{ width: 64, height: 64, borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.12)', border: '2px solid rgba(255,255,255,0.25)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                      <PawLight size={28} />
                                    </div>
                                  )}
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{ fontSize: 20, fontWeight: 700, color: 'white', fontFamily: FONT, margin: '0 0 2px' }}>{b.dogName}</p>
                                    <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', fontFamily: FONT, margin: '0 0 2px' }}>{b.ownerName}</p>
                                    {b.ownerPhone && (
                                      <p style={{ fontSize: 13, color: '#E6C89A', fontFamily: FONT, margin: '0 0 2px' }}>{b.ownerPhone}</p>
                                    )}
                                    {b.ownerAddress && (
                                      <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', fontFamily: FONT, margin: '0 0 6px' }}>{b.ownerAddress}</p>
                                    )}
                                    {b.dropoffMethod && (
                                      <span style={{ backgroundColor: 'rgba(255,255,255,0.2)', color: 'white', borderRadius: 20, padding: '2px 10px', fontSize: 12, fontFamily: FONT }}>
                                        {b.dropoffMethod}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <NotifRow
                                  booking={b}
                                  sentKeys={sentNotifs[b.id] ?? []}
                                  busyKey={notifBusy[b.id] ?? null}
                                  onSend={(key, msg) => sendNotif(b.id, key, b.ownerPhone!, msg)}
                                  dark
                                />

                                {/* Optional photo */}
                                <div style={{ marginTop: 12, marginBottom: 12 }}>
                                  <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    style={{ display: 'none' }}
                                    onChange={e => {
                                      const file = e.target.files?.[0]
                                      if (file) setDropoffPhoto(prev => ({ ...prev, [b.id]: file }))
                                      e.target.value = ''
                                    }}
                                  />
                                  {dropoffPhoto[b.id] ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 10, padding: '8px 12px' }}>
                                      <span style={{ fontSize: 13, color: 'white', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: FONT }}>
                                        📷 {dropoffPhoto[b.id].name}
                                      </span>
                                      <button
                                        onClick={() => setDropoffPhoto(prev => { const n = { ...prev }; delete n[b.id]; return n })}
                                        style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', fontFamily: FONT, background: 'none', border: 'none', cursor: 'pointer' }}
                                      >
                                        Remove
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => fileInputRef.current?.click()}
                                      style={{ width: '100%', padding: '10px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.25)', backgroundColor: 'transparent', fontSize: 13, color: 'rgba(255,255,255,0.7)', fontFamily: FONT, cursor: 'pointer' }}
                                    >
                                      📷 Add photo (optional)
                                    </button>
                                  )}
                                </div>

                                {/* Optional note */}
                                <textarea
                                  maxLength={200}
                                  placeholder="Note for owner (optional)"
                                  value={dropoffNote[b.id] ?? ''}
                                  onChange={e => setDropoffNote(prev => ({ ...prev, [b.id]: e.target.value }))}
                                  rows={2}
                                  style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.25)', backgroundColor: 'rgba(255,255,255,0.08)', fontSize: 13, color: 'white', WebkitTextFillColor: 'white', fontFamily: FONT, resize: 'none', outline: 'none', boxSizing: 'border-box', marginBottom: 12 }}
                                />

                                <button
                                  onClick={() => confirmDropoff(b.id)}
                                  disabled={busy === b.id}
                                  style={{ width: '100%', backgroundColor: '#E08A3E', color: 'white', borderRadius: 12, padding: '14px', fontSize: 16, fontWeight: 600, fontFamily: FONT, border: 'none', cursor: 'pointer', opacity: busy === b.id ? 0.5 : 1 }}
                                >
                                  {busy === b.id ? 'Saving…' : 'Confirm drop-off ✓'}
                                </button>
                              </div>
                            ) : (
                              /* Regular card */
                              <div style={{ backgroundColor: 'white', border: '1px solid #E8E2D9', borderRadius: 16, padding: 16 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                  {b.dogPhotoUrl ? (
                                    <img src={b.dogPhotoUrl} alt="" style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', border: '2px solid #26452B', flexShrink: 0 }} />
                                  ) : (
                                    <div style={{ width: 56, height: 56, borderRadius: '50%', backgroundColor: '#EEE9E0', border: '2px solid #26452B', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                      <PawDark size={22} />
                                    </div>
                                  )}
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{ fontSize: 16, fontWeight: 700, color: '#3B2A1F', fontFamily: FONT, margin: '0 0 2px' }}>{b.dogName}</p>
                                    <p style={{ fontSize: 13, color: '#8A7E72', fontFamily: FONT, margin: 0 }}>
                                      {b.ownerName}{b.ownerAddress ? ` · ${b.ownerAddress}` : ''}
                                    </p>
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                                    <button
                                      onClick={() => confirmDropoff(b.id)}
                                      disabled={!!busy}
                                      style={{ backgroundColor: '#E8F0E5', color: '#26452B', borderRadius: 8, padding: '5px 10px', fontSize: 12, fontWeight: 600, fontFamily: FONT, border: 'none', cursor: 'pointer', opacity: busy ? 0.5 : 1 }}
                                    >
                                      {busy === b.id ? '…' : 'Drop-off'}
                                    </button>
                                    <div
                                      {...(provided.dragHandleProps ?? {})}
                                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, cursor: 'grab' }}
                                    >
                                      <DragHandleIcon />
                                    </div>
                                  </div>
                                </div>
                                <NotifRow
                                  booking={b}
                                  sentKeys={sentNotifs[b.id] ?? []}
                                  busyKey={notifBusy[b.id] ?? null}
                                  onSend={(key, msg) => sendNotif(b.id, key, b.ownerPhone!, msg)}
                                  dark={false}
                                />
                              </div>
                            )}
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          )}

          {/* Already dropped off (static) */}
          {droppedOffDogs.map(b => (
            <div key={b.id} style={{ backgroundColor: 'white', border: '1px solid #E8E2D9', borderRadius: 16, padding: 16, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
              {b.dogPhotoUrl ? (
                <img src={b.dogPhotoUrl} alt="" style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', border: '2px solid #26452B', flexShrink: 0 }} />
              ) : (
                <div style={{ width: 56, height: 56, borderRadius: '50%', backgroundColor: '#EEE9E0', border: '2px solid #26452B', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <PawDark size={22} />
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 16, fontWeight: 700, color: '#3B2A1F', fontFamily: FONT, margin: '0 0 2px' }}>{b.dogName}</p>
                <p style={{ fontSize: 13, color: '#8A7E72', fontFamily: FONT, margin: 0 }}>
                  {b.ownerName}{b.ownerAddress ? ` · ${b.ownerAddress}` : ''}
                </p>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: '#26452B', fontFamily: FONT, margin: '0 0 2px' }}>{fmtTime(b.droppedOffAt)}</p>
                <button
                  onClick={() => setConfirmUndo({ bookingId: b.id, type: 'dropoff' })}
                  style={{ fontSize: 11, color: '#8A7E72', fontFamily: FONT, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                >
                  Undo
                </button>
              </div>
            </div>
          ))}

          {droppedOffDogs.length > 0 && !allDroppedOff && (
            <p style={{ fontSize: 12, color: '#8A7E72', fontFamily: FONT, textAlign: 'center', padding: '16px 0 0' }}>
              {droppedOffDogs.length} of {dropoffPending.length + droppedOffDogs.length} dropped off
            </p>
          )}

        </div>
      )}

    </main>
  )
}

// ---- NotifRow ---------------------------------------------------------------

function NotifRow({ booking, sentKeys, busyKey, onSend, dark }: {
  booking: RunBooking
  sentKeys: string[]
  busyKey: string | null
  onSend: (key: string, message: string) => void
  dark: boolean
}) {
  const borderColor = dark ? 'rgba(255,255,255,0.15)' : '#E8E2D9'

  if (!booking.ownerPhone) {
    return (
      <div style={{ paddingTop: 10, marginTop: 10, borderTop: `1px solid ${borderColor}` }}>
        <p style={{ fontSize: 11, color: dark ? 'rgba(255,255,255,0.4)' : '#8A7E72', margin: 0, fontFamily: FONT }}>No phone on file</p>
      </div>
    )
  }

  return (
    <div style={{ paddingTop: 10, marginTop: 10, borderTop: `1px solid ${borderColor}`, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {NOTIF_BUTTONS.map(btn => {
        const sent = sentKeys.includes(btn.key)
        const isBusy = busyKey === btn.key
        return (
          <button
            key={btn.key}
            onClick={() => !sent && !busyKey && onSend(btn.key, btn.message)}
            disabled={sent || !!busyKey}
            style={{
              fontSize: 11, padding: '4px 8px', borderRadius: 8, border: 'none',
              cursor: (sent || busyKey) ? 'default' : 'pointer',
              backgroundColor: sent ? '#E8F0E5' : '#EEE9E0',
              color: sent ? '#26452B' : '#3B2A1F',
              fontFamily: FONT, fontWeight: sent ? 600 : 400,
            }}
          >
            {isBusy ? '…' : sent ? `✓ ${btn.label}` : btn.label}
          </button>
        )
      })}
    </div>
  )
}
