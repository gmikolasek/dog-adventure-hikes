'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { getClients, getWeeklyMetrics, getUpcomingRuns, type ClientRow, type WeeklyMetrics, type RunDay, type RunBooking } from '@/lib/adminData'
import { exportClientsToExcel } from '@/lib/excelExport'
import { formatShort } from '@/lib/booking'

export default function StaffDashboard() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [staffName, setStaffName] = useState('')
  const [clients, setClients] = useState<ClientRow[]>([])
  const [metrics, setMetrics] = useState<WeeklyMetrics>({ hikesThisWeek: 0, revenueThisWeek: 0, bookingsCount: 0 })
  const [upcomingRuns, setUpcomingRuns] = useState<RunDay[]>([])
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/'); return }

      const { data: profile } = await supabase
        .from('users')
        .select('name, role')
        .eq('id', session.user.id)
        .maybeSingle()
      if (profile?.role !== 'staff') { router.push('/onboarding'); return }
      setStaffName(profile.name ?? '')

      const [clientsData, metricsData, runsData] = await Promise.all([
        getClients(),
        getWeeklyMetrics(),
        getUpcomingRuns(2),
      ])
      setClients(clientsData)
      setMetrics(metricsData)
      setUpcomingRuns(runsData)
      setReady(true)
    }
    load()
  }, [router])

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/')
  }

  async function handleExport() {
    setExporting(true)
    try {
      await exportClientsToExcel(clients)
    } finally {
      setExporting(false)
    }
  }

  if (!ready) {
    return (
      <main className="min-h-screen bg-white flex items-center justify-center px-6">
        <p className="text-sm text-gray-400">Loading…</p>
      </main>
    )
  }

  const pendingDogs = clients.flatMap(c => c.dogs).filter(d => d.approval_status === 'pending').length
  const activeClients = clients.filter(c => c.status === 'active').length

  return (
    <main className="min-h-screen bg-white px-6 py-10">
      <div className="w-full max-w-sm mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100">
              <span className="text-2xl">🥾</span>
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900 leading-tight">
                {staffName ? `Hi, ${staffName}` : 'Staff'}
              </h1>
              <p className="text-gray-500 text-xs">Dog Adventure Hikes · Staff</p>
            </div>
          </div>
          <button onClick={signOut} className="text-xs text-gray-500 hover:text-gray-700">
            Sign out
          </button>
        </div>

        {/* Weekly revenue */}
        <div className="rounded-2xl bg-green-600 text-white p-5 mb-3">
          <p className="text-xs text-green-100">This week&apos;s revenue</p>
          <p className="text-3xl font-semibold mt-1">₮{metrics.revenueThisWeek.toLocaleString()}</p>
          <p className="text-xs text-green-100 mt-1">{metrics.hikesThisWeek} hike{metrics.hikesThisWeek !== 1 ? 's' : ''} · ₮50,000 each</p>
        </div>

        {/* Stat grid */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <Stat value={metrics.bookingsCount} label="Bookings this week" />
          <Stat value={activeClients} label="Active clients" />
          <Stat value={pendingDogs} label="Pending approvals" />
          <Stat value={clients.length} label="Total clients" />
        </div>

        {/* Today's run / upcoming runs */}
        {upcomingRuns.length > 0 && (
          <div className="mb-8 space-y-5">
            {upcomingRuns.map((run, i) => {
              const isToday = run.date === new Date().toISOString().slice(0, 10)
              const label = isToday ? "Today's run" : `Next run · ${formatShort(run.date)}`
              return (
                <div key={run.date}>
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-sm font-semibold text-gray-900">{label}</h2>
                    <button
                      onClick={() => router.push(`/staff/runs/${run.date}`)}
                      className="text-xs text-green-600 hover:text-green-700"
                    >
                      Full view →
                    </button>
                  </div>
                  {run.destination && (
                    <p className="text-xs text-gray-500 mb-2">{run.destination}</p>
                  )}
                  <RunSection run={run} />
                </div>
              )
            })}
          </div>
        )}

        {/* Quick actions */}
        <div className="space-y-2 mb-8">
          <ActionRow
            title="New dog approvals"
            subtitle="Review, approve and assign zones"
            badge={pendingDogs}
            onClick={() => router.push('/staff/approvals')}
          />
          <ActionRow
            title="Calendar"
            subtitle="Open or block hiking days"
            onClick={() => router.push('/staff/calendar')}
          />
          <ActionRow
            title="Client management"
            subtitle="View profiles, change zones"
            onClick={() => router.push('/staff/clients')}
          />
          <ActionRow
            title="Exceptions log"
            subtitle="Cancellations, no-shows, holding fees"
            onClick={() => router.push('/staff/exceptions')}
          />
          <button
            onClick={handleExport}
            disabled={exporting}
            className="w-full flex items-center justify-between rounded-xl border border-gray-200 px-4 py-4 text-left hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <span>
              <span className="block text-sm font-semibold text-gray-900">Export to Excel</span>
              <span className="block text-xs text-gray-500 mt-0.5">Download all client &amp; booking data</span>
            </span>
            <span className="text-gray-400">{exporting ? '…' : '⬇'}</span>
          </button>
        </div>

        {/* Client list */}
        <div>
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Clients</h2>
          {clients.length === 0 ? (
            <p className="text-sm text-gray-400">No clients yet.</p>
          ) : (
            <div className="rounded-2xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
              {clients.map(c => (
                <button
                  key={c.id}
                  onClick={() => router.push(`/staff/clients/${c.id}`)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-gray-900 truncate">
                      {c.name ?? 'Unnamed'}
                    </span>
                    <span className="block text-xs text-gray-500 truncate">
                      {c.dogs.map(d => d.name).join(', ') || 'No dog'}
                      {c.zoneName ? ` · ${c.zoneName}` : ''}
                    </span>
                    <span className="block text-[11px] text-gray-400 mt-0.5">
                      Last booking: {c.lastBooking ?? '—'}
                    </span>
                  </span>
                  <ClientStatusBadge status={c.status} />
                </button>
              ))}
            </div>
          )}
        </div>

      </div>
    </main>
  )
}

function RunSection({ run }: { run: RunDay }) {
  return (
    <div className="rounded-2xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
      {run.bookings.map(b => (
        <RunRow key={b.id} booking={b} />
      ))}
    </div>
  )
}

function RunRow({ booking: b }: { booking: RunBooking }) {
  return (
    <div className="px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900">{b.dogName}</p>
          <p className="text-xs text-gray-600">{b.ownerName ?? '—'}</p>
          {b.ownerAddress && (
            <p className="text-xs text-gray-400 truncate mt-0.5">{b.ownerAddress}</p>
          )}
          {b.zoneName && (
            <p className="text-[11px] text-gray-400 mt-0.5">{b.zoneName}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <MethodBadge method={b.pickupMethod} prefix="Pick" />
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-green-100 text-green-700">
            confirmed
          </span>
        </div>
      </div>
    </div>
  )
}

function MethodBadge({ method, prefix }: { method: 'curbside' | 'home' | null; prefix: string }) {
  if (!method) return null
  const cls = method === 'home' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${cls}`}>
      {prefix}: {method}
    </span>
  )
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-xl border border-gray-200 p-4">
      <p className="text-3xl font-semibold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
    </div>
  )
}

function ActionRow({ title, subtitle, badge, onClick }: {
  title: string; subtitle: string; badge?: number; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between rounded-xl border border-gray-200 px-4 py-4 text-left hover:bg-gray-50 transition-colors"
    >
      <span>
        <span className="block text-sm font-semibold text-gray-900">{title}</span>
        <span className="block text-xs text-gray-500 mt-0.5">{subtitle}</span>
      </span>
      <span className="flex items-center gap-2">
        {badge !== undefined && badge > 0 && (
          <span className="inline-flex items-center justify-center min-w-6 h-6 px-1.5 rounded-full bg-green-600 text-white text-xs font-semibold">
            {badge}
          </span>
        )}
        <span className="text-gray-400">→</span>
      </span>
    </button>
  )
}

export function ClientStatusBadge({ status }: { status: 'active' | 'pending' | 'incomplete' }) {
  const map = {
    active: { label: 'Active', cls: 'bg-green-100 text-green-700' },
    pending: { label: 'Pending', cls: 'bg-amber-100 text-amber-700' },
    incomplete: { label: 'Incomplete', cls: 'bg-gray-100 text-gray-500' },
  }
  const s = map[status]
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium flex-shrink-0 ${s.cls}`}>
      {s.label}
    </span>
  )
}
