'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { getWeeklyRevenue, type WeeklyRevenueData } from '@/lib/adminData'
import { formatShort } from '@/lib/booking'

export default function RevenuePage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [data, setData] = useState<WeeklyRevenueData | null>(null)

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

      setData(await getWeeklyRevenue())
      setReady(true)
    }
    load()
  }, [router])

  if (!ready) {
    return (
      <main className="min-h-screen bg-white flex items-center justify-center px-6">
        <p className="text-sm text-gray-400">Loading…</p>
      </main>
    )
  }

  const d = data!
  const weekLabel = `${formatShort(d.weekMon)} – ${formatShort(d.weekSun)}`

  return (
    <main className="min-h-screen bg-white px-6 py-10">
      <div className="w-full max-w-sm mx-auto">

        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => router.push('/staff')}
            className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 text-lg leading-none"
          >
            ←
          </button>
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-green-100">
            <span className="text-xl">💰</span>
          </div>
          <h1 className="text-lg font-semibold text-gray-900">Revenue</h1>
        </div>

        {/* Weekly total hero */}
        <div className="rounded-2xl bg-green-600 text-white p-5 mb-6">
          <p className="text-xs text-green-100">This week&apos;s revenue</p>
          <p className="text-3xl font-semibold mt-1">₮{d.totalRevenue.toLocaleString()}</p>
          <p className="text-xs text-green-100 mt-1">{weekLabel}</p>
        </div>

        {/* Confirmed bookings this week */}
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">
            Bookings this week
            {d.bookings.length > 0 && (
              <span className="ml-2 text-xs font-normal text-gray-400">{d.bookings.length} total</span>
            )}
          </h2>
          {d.bookings.length === 0 ? (
            <p className="text-sm text-gray-400">No confirmed bookings this week.</p>
          ) : (
            <div className="rounded-2xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
              {d.bookings.map(b => (
                <div key={b.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900">{b.dogName}</p>
                      <p className="text-xs text-gray-500">{b.ownerName ?? '—'}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {formatShort(b.hikeDate)}
                        {b.pickupMethod && (
                          <span className="ml-2 text-gray-400">· {b.pickupMethod}</span>
                        )}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-gray-900 flex-shrink-0">
                      ₮{b.amountCharged.toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Trail Pack holders */}
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">
            Trail Pack holders
            {d.trailPackHolders.length > 0 && (
              <span className="ml-2 text-xs font-normal text-gray-400">{d.trailPackHolders.length} active</span>
            )}
          </h2>
          {d.trailPackHolders.length === 0 ? (
            <p className="text-sm text-gray-400">No active Trail Pack credits.</p>
          ) : (
            <div className="rounded-2xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
              {d.trailPackHolders.map(tp => (
                <div key={tp.id} className="px-4 py-3 flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">{tp.ownerName ?? '—'}</p>
                    {tp.expiresAt && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        Expires {formatShort(tp.expiresAt.slice(0, 10))}
                      </p>
                    )}
                  </div>
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700 flex-shrink-0 ml-3">
                    {tp.creditsRemaining} credit{tp.creditsRemaining !== 1 ? 's' : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Exceptions this week */}
        <section>
          <h2 className="text-sm font-semibold text-gray-900 mb-3">
            Exceptions this week
            {d.exceptions.length > 0 && (
              <span className="ml-2 text-xs font-normal text-gray-400">{d.exceptions.length} total</span>
            )}
          </h2>
          {d.exceptions.length === 0 ? (
            <p className="text-sm text-gray-400">No cancellations or no-shows this week.</p>
          ) : (
            <div className="rounded-2xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
              {d.exceptions.map(ex => (
                <div key={ex.id} className="px-4 py-3 flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900">{ex.dogName}</p>
                    <p className="text-xs text-gray-500">{ex.ownerName ?? '—'}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{formatShort(ex.hikeDate)}</p>
                  </div>
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium flex-shrink-0 ${
                    ex.status === 'no_show' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {ex.status === 'no_show' ? 'No-show' : 'Cancelled'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

      </div>
    </main>
  )
}
