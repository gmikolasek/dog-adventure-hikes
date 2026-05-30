'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type Dog = {
  id: string
  owner_id: string
  name: string
  breed: string | null
  age_years: number | null
  weight_kg: number | null
  sex: string | null
  neutered: boolean | null
  disposition_notes: string | null
  other_notes: string | null
  recall_score: number | null
  car_score: number | null
  social_score: number | null
  known_aggression: boolean | null
  airtag_confirmed: boolean | null
  ecollar: boolean | null
}

type Owner = {
  id: string
  name: string | null
  phone: string | null
  address: string | null
}

export default function ApprovalQueue() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [staffId, setStaffId] = useState('')
  const [dogs, setDogs] = useState<Dog[]>([])
  const [owners, setOwners] = useState<Record<string, Owner>>({})

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
      setStaffId(session.user.id)

      const { data: pending } = await supabase
        .from('dogs')
        .select('*')
        .eq('approval_status', 'pending')
        .order('created_at', { ascending: true })

      const list = (pending ?? []) as Dog[]
      setDogs(list)

      const ownerIds = [...new Set(list.map(d => d.owner_id))]
      if (ownerIds.length) {
        const { data: ownerRows } = await supabase
          .from('users')
          .select('id, name, phone, address')
          .in('id', ownerIds)
        const map: Record<string, Owner> = {}
        for (const o of (ownerRows ?? []) as Owner[]) map[o.id] = o
        setOwners(map)
      }

      setReady(true)
    }
    load()
  }, [router])

  function removeDog(id: string) {
    setDogs(prev => prev.filter(d => d.id !== id))
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
          onClick={() => router.push('/staff')}
          className="text-sm text-gray-500 hover:text-gray-700 mb-6"
        >
          ← Dashboard
        </button>

        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">Dog approvals</h1>
          <p className="text-gray-500 mt-1 text-sm">
            {dogs.length} dog{dogs.length !== 1 ? 's' : ''} awaiting review
          </p>
        </div>

        {dogs.length === 0 ? (
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
              <span className="text-3xl">✓</span>
            </div>
            <p className="text-sm text-gray-500">All caught up — no pending dogs.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {dogs.map(dog => (
              <DogReviewCard
                key={dog.id}
                dog={dog}
                owner={owners[dog.owner_id]}
                staffId={staffId}
                onResolved={removeDog}
              />
            ))}
          </div>
        )}

      </div>
    </main>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-50 px-3 py-2">
      <p className="text-[11px] text-gray-400">{label}</p>
      <p className="text-sm font-medium text-gray-800">{value}</p>
    </div>
  )
}

