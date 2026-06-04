'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { getUserState, landingRoute, type Dog, type Profile } from '@/lib/userState'
import { formatShort, todayIso } from '@/lib/booking'

type Zone = { name: string; description: string | null }
type BookingCard = {
  id: string
  date: string
  destination: string | null
  dogName: string
  pickup: string | null
  dropoff: string | null
  status: string
}

export default function ClientHome() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [dogs, setDogs] = useState<Dog[]>([])
  const [zone, setZone] = useState<Zone | null>(null)
  const [upcoming, setUpcoming] = useState<BookingCard[]>([])
  const [past, setPast] = useState<BookingCard[]>([])

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/'); return }

      const state = await getUserState(session.user.id)
      const dest = landingRoute(state)
      if (dest !== '/client/home') { router.push(dest); return }

      setProfile(state.profile)
      setDogs(state.dogs)

      if (state.profile?.zone_id) {
        const { data: zoneRow } = await supabase
          .from('zones')
          .select('name, description')
          .eq('id', state.profile.zone_id)
          .maybeSingle()
        setZone(zoneRow as Zone | null)
      }

      // All bookings (confirmed + cancelled + no_show) for this owner.
      const { data: bookingRows } = await supabase
        .from('bookings')
        .select('id, dog_id, hike_day_id, pickup_method, dropoff_method, status')
        .eq('owner_id', session.user.id)
        .in('status', ['confirmed', 'cancelled', 'no_show'])

      const bookings = bookingRows ?? []
      if (bookings.length) {
        const dayIds = [...new Set(bookings.map(b => b.hike_day_id))]
        const { data: dayRows } = await supabase
          .from('hike_days')
          .select('id, date, destination_override')
          .in('id', dayIds)

        const dayById: Record<string, { date: string; destination_override: string | null }> = {}
        for (const d of dayRows ?? []) dayById[d.id] = d

        const dogNameById: Record<string, string> = {}
        for (const dog of state.dogs) dogNameById[dog.id] = dog.name

        const today = todayIso()
        const upcomingList: BookingCard[] = []
        const pastList: BookingCard[] = []

        for (const b of bookings) {
          const day = dayById[b.hike_day_id]
          if (!day) continue
          const card: BookingCard = {
            id: b.id,
            date: day.date,
            destination: day.destination_override,
            dogName: dogNameById[b.dog_id] ?? 'Your dog',
            pickup: b.pickup_method,
            dropoff: b.dropoff_method,
            status: b.status,
          }
          if (b.status === 'confirmed' && day.date >= today) {
            upcomingList.push(card)
          } else {
            pastList.push(card)
          }
        }

        upcomingList.sort((a, b) => a.date.localeCompare(b.date))
        pastList.sort((a, b) => b.date.localeCompare(a.date)) // newest first
        setUpcoming(upcomingList)
        setPast(pastList)
      }

      setReady(true)
    }
    load()
  }, [router])

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/')
  }

  if (!ready) {
    return (
      <main className="min-h-screen bg-white flex items-center justify-center px-6">
        <p className="text-sm text-gray-400">Loading…</p>
      </main>
    )
  }

  const primary = dogs[0]
  const firstName = profile?.name?.split(' ')[0] ?? ''

  return (
    <main className="min-h-screen bg-white px-6 py-10">
      <div className="w-full max-w-sm mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <span className="text-xl">🐾</span>
            <span className="text-sm font-semibold text-gray-900">Dog Adventure Hikes</span>
          </div>
          <button onClick={signOut} className="text-xs text-gray-500 hover:text-gray-700">
            Sign out
          </button>
        </div>

        {/* Hero: primary dog */}
        {primary && (
          <div className="rounded-2xl border border-gray-200 p-5 mb-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push('/client/profile')}
                className="relative flex-shrink-0"
                aria-label="Update dog photo"
              >
                <DogAvatar dog={primary} size={64} />
                <div className="absolute bottom-0 right-0 w-5 h-5 bg-green-600 rounded-full flex items-center justify-center text-white shadow-sm" style={{ fontSize: 10 }}>
                  📷
                </div>
              </button>
              <div className="min-w-0">
                <p className="text-xs text-gray-400">
                  {firstName ? `Welcome back, ${firstName}` : 'Welcome back'}
                </p>
                <h1 className="text-xl font-semibold text-gray-900 truncate">{primary.name}</h1>
                {primary.breed && <p className="text-xs text-gray-500 truncate">{primary.breed}</p>}
              </div>
            </div>
            <div className="mt-4">
              <StatusBadge status={primary.approval_status} />
              {primary.approval_status === 'approved_with_conditions' && primary.approval_conditions && (
                <p className="text-xs text-gray-600 leading-relaxed mt-2 bg-amber-50 border border-amber-100 rounded-lg p-3">
                  <span className="font-medium text-amber-700">Conditions: </span>
                  {primary.approval_conditions}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Other dogs */}
        {dogs.length > 1 && (
          <div className="rounded-2xl border border-gray-200 p-4 mb-4">
            <p className="text-xs text-gray-400 mb-3">Your other dogs</p>
            <div className="space-y-3">
              {dogs.slice(1).map(dog => (
                <div key={dog.id} className="flex items-center gap-3">
                  <DogAvatar dog={dog} size={36} />
                  <span className="text-sm font-medium text-gray-800 flex-1 truncate">{dog.name}</span>
                  <StatusBadge status={dog.approval_status} small />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Zone */}
        <div className="rounded-2xl border border-gray-200 p-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-green-100 flex-shrink-0">
              <span className="text-lg">📍</span>
            </div>
            <div className="min-w-0">
              <p className="text-xs text-gray-400">Your hiking zone</p>
              <p className="text-sm font-semibold text-gray-900 truncate">
                {zone?.name ?? 'Not assigned'}
              </p>
              {zone?.description && (
                <p className="text-xs text-gray-500 truncate">{zone.description}</p>
              )}
            </div>
          </div>
        </div>

        {/* Book a hike */}
        <button
          onClick={() => router.push('/client/book')}
          className="w-full bg-green-600 text-white py-3.5 rounded-xl font-medium text-sm hover:bg-green-700 transition-colors mb-8"
        >
          Book a hike →
        </button>

        {/* Upcoming bookings */}
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Upcoming hikes</h2>
          {upcoming.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 p-6 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-50 mb-3">
                <span className="text-2xl">🗓️</span>
              </div>
              <p className="text-sm text-gray-500">No upcoming hikes yet.</p>
              <p className="text-xs text-gray-400 mt-1">Book your first adventure above.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {upcoming.map(u => (
                <button
                  key={u.id}
                  onClick={() => router.push(`/client/bookings/${u.id}`)}
                  className="w-full rounded-2xl border border-gray-200 p-4 text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-gray-900">{formatShort(u.date)}</p>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-green-100 text-green-700">
                        Confirmed
                      </span>
                      <span className="text-gray-400 text-xs">→</span>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    🐕 {u.dogName}{u.destination ? ` · ${u.destination}` : ''}
                  </p>
                  {(u.pickup || u.dropoff) && (
                    <p className="text-[11px] text-gray-400 mt-1 capitalize">
                      {u.pickup} pickup · {u.dropoff} drop-off
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Past and cancelled */}
        {past.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Past and cancelled</h2>
            <div className="space-y-2">
              {past.map(u => (
                <button
                  key={u.id}
                  onClick={() => router.push(`/client/bookings/${u.id}`)}
                  className="w-full rounded-2xl border border-gray-200 p-4 text-left hover:bg-gray-50 transition-colors opacity-70"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-gray-700">{formatShort(u.date)}</p>
                    <div className="flex items-center gap-2">
                      <PastStatusBadge status={u.status} />
                      <span className="text-gray-400 text-xs">→</span>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    🐕 {u.dogName}{u.destination ? ` · ${u.destination}` : ''}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

      </div>
    </main>
  )
}

function PastStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    confirmed: 'bg-gray-100 text-gray-500',
    cancelled: 'bg-red-100 text-red-600',
    no_show: 'bg-red-100 text-red-600',
  }
  const label: Record<string, string> = {
    confirmed: 'Completed',
    cancelled: 'Cancelled',
    no_show: 'No-show',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${map[status] ?? 'bg-gray-100 text-gray-500'}`}>
      {label[status] ?? status}
    </span>
  )
}

function DogAvatar({ dog, size }: { dog: Dog; size: number }) {
  if (dog.photo_url) {
    return (
      <div
        className="rounded-full bg-gray-100 bg-cover bg-center flex-shrink-0"
        style={{ width: size, height: size, backgroundImage: `url(${dog.photo_url})` }}
        role="img"
        aria-label={dog.name}
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

function StatusBadge({ status, small }: { status: string | null; small?: boolean }) {
  const map: Record<string, { label: string; cls: string }> = {
    approved: { label: 'Approved', cls: 'bg-green-100 text-green-700' },
    approved_with_conditions: { label: 'Approved · conditions', cls: 'bg-amber-100 text-amber-700' },
    pending: { label: 'Pending review', cls: 'bg-gray-100 text-gray-600' },
    declined: { label: 'Declined', cls: 'bg-red-100 text-red-700' },
  }
  const s = map[status ?? ''] ?? { label: status ?? 'Unknown', cls: 'bg-gray-100 text-gray-600' }
  return (
    <span className={`inline-flex items-center px-2.5 ${small ? 'py-0.5 text-[11px]' : 'py-1 text-xs'} rounded-full font-medium ${s.cls}`}>
      {s.label}
    </span>
  )
}
