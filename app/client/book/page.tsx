'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { getUserState, landingRoute, type Dog } from '@/lib/userState'

type HikeDay = { iso: string; weekday: string; label: string; spots: number }
type PickupMethod = 'curbside' | 'home'

const BOOKABLE = new Set(['approved', 'approved_with_conditions'])

export default function BookHike() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [dogs, setDogs] = useState<Dog[]>([])
  const [zoneName, setZoneName] = useState<string | null>(null)

  const [hikeDays, setHikeDays] = useState<HikeDay[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedDogs, setSelectedDogs] = useState<string[]>([])
  const [pickup, setPickup] = useState<PickupMethod | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/'); return }

      const state = await getUserState(session.user.id)
      const dest = landingRoute(state)
      if (dest !== '/client/home') { router.push(dest); return }

      const bookable = state.dogs.filter(d => BOOKABLE.has(d.approval_status ?? ''))
      setDogs(bookable)
      if (bookable.length === 1) setSelectedDogs([bookable[0].id])

      if (state.profile?.zone_id) {
        const { data: zoneRow } = await supabase
          .from('zones').select('name').eq('id', state.profile.zone_id).maybeSingle()
        setZoneName((zoneRow as { name: string } | null)?.name ?? null)
      }

      // Mock hike days: next several Wed/Sat (placeholder until staff calendar exists).
      setHikeDays(nextHikeDays(6))
      setReady(true)
    }
    load()
  }, [router])

  function toggleDog(id: string) {
    setSelectedDogs(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  function proceed() {
    if (!canProceed) return
    const params = new URLSearchParams({
      date: selectedDate!,
      dogs: selectedDogs.join(','),
      pickup: pickup!,
    })
    router.push(`/client/book/payment?${params.toString()}`)
  }

  const canProceed = !!selectedDate && selectedDogs.length > 0 && !!pickup

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

        <button
          onClick={() => router.push('/client/home')}
          className="text-sm text-gray-500 hover:text-gray-700 mb-6"
        >
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
        <div className="space-y-2 mb-7">
          {hikeDays.map(day => {
            const active = selectedDate === day.iso
            const full = day.spots === 0
            return (
              <button
                key={day.iso}
                type="button"
                disabled={full}
                onClick={() => setSelectedDate(day.iso)}
                className={`w-full flex items-center justify-between rounded-xl border-2 px-4 py-3 text-left transition-colors disabled:opacity-40 ${
                  active ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-green-300'
                }`}
              >
                <span>
                  <span className="block text-sm font-medium text-gray-900">{day.weekday}</span>
                  <span className="block text-xs text-gray-500">{day.label}</span>
                </span>
                <span className={`text-xs ${full ? 'text-red-500' : 'text-gray-400'}`}>
                  {full ? 'Full' : `${day.spots} spots`}
                </span>
              </button>
            )
          })}
        </div>

        {/* 2. Dogs */}
        <p className="text-sm font-medium text-gray-700 mb-3">2. Which dog{dogs.length > 1 ? 's' : ''}?</p>
        {dogs.length === 0 ? (
          <p className="text-sm text-gray-400 mb-7">
            No approved dogs to book yet.
          </p>
        ) : (
          <div className="space-y-2 mb-7">
            {dogs.map(dog => {
              const active = selectedDogs.includes(dog.id)
              return (
                <button
                  key={dog.id}
                  type="button"
                  onClick={() => toggleDog(dog.id)}
                  className={`w-full flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-colors ${
                    active ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-green-300'
                  }`}
                >
                  <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${
                    active ? 'border-green-600 bg-green-600 text-white' : 'border-gray-300'
                  }`}>
                    {active && <span className="text-xs">✓</span>}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-gray-900 truncate">{dog.name}</span>
                    {dog.breed && <span className="block text-xs text-gray-500 truncate">{dog.breed}</span>}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {/* 3. Pickup */}
        <p className="text-sm font-medium text-gray-700 mb-3">3. Pickup method</p>
        <div className="space-y-2 mb-8">
          <PickupOption
            active={pickup === 'curbside'}
            onClick={() => setPickup('curbside')}
            title="Curbside"
            desc="You meet the van at the kerb."
          />
          <PickupOption
            active={pickup === 'home'}
            onClick={() => setPickup('home')}
            title="Home pickup"
            desc="The van comes to your door — someone must be present."
          />
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

function PickupOption({ active, onClick, title, desc }: {
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

// Placeholder schedule: the next `count` Wednesdays and Saturdays.
function nextHikeDays(count: number): HikeDay[] {
  const out: HikeDay[] = []
  const targetDows = [3, 6] // Wed, Sat
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 1) // start tomorrow
  let i = 0
  while (out.length < count) {
    if (targetDows.includes(d.getDay())) {
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      out.push({
        iso,
        weekday: d.toLocaleDateString('en-US', { weekday: 'long' }),
        label: d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' }),
        spots: Math.max(0, 8 - ((i * 3) % 9)), // mock availability
      })
      i++
    }
    d.setDate(d.getDate() + 1)
  }
  return out
}
