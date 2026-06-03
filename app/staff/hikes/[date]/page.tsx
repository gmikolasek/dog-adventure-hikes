'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import { getHikeForDate, type HikeDetail, type HikeBooking } from '@/lib/adminData'
import { formatFull } from '@/lib/booking'

export default function HikeDetailPage() {
  const router = useRouter()
  const params = useParams()
  const date = params.date as string

  const [ready, setReady] = useState(false)
  const [hike, setHike] = useState<HikeDetail | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/'); return }

      const { data: profile } = await supabase
        .from('users')
        .select('role')
        .eq('id', session.user.id)
        .maybeSingle()
      if (profile?.role !== 'staff') { router.push('/onboarding'); return }

      const hikeData = await getHikeForDate(date)
      setHike(hikeData)
      setReady(true)
    }
    load()
  }, [router, date])

  if (!ready) {
    return (
      <main className="min-h-screen bg-white flex items-center justify-center px-6">
        <p className="text-sm text-gray-400">Loading…</p>
      </main>
    )
  }

  const formattedDate = (() => {
    try { return formatFull(date) } catch { return date }
  })()

  return (
    <main className="min-h-screen bg-white px-6 py-10">
      <div className="w-full max-w-sm mx-auto">

        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => router.push('/staff/hikes')}
            className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 text-lg leading-none"
          >
            ←
          </button>
          <div>
            <h1 className="text-lg font-semibold text-gray-900 leading-tight">Hike · {formattedDate}</h1>
            {hike?.destination && (
              <p className="text-xs text-gray-500 mt-0.5">{hike.destination}</p>
            )}
          </div>
        </div>

        {!hike || hike.bookings.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 px-6 py-10 text-center">
            <p className="text-sm text-gray-400">No confirmed bookings for this date.</p>
          </div>
        ) : (
          <>
            {/* Summary bar */}
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-gray-500">
                {hike.bookings.length} dog{hike.bookings.length !== 1 ? 's' : ''} confirmed
              </p>
              <p className="text-xs text-gray-400">Sorted by zone</p>
            </div>

            {/* Map placeholder */}
            <button
              disabled
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 py-3 mb-4 text-sm text-gray-400 cursor-not-allowed"
            >
              <span>📍</span>
              <span>View pickup map</span>
              <span className="text-[11px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded ml-1">coming soon</span>
            </button>

            {/* Booking list */}
            <div className="rounded-2xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
              {hike.bookings.map((b, i) => (
                <BookingDetailRow key={b.id} booking={b} index={i + 1} />
              ))}
            </div>
          </>
        )}

      </div>
    </main>
  )
}

function BookingDetailRow({ booking: b, index }: { booking: HikeBooking; index: number }) {
  return (
    <div className="px-4 py-4">
      <div className="flex items-start gap-3">
        <div className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-green-600 text-white text-xs font-semibold flex-shrink-0 mt-0.5">
          {index}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">{b.dogName}</p>
          <p className="text-xs text-gray-700 mt-0.5">{b.ownerName ?? '—'}</p>
          {b.ownerPhone && (
            <p className="text-xs text-gray-500">{b.ownerPhone}</p>
          )}
          {b.ownerAddress && (
            <p className="text-xs text-gray-500 mt-0.5">{b.ownerAddress}</p>
          )}
          {b.zoneName && (
            <p className="text-[11px] text-gray-400 mt-1">{b.zoneName}</p>
          )}

          <div className="flex flex-wrap gap-1.5 mt-2">
            {b.pickupMethod && (
              <MethodChip label="Pickup" method={b.pickupMethod} />
            )}
            {b.dropoffMethod && (
              <MethodChip label="Drop-off" method={b.dropoffMethod} />
            )}
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-green-100 text-green-700">
              confirmed
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

function MethodChip({ label, method }: { label: string; method: 'curbside' | 'home' }) {
  const cls = method === 'home' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${cls}`}>
      {label}: {method}
    </span>
  )
}
