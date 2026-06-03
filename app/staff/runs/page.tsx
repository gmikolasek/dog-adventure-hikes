'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { getUpcomingRunSummaries, type RunSummary } from '@/lib/adminData'
import { formatFull } from '@/lib/booking'

export default function RunsPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [runs, setRuns] = useState<RunSummary[]>([])

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

      setRuns(await getUpcomingRunSummaries())
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

  const today = new Date().toISOString().slice(0, 10)

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
            <span className="text-xl">🗓</span>
          </div>
          <h1 className="text-lg font-semibold text-gray-900">Upcoming runs</h1>
        </div>

        {runs.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 px-6 py-10 text-center">
            <p className="text-sm text-gray-400">No upcoming hike days scheduled.</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
            {runs.map(run => {
              const isToday = run.date === today
              const formattedDate = (() => {
                try { return formatFull(run.date) } catch { return run.date }
              })()
              return (
                <button
                  key={run.date}
                  onClick={() => router.push(`/staff/runs/${run.date}`)}
                  className="w-full flex items-center justify-between px-4 py-4 text-left hover:bg-gray-50 transition-colors"
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="block text-sm font-semibold text-gray-900 truncate">{formattedDate}</span>
                      {isToday && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-green-100 text-green-700 flex-shrink-0">
                          Today
                        </span>
                      )}
                    </span>
                    {run.destination && (
                      <span className="block text-xs text-gray-500 mt-0.5 truncate">{run.destination}</span>
                    )}
                    <span className="block text-xs text-gray-400 mt-0.5">
                      {run.dogCount} dog{run.dogCount !== 1 ? 's' : ''} confirmed
                    </span>
                  </span>
                  <span className="text-gray-400 flex-shrink-0 ml-3">→</span>
                </button>
              )
            })}
          </div>
        )}

      </div>
    </main>
  )
}
