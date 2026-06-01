'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { getClients, STATUS_LABEL, type ClientRow, type ClientStatus } from '@/lib/adminData'

export default function ClientsList() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [clients, setClients] = useState<ClientRow[]>([])
  const [query, setQuery] = useState('')

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/'); return }

      const { data: profile } = await supabase
        .from('users').select('role').eq('id', session.user.id).maybeSingle()
      if (profile?.role !== 'staff') { router.push('/onboarding'); return }

      setClients(await getClients())
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

  const q = query.trim().toLowerCase()
  const filtered = q
    ? clients.filter(c =>
        (c.name ?? '').toLowerCase().includes(q) ||
        c.dogs.some(d => d.name.toLowerCase().includes(q)) ||
        (c.zoneName ?? '').toLowerCase().includes(q))
    : clients

  return (
    <main className="min-h-screen bg-white px-6 py-10">
      <div className="w-full max-w-sm mx-auto">

        <button
          onClick={() => router.push('/staff')}
          className="text-sm text-gray-500 hover:text-gray-700 mb-6"
        >
          ← Dashboard
        </button>

        <div className="mb-5">
          <h1 className="text-2xl font-semibold text-gray-900">Clients</h1>
          <p className="text-gray-500 mt-1 text-sm">
            {clients.length} client{clients.length !== 1 ? 's' : ''}
          </p>
        </div>

        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by name, dog or zone"
          className="w-full rounded-xl border border-gray-300 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 mb-5"
        />

        {filtered.length === 0 ? (
          <p className="text-sm text-gray-400">No matching clients.</p>
        ) : (
          <div className="space-y-3">
            {filtered.map(c => (
              <button
                key={c.id}
                onClick={() => router.push(`/staff/clients/${c.id}`)}
                className="w-full rounded-2xl border border-gray-200 p-4 text-left hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{c.name ?? 'Unnamed'}</p>
                    {c.phone && <p className="text-xs text-gray-500">{c.phone}</p>}
                  </div>
                  <StatusBadge status={c.status} />
                </div>

                <div className="space-y-1">
                  {c.dogs.length === 0 ? (
                    <p className="text-xs text-gray-400">No dog on file</p>
                  ) : (
                    c.dogs.map(d => (
                      <p key={d.id} className="text-xs text-gray-600">
                        🐕 {d.name}{d.breed ? ` · ${d.breed}` : ''}
                      </p>
                    ))
                  )}
                </div>

                <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                  <span className="text-xs text-gray-500">
                    📍 {c.zoneName ?? <span className="text-gray-400">No zone</span>}
                  </span>
                  <span className="text-xs text-gray-400">Last booking: {c.lastBooking ?? '—'}</span>
                </div>
              </button>
            ))}
          </div>
        )}

      </div>
    </main>
  )
}

function StatusBadge({ status }: { status: ClientStatus }) {
  const cls: Record<ClientStatus, string> = {
    active: 'bg-green-100 text-green-700',
    pending: 'bg-amber-100 text-amber-700',
    incomplete: 'bg-gray-100 text-gray-500',
  }
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium flex-shrink-0 ${cls[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  )
}
