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

  // Dog IDs that already have a confirmed booking on the selected hike day.
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

  // If a selected day's hike starts mid-session, clear the selection.
  useEffect(() => {
    if (selectedDay && startedDayIds.has(selectedDay)) setSelectedDay(null)
  }, [selectedDay, startedDayIds])

  // When the selected day changes, fetch which of the client's dogs are already
  // confirmed for that day, and remove them from the selection.
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
      // Drop any already-selected dogs that are now blocked.
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
      <main className="min-h-screen bg-white flex items-center justify-center px-6">
        <p className="text-sm text-gray-400">Loading…</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-white px-6 py-10">
      <div className="w-full max-w-sm mx-auto">

        <button onClick={() => router.push('/client/home')} className="text-sm text-gray-500 hover:text-gray-700 mb-6">
          ← Home
        </button>

        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">Book a hike</h1>
          <p className="text-gray-500 mt-1 text-sm">
            {zoneName ? `Hiking in ${zoneName}` : 'Choose a day for your adventure'}
          </p>
        </div>

        {/* 1. Date */}
        <p className="text-sm font-medium text-gray-700 mb-3">1. Pick a day</p>
        {hikeDays.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 p-6 text-center mb-7">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-50 mb-3">
              <span className="text-2xl">🗓️</span>
            </div>
            <p className="text-sm text-gray-500">No hikes scheduled in your zone yet.</p>
            <p className="text-xs text-gray-400 mt-1">Check back soon — new days open weekly.</p>
          </div>
        ) : (
          <>
          <div className="space-y-2">
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
                  className={`w-full flex items-center justify-between rounded-xl border-2 px-4 py-3 text-left transition-colors disabled:opacity-40 ${
                    active ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-green-300'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-gray-900">{formatShort(day.date)}</span>
                    {day.destination_override && (
                      <span className="block text-xs text-gray-500 truncate">{day.destination_override}</span>
                    )}
                    {day.client_note && (
                      <span className="block text-[11px] text-amber-700 truncate">ⓘ {day.client_note}</span>
                    )}
                  </span>
                  <span className={`text-xs flex-shrink-0 ml-2 ${full ? 'text-red-500' : 'text-gray-400'}`}>
                    {started ? 'Closed' : full ? 'Full' : `${left} spot${left !== 1 ? 's' : ''}`}
                  </span>
                </button>
              )
            })}
          </div>
          {hikeDays.some(d => startedDayIds.has(d.id)) && (
            <p className="text-xs text-amber-700 mt-2">
              Bookings for dates marked &ldquo;Closed&rdquo; are no longer available. Contact us directly if you&apos;d like to join a future hike.
            </p>
          )}
          <div className="mb-7" />
          </>
        )}

        {/* 2. Dogs */}
        <p className="text-sm font-medium text-gray-700 mb-3">2. Which dog{dogs.length > 1 ? 's' : ''}?</p>
        {dogs.length === 0 ? (
          <p className="text-sm text-gray-400 mb-7">No approved dogs to book yet.</p>
        ) : (
          <div className="space-y-2 mb-7">
            {dogs.map(dog => {
              const alreadyBooked = bookedDogIds.has(dog.id)
              const active = selectedDogs.includes(dog.id)
              return (
                <button
                  key={dog.id}
                  type="button"
                  disabled={alreadyBooked}
                  onClick={() => toggleDog(dog.id)}
                  className={`w-full flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-colors ${
                    alreadyBooked
                      ? 'border-gray-200 opacity-50 cursor-not-allowed'
                      : active
                        ? 'border-green-500 bg-green-50'
                        : 'border-gray-200 hover:border-green-300'
                  }`}
                >
                  <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${
                    alreadyBooked
                      ? 'border-gray-300 bg-gray-100'
                      : active
                        ? 'border-green-600 bg-green-600 text-white'
                        : 'border-gray-300'
                  }`}>
                    {active && !alreadyBooked && <span className="text-xs">✓</span>}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-gray-900 truncate">{dog.name}</span>
                    {dog.breed && <span className="block text-xs text-gray-500 truncate">{dog.breed}</span>}
                  </span>
                  {alreadyBooked && (
                    <span className="text-xs text-gray-400 flex-shrink-0">Already booked</span>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {/* 3. Pickup */}
        <p className="text-sm font-medium text-gray-700 mb-3">3. Pickup method</p>
        <div className="space-y-2 mb-7">
          <MethodOption active={pickup === 'curbside'} onClick={() => setPickup('curbside')}
            title="Curbside" desc="You meet the van at the kerb." />
          <MethodOption active={pickup === 'home'} onClick={() => setPickup('home')}
            title="Home pickup" desc="The van comes to your door — someone must be present." />
        </div>

        {/* 4. Dropoff */}
        <p className="text-sm font-medium text-gray-700 mb-3">4. Drop-off method</p>
        <div className="space-y-2 mb-8">
          <MethodOption active={dropoff === 'curbside'} onClick={() => setDropoff('curbside')}
            title="Curbside" desc="Meet the van at the kerb on return." />
          <MethodOption active={dropoff === 'home'} onClick={() => setDropoff('home')}
            title="Home drop-off" desc="The van returns your dog to your door." />
        </div>

        <button
          onClick={proceed}
          disabled={!canProceed}
          className="w-full bg-green-600 text-white py-3.5 rounded-xl font-medium text-sm disabled:opacity-50 hover:bg-green-700 transition-colors"
        >
          Proceed to payment →
        </button>

      </div>
    </main>
  )
}

function MethodOption({ active, onClick, title, desc }: {
  active: boolean; onClick: () => void; title: string; desc: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-xl border-2 px-4 py-3 transition-colors ${
        active ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-green-300'
      }`}
    >
      <span className="block text-sm font-medium text-gray-900">{title}</span>
      <span className="block text-xs text-gray-500 mt-0.5">{desc}</span>
    </button>
  )
}
