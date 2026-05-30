'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'

type Client = {
  id: string
  name: string | null
  phone: string | null
  address: string | null
  zone_id: string | null
}

type Zone = {
  id: string
  name: string
  description: string | null
}

export default function AssignZone() {
  const router = useRouter()
  const params = useParams<{ userId: string }>()
  const userId = params.userId

  const [ready, setReady] = useState(false)
  const [client, setClient] = useState<Client | null>(null)
  const [zones, setZones] = useState<Zone[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

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

      const { data: clientRow } = await supabase
        .from('users')
        .select('id, name, phone, address, zone_id')
        .eq('id', userId)
        .maybeSingle()
      setClient(clientRow as Client | null)
      setSelected((clientRow as Client | null)?.zone_id ?? null)

      const { data: zoneRows } = await supabase
        .from('zones')
        .select('id, name, description')
        .order('name', { ascending: true })
      setZones((zoneRows ?? []) as Zone[])

      setReady(true)
    }
    load()
  }, [router, userId])

  async function confirm() {
    if (!selected) return
    setSaving(true)
    setError('')
    const { error } = await supabase
      .from('users')
      .update({
        zone_id: selected,
        approved_at: new Date().toISOString(),
      })
      .eq('id', userId)

    if (error) {
      setError(error.message)
      setSaving(false)
      return
    }
    router.push('/staff/approvals')
  }

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
          onClick={() => router.push('/staff/approvals')}
          className="text-sm text-gray-500 hover:text-gray-700 mb-6"
        >
          ← Back to queue
        </button>

        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
            <span className="text-3xl">📍</span>
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">Assign a zone</h1>
          <p className="text-gray-500 mt-1 text-sm">
            Dog approved — now place {client?.name ?? 'this client'} in a hiking zone
          </p>
        </div>

        {/* Client address */}
        <div className="rounded-2xl border border-gray-200 p-4 mb-6">
          <p className="text-xs text-gray-400 mb-1">Client</p>
          <p className="text-sm font-medium text-gray-900">{client?.name ?? 'Unknown'}</p>
          {client?.phone && <p className="text-xs text-gray-500">{client.phone}</p>}
          <p className="text-xs text-gray-400 mt-3 mb-1">Pickup address</p>
          <p className="text-sm text-gray-700 leading-relaxed">
            {client?.address || <span className="text-gray-400">No address on file</span>}
          </p>
        </div>

        {/* Zone picker */}
        <label className="block text-sm font-medium text-gray-700 mb-3">Hiking zone</label>
        {zones.length === 0 ? (
          <p className="text-sm text-gray-400 mb-6">
            No zones configured yet. Add zones in Supabase before assigning.
          </p>
        ) : (
          <div className="space-y-2 mb-6">
            {zones.map(zone => (
              <button
                key={zone.id}
                type="button"
                onClick={() => setSelected(zone.id)}
                className={`w-full text-left rounded-xl border-2 p-3 transition-colors ${
                  selected === zone.id
                    ? 'border-green-500 bg-green-50'
                    : 'border-gray-200 hover:border-green-300'
                }`}
              >
                <span className="block text-sm font-medium text-gray-900">{zone.name}</span>
                {zone.description && (
                  <span className="block text-xs text-gray-500 mt-0.5">{zone.description}</span>
                )}
              </button>
            ))}
          </div>
        )}

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        <button
          onClick={confirm}
          disabled={!selected || saving}
          className="w-full bg-green-600 text-white py-3 rounded-xl font-medium text-sm disabled:opacity-50 hover:bg-green-700 transition-colors"
        >
          {saving ? 'Saving…' : 'Confirm zone & activate client →'}
        </button>

      </div>
    </main>
  )
}
