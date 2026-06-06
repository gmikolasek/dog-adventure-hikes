'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { getUserState, landingRoute, type Dog } from '@/lib/userState'
import {
  getBookedCounts, spotsLeft, formatShort, todayIso,
  type HikeDay, type Method,
} from '@/lib/booking'

const BOOKABLE = new Set(['approved', 'approved_with_conditions'])

// ─── Design tokens ────────────────────────────────────────────────────────────

const T = {
  bg:         '#F5F0E8',
  forest:     '#26452B',
  moss:       '#4D6B46',
  brown:      '#3B2A1F',
  muted:      '#8A7E72',
  stone:      '#C0B8AE',
  cardBorder: '#E8E2D9',
  selectedBg: '#E8F0E5',
  badgeBg:    '#EEE9E0',
  orange:     '#E08A3E',
  noticeBg:   '#FEF3E2',
  noticeBdr:  '#E6C89A',
  disabledBg: '#F5F5F5',
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

function IconInfo({ size = 13, color = T.orange }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="8" strokeWidth="3" />
      <line x1="12" y1="12" x2="12" y2="16" />
    </svg>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StepLabel({ n, label }: { n: number; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
      <div style={{
        width: 20, height: 20, borderRadius: '50%', backgroundColor: T.forest,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <span style={{ color: '#fff', fontSize: 11, fontWeight: 700, fontFamily: FONT, lineHeight: 1 }}>{n}</span>
      </div>
      <p style={{ color: T.brown, fontWeight: 700, fontSize: 15, fontFamily: FONT, margin: 0 }}>{label}</p>
    </div>
  )
}

function CheckCircle() {
  return (
    <div style={{
      width: 24, height: 24, borderRadius: '50%', backgroundColor: T.forest,
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>
      <IconCheck size={13} color="#fff" />
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BookHike() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [userId, setUserId] = useState('')
  const [dogs, setDogs] = useState<Dog[]>([])
  const [zoneName, setZoneName] = useState<string | null>(null)

  const [hikeDays, setHikeDays] = useState<HikeDay[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [startedDayIds, setStartedDayIds] = useState<Set<string>>(new Set())
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [selectedDogs, setSelectedDogs] = useState<string[]>([])
  const [pickup, setPickup] = useState<Method | null>(null)
  const [dropoff, setDropoff] = useState<Method | null>(null)

  const [bookedDogIds, setBookedDogIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/'); return }

      const state = await getUserState(session.user.id)
      const dest = landingRoute(state)
      if (dest !== '/client/home') { router.push(dest); return }

      setUserId(session.user.id)

      const bookable = state.dogs.filter(d => BOOKABLE.has(d.approval_status ?? ''))
      setDogs(bookable)
      if (bookable.length === 1) setSelectedDogs([bookable[0].id])

      const zoneId = state.profile?.zone_id
      if (zoneId) {
        const { data: zoneRow } = await supabase
          .from('zones').select('name').eq('id', zoneId).maybeSingle()
        setZoneName((zoneRow as { name: string } | null)?.name ?? null)

        const { data: dayRows } = await supabase
          .from('hike_days')
          .select('*')
          .eq('status', 'open')
          .gte('date', todayIso())
          .contains('zones', [zoneId])
          .order('date', { ascending: true })
        setHikeDays((dayRows ?? []) as HikeDay[])
        setCounts(await getBookedCounts())

        const { data: startedRows } = await supabase.rpc('hike_day_started_ids')
        setStartedDayIds(new Set(((startedRows ?? []) as { hike_day_id: string }[]).map(r => r.hike_day_id)))
      }

      setReady(true)
    }
    load()
  }, [router])

  useEffect(() => {
    if (selectedDay && startedDayIds.has(selectedDay)) setSelectedDay(null)
  }, [selectedDay, startedDayIds])

  useEffect(() => {
    if (!selectedDay || !userId) {
      setBookedDogIds(new Set())
      return
    }
    async function fetchBooked() {
      const { data } = await supabase
        .from('bookings')
        .select('dog_id')
        .eq('hike_day_id', selectedDay)
        .eq('owner_id', userId)
        .eq('status', 'confirmed')
      const booked = new Set((data ?? []).map((b: { dog_id: string }) => b.dog_id))
      setBookedDogIds(booked)
      setSelectedDogs(prev => prev.filter(id => !booked.has(id)))
    }
    fetchBooked()
  }, [selectedDay, userId])

  function toggleDog(id: string) {
    if (bookedDogIds.has(id)) return
    setSelectedDogs(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function proceed() {
    if (!canProceed) return
    const params = new URLSearchParams({
      day: selectedDay!,
      dogs: selectedDogs.join(','),
      pickup: pickup!,
      dropoff: dropoff!,
    })
    router.push(`/client/book/payment?${params.toString()}`)
  }

  const canProceed = !!selectedDay
    && selectedDogs.length > 0
    && !!pickup
    && !!dropoff

  if (!ready) {
    return (
      <main style={{ backgroundColor: T.bg, fontFamily: FONT }} className="min-h-screen flex items-center justify-center px-6">
        <p style={{ color: T.muted, fontSize: 14 }}>Loading…</p>
      </main>
    )
  }

  const hasClosedDays = hikeDays.some(d => startedDayIds.has(d.id))

  return (
    <main style={{ backgroundColor: T.bg, fontFamily: FONT }} className="min-h-screen pb-12">
      <div className="w-full max-w-sm mx-auto px-5">

        {/* ── Header ── */}
        <div className="flex items-center justify-between pt-12 pb-6">
          <button
            onClick={() => router.push('/client/home')}
            style={{ backgroundColor: T.cardBorder, borderRadius: '50%', width: 36, height: 36, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer', flexShrink: 0 }}
          >
            <IconArrowLeft size={16} color={T.forest} />
          </button>
          <div style={{ width: 36 }} />
        </div>

        {/* ── Title ── */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ color: T.brown, fontWeight: 700, fontSize: 26, fontFamily: FONT, lineHeight: 1.2, marginBottom: 4 }}>
            Book a Hike
          </h1>
          <p style={{ color: T.muted, fontSize: 14, fontFamily: FONT }}>
            {zoneName ? `Hiking in ${zoneName}` : 'Choose a day for your adventure'}
          </p>
        </div>

        {/* ── Step 1: Date ── */}
        <div style={{ marginBottom: 24 }}>
          <StepLabel n={1} label="Pick a day" />

          {hikeDays.length === 0 ? (
            <div style={{ backgroundColor: '#fff', border: `1px solid ${T.cardBorder}`, borderRadius: 12, padding: '24px 20px', textAlign: 'center', marginBottom: 8 }}>
              <p style={{ color: T.muted, fontSize: 14, fontFamily: FONT, marginBottom: 4 }}>No hikes scheduled in your zone yet.</p>
              <p style={{ color: T.stone, fontSize: 13, fontFamily: FONT }}>Check back soon — new days open weekly.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {hikeDays.map(day => {
                const left = spotsLeft(day, counts)
                const full = left === 0 && !day.allow_over_capacity
                const started = startedDayIds.has(day.id)
                const disabled = full || started
                const active = selectedDay === day.id
                return (
                  <button
                    key={day.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => setSelectedDay(day.id)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '14px 16px', borderRadius: 12, textAlign: 'left', cursor: disabled ? 'default' : 'pointer',
                      backgroundColor: started ? T.disabledBg : active ? T.selectedBg : '#fff',
                      border: active ? `2px solid ${T.forest}` : `1px solid ${T.cardBorder}`,
                      opacity: full ? 0.5 : 1,
                    }}
                  >
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontWeight: 700, fontSize: 15, fontFamily: FONT, color: started ? T.stone : T.brown }}>
                        {formatShort(day.date)}
                      </span>
                      {day.destination_override && (
                        <span style={{ display: 'block', fontSize: 13, fontFamily: FONT, color: T.muted, marginTop: 2 }}>
                          {day.destination_override}
                        </span>
                      )}
                      {day.client_note && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3 }}>
                          <IconInfo size={13} color={T.orange} />
                          <span style={{ fontSize: 12, fontFamily: FONT, color: T.orange }}>{day.client_note}</span>
                        </span>
                      )}
                    </span>
                    <span style={{ flexShrink: 0, marginLeft: 10 }}>
                      {started ? (
                        <span style={{ backgroundColor: T.badgeBg, color: T.muted, borderRadius: 20, padding: '2px 10px', fontSize: 12, fontFamily: FONT, fontWeight: 500 }}>
                          Closed
                        </span>
                      ) : (
                        <span style={{ fontSize: 13, fontFamily: FONT, color: full ? '#C1562D' : T.moss }}>
                          {full ? 'Full' : `${left} spot${left !== 1 ? 's' : ''}`}
                        </span>
                      )}
                    </span>
                  </button>
                )
              })}

              {hasClosedDays && (
                <div style={{ backgroundColor: T.noticeBg, border: `1px solid ${T.noticeBdr}`, borderRadius: 10, padding: '10px 14px', display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 4 }}>
                  <IconInfo size={14} color={T.orange} />
                  <p style={{ color: T.orange, fontSize: 13, fontFamily: FONT, lineHeight: 1.5, margin: 0 }}>
                    Today&apos;s hike is already underway. Call us — there may still be room if you can meet the van.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Step 2: Dogs ── */}
        <div style={{ marginBottom: 24 }}>
          <StepLabel n={2} label={`Which dog${dogs.length > 1 ? 's' : ''}?`} />

          {dogs.length === 0 ? (
            <p style={{ color: T.muted, fontSize: 14, fontFamily: FONT }}>No approved dogs to book yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {dogs.map(dog => {
                const alreadyBooked = bookedDogIds.has(dog.id)
                const active = selectedDogs.includes(dog.id)
                return (
                  <button
                    key={dog.id}
                    type="button"
                    disabled={alreadyBooked}
                    onClick={() => toggleDog(dog.id)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                      padding: '12px 14px', borderRadius: 12, textAlign: 'left',
                      cursor: alreadyBooked ? 'default' : 'pointer',
                      backgroundColor: active && !alreadyBooked ? T.selectedBg : '#fff',
                      border: active && !alreadyBooked ? `2px solid ${T.forest}` : `1px solid ${T.cardBorder}`,
                      opacity: alreadyBooked ? 0.5 : 1,
                    }}
                  >
                    {/* Checkbox */}
                    {active && !alreadyBooked ? (
                      <CheckCircle />
                    ) : (
                      <div style={{ width: 24, height: 24, borderRadius: '50%', border: `2px solid ${T.cardBorder}`, backgroundColor: '#fff', flexShrink: 0 }} />
                    )}

                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: 'block', fontWeight: 700, fontSize: 14, fontFamily: FONT, color: T.brown }}>{dog.name}</span>
                      {dog.breed && (
                        <span style={{ display: 'block', fontSize: 13, fontFamily: FONT, color: T.muted, marginTop: 1 }}>{dog.breed}</span>
                      )}
                    </span>

                    {alreadyBooked && (
                      <span style={{ fontSize: 12, fontFamily: FONT, color: T.stone, flexShrink: 0 }}>Already booked</span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Step 3: Pickup ── */}
        <div style={{ marginBottom: 24 }}>
          <StepLabel n={3} label="Pickup method" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <MethodCard active={pickup === 'curbside'} onClick={() => setPickup('curbside')}
              title="Curbside" desc="You meet the van at the kerb." />
            <MethodCard active={pickup === 'home'} onClick={() => setPickup('home')}
              title="Home pickup" desc="The van comes to your door — someone must be present." />
          </div>
        </div>

        {/* ── Step 4: Dropoff ── */}
        <div style={{ marginBottom: 32 }}>
          <StepLabel n={4} label="Drop-off method" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <MethodCard active={dropoff === 'curbside'} onClick={() => setDropoff('curbside')}
              title="Curbside" desc="Meet the van at the kerb on return." />
            <MethodCard active={dropoff === 'home'} onClick={() => setDropoff('home')}
              title="Home drop-off" desc="The van returns your dog to your door." />
          </div>
        </div>

        {/* ── Proceed button ── */}
        <button
          onClick={proceed}
          disabled={!canProceed}
          style={{
            width: '100%', padding: '15px 0', borderRadius: 12, border: 'none',
            backgroundColor: canProceed ? T.forest : T.stone,
            color: '#fff', fontFamily: FONT, fontWeight: 600, fontSize: 15,
            cursor: canProceed ? 'pointer' : 'default',
          }}
        >
          Proceed to payment →
        </button>

      </div>
    </main>
  )
}

// ─── Method card ──────────────────────────────────────────────────────────────

function MethodCard({ active, onClick, title, desc }: {
  active: boolean; onClick: () => void; title: string; desc: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 14px', borderRadius: 12, textAlign: 'left', cursor: 'pointer',
        backgroundColor: active ? T.selectedBg : '#fff',
        border: active ? `2px solid ${T.forest}` : `1px solid ${T.cardBorder}`,
      }}
    >
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: 'block', fontWeight: 700, fontSize: 14, fontFamily: FONT, color: T.brown }}>{title}</span>
        <span style={{ display: 'block', fontSize: 13, fontFamily: FONT, color: T.muted, marginTop: 2 }}>{desc}</span>
      </span>
      {active && <CheckCircle />}
    </button>
  )
}
