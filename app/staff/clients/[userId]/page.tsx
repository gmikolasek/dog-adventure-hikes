'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'

type Profile = {
  id: string
  name: string | null
  phone: string | null
  address: string | null
  language: string | null
  approved_at: string | null
  zone_id: string | null
  training_interest: boolean | null
  created_at: string | null
}

type Dog = {
  id: string
  name: string
  breed: string | null
  age_years: number | null
  weight_kg: number | null
  sex: string | null
  approval_status: string | null
  approval_conditions: string | null
}

type Zone = { id: string; name: string; description: string | null }

export default function ClientDetail() {
  const router = useRouter()
  const params = useParams<{ userId: string }>()
  const userId = params.userId

  const [ready, setReady] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [dogs, setDogs] = useState<Dog[]>([])
  const [zones, setZones] = useState<Zone[]>([])
  const [selectedZone, setSelectedZone] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/'); return }

      const { data: me } = await supabase
        .from('users').select('role').eq('id', session.user.id).maybeSingle()
      if (me?.role !== 'staff') { router.push('/onboarding'); return }

      const { data: p } = await supabase
        .from('users')
        .select('id, name, phone, address, language, approved_at, zone_id, training_interest, created_at')
        .eq('id', userId)
        .maybeSingle()
      setProfile(p as Profile | null)
      setSelectedZone((p as Profile | null)?.zone_id ?? null)

      const { data: d } = await supabase
        .from('dogs')
        .select('id, name, breed, age_years, weight_kg, sex, approval_status, approval_conditions')
        .eq('owner_id', userId)
        .order('created_at', { ascending: true })
      setDogs((d ?? []) as Dog[])

      const { data: z } = await supabase
        .from('zones').select('id, name, description').order('name', { ascending: true })
      setZones((z ?? []) as Zone[])

      setReady(true)
    }
    load()
  }, [router, userId])

  async function saveZone() {
    if (!selectedZone) return
    setSaving(true)
    setError('')
    setSaved(false)
    const { error } = await supabase
      .from('users')
      .update({ zone_id: selectedZone })
      .eq('id', userId)
    if (error) {
      setError(error.message)
    } else {
      setSaved(true)
      setProfile(p => (p ? { ...p, zone_id: selectedZone } : p))
    }
    setSaving(false)
  }

  if (!ready) {
    return (
      <main className="min-h-screen bg-white flex items-center justify-center px-6">
        <p className="text-sm text-gray-400">Loading…</p>
      </main>
    )
  }

  if (!profile) {
    return (
      <main className="min-h-screen bg-white px-6 py-10">
        <div className="w-full max-w-sm mx-auto">
          <button onClick={() => router.push('/staff/clients')} className="text-sm text-gray-500 hover:text-gray-700 mb-6">
            ← Clients
          </button>
          <p className="text-sm text-gray-400">Client not found.</p>
        </div>
      </main>
    )
  }

  const isActive = !!(profile.approved_at && profile.zone_id)
  const zoneChanged = selectedZone !== profile.zone_id

  return (
    <main className="min-h-screen bg-white px-6 py-10">
      <div className="w-full max-w-sm mx-auto">

        <button
          onClick={() => router.push('/staff/clients')}
          className="text-sm text-gray-500 hover:text-gray-700 mb-6"
        >
          ← Clients
        </button>

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-gray-900 truncate">{profile.name ?? 'Unnamed'}</h1>
            {profile.phone && <p className="text-sm text-gray-500">{profile.phone}</p>}
          </div>
          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium flex-shrink-0 ${
            isActive ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
          }`}>
            {isActive ? 'Active' : 'Pending'}
          </span>
        </div>

        {/* Profile details */}
        <div className="rounded-2xl border border-gray-200 p-4 mb-4 space-y-3">
          <Field label="Pickup address" value={profile.address} />
          <Field label="Language" value={profile.language === 'mn' ? 'Mongolian' : profile.language === 'en' ? 'English' : profile.language} />
          <Field label="Training interest" value={profile.training_interest ? 'Yes' : 'No'} />
          <Field label="Member since" value={profile.created_at ? formatDate(profile.created_at) : null} />
        </div>

        {/* Dogs */}
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Dogs</h2>
        {dogs.length === 0 ? (
          <p className="text-sm text-gray-400 mb-6">No dog on file.</p>
        ) : (
          <div className="space-y-3 mb-6">
            {dogs.map(dog => (
              <div key={dog.id} className="rounded-2xl border border-gray-200 p-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-semibold text-gray-900">{dog.name}</p>
                  <DogStatusBadge status={dog.approval_status} />
                </div>
                <p className="text-xs text-gray-500">
                  {[dog.breed, dog.sex, dog.age_years ? `${dog.age_years}y` : null, dog.weight_kg ? `${dog.weight_kg}kg` : null]
                    .filter(Boolean).join(' · ')}
                </p>
                {dog.approval_status === 'approved_with_conditions' && dog.approval_conditions && (
                  <p className="text-xs text-gray-600 mt-2 bg-amber-50 border border-amber-100 rounded-lg p-2">
                    <span className="font-medium text-amber-700">Conditions: </span>{dog.approval_conditions}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Change zone */}
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Zone assignment</h2>
        {zones.length === 0 ? (
          <p className="text-sm text-gray-400 mb-6">No zones configured.</p>
        ) : (
          <div className="space-y-2 mb-4">
            {zones.map(zone => (
              <button
                key={zone.id}
                type="button"
                onClick={() => { setSelectedZone(zone.id); setSaved(false) }}
                className={`w-full text-left rounded-xl border-2 p-3 transition-colors ${
                  selectedZone === zone.id ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-green-300'
                }`}
              >
                <span className="block text-sm font-medium text-gray-900">{zone.name}</span>
                {zone.description && <span className="block text-xs text-gray-500 mt-0.5">{zone.description}</span>}
              </button>
            ))}
          </div>
        )}

        {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
        {saved && !zoneChanged && <p className="text-green-600 text-sm mb-3">✓ Zone updated</p>}

        <button
          onClick={saveZone}
          disabled={!selectedZone || !zoneChanged || saving}
          className="w-full bg-green-600 text-white py-3 rounded-xl font-medium text-sm disabled:opacity-50 hover:bg-green-700 transition-colors"
        >
          {saving ? 'Saving…' : zoneChanged ? 'Save zone change' : 'Zone saved'}
        </button>

      </div>
    </main>
  )
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-sm text-gray-800">{value || <span className="text-gray-400">—</span>}</p>
    </div>
  )
}

function DogStatusBadge({ status }: { status: string | null }) {
  const map: Record<string, { label: string; cls: string }> = {
    approved: { label: 'Approved', cls: 'bg-green-100 text-green-700' },
    approved_with_conditions: { label: 'Conditions', cls: 'bg-amber-100 text-amber-700' },
    pending: { label: 'Pending', cls: 'bg-gray-100 text-gray-600' },
    declined: { label: 'Declined', cls: 'bg-red-100 text-red-700' },
  }
  const s = map[status ?? ''] ?? { label: status ?? '—', cls: 'bg-gray-100 text-gray-600' }
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${s.cls}`}>{s.label}</span>
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}