function DogReviewCard({ dog, owner, staffId, onResolved }: {
  dog: Dog
  owner: Owner | undefined
  staffId: string
  onResolved: (id: string) => void
}) {
  const router = useRouter()
  const [mode, setMode] = useState<'idle' | 'conditions' | 'decline'>('idle')
  const [conditions, setConditions] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function approve(status: 'approved' | 'approved_with_conditions') {
    setBusy(true)
    setError('')
    const { error } = await supabase
      .from('dogs')
      .update({
        approval_status: status,
        approval_conditions: status === 'approved_with_conditions' ? conditions.trim() : null,
        approved_at: new Date().toISOString(),
        approved_by: staffId,
      })
      .eq('id', dog.id)

    if (error) {
      setError(error.message)
      setBusy(false)
      return
    }
    // Continue to zone assignment for this dog's owner.
    router.push(`/staff/zones/${dog.owner_id}?dog=${dog.id}`)
  }

  async function decline() {
    setBusy(true)
    setError('')
    const { error } = await supabase
      .from('dogs')
      .update({
        approval_status: 'declined',
        decline_reason: reason.trim(),
      })
      .eq('id', dog.id)

    if (error) {
      setError(error.message)
      setBusy(false)
      return
    }
    onResolved(dog.id)
  }

  return (
    <div className="rounded-2xl border border-gray-200 p-5">

      {/* Dog header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-base font-semibold text-gray-900">{dog.name}</h3>
          <p className="text-xs text-gray-500">
            {[dog.breed, dog.sex, dog.age_years ? `${dog.age_years}y` : null, dog.weight_kg ? `${dog.weight_kg}kg` : null]
              .filter(Boolean).join(' · ')}
          </p>
        </div>
        <span className="text-2xl">🐕</span>
      </div>

      {/* Owner */}
      <div className="rounded-xl bg-gray-50 p-3 mb-4">
        <p className="text-xs text-gray-400 mb-0.5">Owner</p>
        <p className="text-sm font-medium text-gray-800">{owner?.name ?? 'Unknown'}</p>
        {owner?.phone && <p className="text-xs text-gray-500">{owner.phone}</p>}
        {owner?.address && <p className="text-xs text-gray-500 mt-1">{owner.address}</p>}
      </div>

      {/* Scores */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <Stat label="Recall" value={dog.recall_score ? `${dog.recall_score}/5` : '—'} />
        <Stat label="Car" value={dog.car_score ? `${dog.car_score}/5` : '—'} />
        <Stat label="Social" value={dog.social_score ? `${dog.social_score}/5` : '—'} />
      </div>

      {/* Flags */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        <Flag ok={dog.airtag_confirmed === true} label={dog.airtag_confirmed ? 'AirTag ✓' : 'No AirTag'} />
        {dog.ecollar && <Flag ok label="E-collar" />}
        {dog.neutered && <Flag ok label="Neutered" />}
        {dog.known_aggression && <Flag ok={false} label="⚠ Aggression reported" />}
      </div>

      {/* Notes */}
      {dog.disposition_notes && (
        <p className="text-xs text-gray-600 leading-relaxed mb-2">
          <span className="text-gray-400">Disposition: </span>{dog.disposition_notes}
        </p>
      )}
      {dog.other_notes && (
        <p className="text-xs text-gray-600 leading-relaxed mb-4">
          <span className="text-gray-400">Other: </span>{dog.other_notes}
        </p>
      )}

      {error && <p className="text-red-500 text-xs mb-3">{error}</p>}

      {/* Actions */}
      {mode === 'idle' && (
        <div className="space-y-2 pt-1">
          <button
            onClick={() => approve('approved')}
            disabled={busy}
            className="w-full bg-green-600 text-white py-2.5 rounded-xl font-medium text-sm disabled:opacity-50 hover:bg-green-700 transition-colors"
          >
            {busy ? 'Working…' : 'Approve'}
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => setMode('conditions')}
              disabled={busy}
              className="flex-1 py-2.5 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Approve with conditions
            </button>
            <button
              onClick={() => setMode('decline')}
              disabled={busy}
              className="flex-1 py-2.5 rounded-xl border border-red-200 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              Decline
            </button>
          </div>
        </div>
      )}

      {mode === 'conditions' && (
        <div className="pt-1">
          <label className="block text-sm font-medium text-gray-700 mb-2">Conditions for approval</label>
          <textarea
            value={conditions}
            onChange={e => setConditions(e.target.value)}
            placeholder="e.g. Must wear e-collar; keep on lead for first hike; no off-leash until reassessed."
            rows={3}
            className="w-full rounded-xl border border-gray-300 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none mb-3"
          />
          <div className="flex gap-2">
            <button
              onClick={() => { setMode('idle'); setConditions('') }}
              disabled={busy}
              className="flex-1 py-2.5 rounded-xl border border-gray-300 text-sm font-medium text-gray-600 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={() => approve('approved_with_conditions')}
              disabled={busy || conditions.trim().length < 3}
              className="flex-1 bg-green-600 text-white py-2.5 rounded-xl font-medium text-sm disabled:opacity-50 hover:bg-green-700 transition-colors"
            >
              {busy ? 'Working…' : 'Approve & assign zone'}
            </button>
          </div>
        </div>
      )}

      {mode === 'decline' && (
        <div className="pt-1">
          <label className="block text-sm font-medium text-gray-700 mb-2">Reason for declining</label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="e.g. No GPS tracker; reported aggression unsuitable for group hikes."
            rows={3}
            className="w-full rounded-xl border border-gray-300 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none mb-3"
          />
          <div className="flex gap-2">
            <button
              onClick={() => { setMode('idle'); setReason('') }}
              disabled={busy}
              className="flex-1 py-2.5 rounded-xl border border-gray-300 text-sm font-medium text-gray-600 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={decline}
              disabled={busy || reason.trim().length < 3}
              className="flex-1 bg-red-600 text-white py-2.5 rounded-xl font-medium text-sm disabled:opacity-50 hover:bg-red-700 transition-colors"
            >
              {busy ? 'Working…' : 'Decline dog'}
            </button>
          </div>
        </div>
      )}

    </div>
  )
}

function Flag({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
        ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
      }`}
    >
      {label}
    </span>
  )
}
