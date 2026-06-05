'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'

// ─── Types ───────────────────────────────────────────────────────────────────

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
  decline_reason: string | null
}

type Zone = { id: string; name: string; description: string | null }

type BookingRow = {
  id: string
  date: string
  destination: string | null
  dogName: string
  amountCharged: number
  creditUsed: number
  status: string
}

type PackCredit = {
  id: string
  creditsRemaining: number
  expiresAt: string | null
}

const APPROVAL_OPTIONS = [
  { value: 'pending',                   label: 'Pending' },
  { value: 'approved',                  label: 'Approved' },
  { value: 'approved_with_conditions',  label: 'Conditions' },
  { value: 'declined',                  label: 'Declined' },
] as const

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ClientDetail() {
  const router = useRouter()
  const params = useParams<{ userId: string }>()
  const userId = params.userId

  const [ready, setReady] = useState(false)
  const [staffId, setStaffId] = useState('')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [dogs, setDogs] = useState<Dog[]>([])
  const [zones, setZones] = useState<Zone[]>([])
  const [selectedZone, setSelectedZone] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [zoneError, setZoneError] = useState('')
  const [credits, setCredits] = useState(0)
  const [packCredits, setPackCredits] = useState<PackCredit[]>([])
  const [bookings, setBookings] = useState<BookingRow[]>([])

  // Inline approval editor
  const [editingDogId, setEditingDogId] = useState<string | null>(null)
  const [editStatus, setEditStatus] = useState('')
  const [editConditions, setEditConditions] = useState('')
  const [editDeclineReason, setEditDeclineReason] = useState('')
  const [savingApproval, setSavingApproval] = useState(false)
  const [approvalError, setApprovalError] = useState('')

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/'); return }

      const { data: me } = await supabase
        .from('users').select('role').eq('id', session.user.id).maybeSingle()
      if (me?.role !== 'staff') { router.push('/onboarding'); return }
      setStaffId(session.user.id)

      const { data: p } = await supabase
        .from('users')
        .select('id, name, phone, address, language, approved_at, zone_id, training_interest, created_at')
        .eq('id', userId)
        .maybeSingle()
      setProfile(p as Profile | null)
      setSelectedZone((p as Profile | null)?.zone_id ?? null)

      const { data: d } = await supabase
        .from('dogs')
        .select('id, name, breed, age_years, weight_kg, sex, approval_status, approval_conditions, decline_reason')
        .eq('owner_id', userId)
        .order('created_at', { ascending: true })
      const dogList = (d ?? []) as Dog[]
      setDogs(dogList)

      const { data: z } = await supabase
        .from('zones').select('id, name, description').order('name', { ascending: true })
      setZones((z ?? []) as Zone[])

      // Trail Pack credits — per row, not just total
      const nowIso = new Date().toISOString()
      const { data: creditRows } = await supabase
        .from('trail_pack_credits')
        .select('id, credits_remaining, expires_at')
        .eq('owner_id', userId)
        .gt('credits_remaining', 0)
        .order('created_at', { ascending: false })
      const validCredits = (creditRows ?? []).filter((r: { expires_at: string | null }) => !r.expires_at || r.expires_at > nowIso)
      setCredits(validCredits.reduce((s: number, r: { credits_remaining: number }) => s + r.credits_remaining, 0))
      setPackCredits(validCredits.map((r: { id: string; credits_remaining: number; expires_at: string | null }) => ({
        id: r.id,
        creditsRemaining: r.credits_remaining,
        expiresAt: r.expires_at,
      })))

      // Booking history
      const { data: bRows } = await supabase
        .from('bookings')
        .select('id, dog_id, hike_day_id, status, amount_charged, credit_used')
        .eq('owner_id', userId)
        .in('status', ['confirmed', 'cancelled', 'no_show'])
        .order('created_at', { ascending: false })

      if ((bRows ?? []).length > 0) {
        const hikeDayIds = [...new Set((bRows ?? []).map((b: { hike_day_id: string }) => b.hike_day_id))]
        const { data: dayRows } = await supabase
          .from('hike_days')
          .select('id, date, destination_override')
          .in('id', hikeDayIds)
        const dayById: Record<string, { date: string; destination_override: string | null }> = {}
        for (const day of (dayRows ?? [])) dayById[day.id] = day

        const dogNameById: Record<string, string> = {}
        for (const dog of dogList) dogNameById[dog.id] = dog.name

        setBookings(
          (bRows ?? []).map((b: { id: string; dog_id: string; hike_day_id: string; status: string; amount_charged: number; credit_used: number }) => ({
            id: b.id,
            date: dayById[b.hike_day_id]?.date ?? '',
            destination: dayById[b.hike_day_id]?.destination_override ?? null,
            dogName: dogNameById[b.dog_id] ?? 'Unknown',
            amountCharged: b.amount_charged ?? 0,
            creditUsed: b.credit_used ?? 0,
            status: b.status,
          })).sort((a: BookingRow, b: BookingRow) => b.date.localeCompare(a.date))
        )
      }

      setReady(true)
    }
    load()
  }, [router, userId])

  async function saveZone() {
    if (!selectedZone) return
    setSaving(true)
    setZoneError('')
    setSaved(false)
    const { error } = await supabase
      .from('users')
      .update({ zone_id: selectedZone })
      .eq('id', userId)
    if (error) {
      setZoneError(error.message)
    } else {
      setSaved(true)
      setProfile(p => (p ? { ...p, zone_id: selectedZone } : p))
    }
    setSaving(false)
  }

  function startEditApproval(dog: Dog) {
    setEditingDogId(dog.id)
    setEditStatus(dog.approval_status ?? 'pending')
    setEditConditions(dog.approval_conditions ?? '')
    setEditDeclineReason(dog.decline_reason ?? '')
    setApprovalError('')
  }

  async function saveApproval(dogId: string) {
    setSavingApproval(true)
    setApprovalError('')

    const updates: Record<string, unknown> = {
      approval_status: editStatus,
      approval_conditions: editStatus === 'approved_with_conditions' ? editConditions.trim() || null : null,
      decline_reason: editStatus === 'declined' ? editDeclineReason.trim() || null : null,
    }
    if (editStatus === 'approved' || editStatus === 'approved_with_conditions') {
      updates.approved_at = new Date().toISOString()
      updates.approved_by = staffId
    }

    const { error } = await supabase.from('dogs').update(updates).eq('id', dogId)
    if (error) {
      setApprovalError(error.message)
      setSavingApproval(false)
      return
    }

    setDogs(prev => prev.map(d => d.id === dogId ? {
      ...d,
      approval_status: editStatus,
      approval_conditions: updates.approval_conditions as string | null,
      decline_reason: updates.decline_reason as string | null,
    } : d))
    setEditingDogId(null)
    setSavingApproval(false)
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
          <Field label="Trail Pack credits" value={`${credits} credit${credits !== 1 ? 's' : ''}`} />
          <Field label="Member since" value={profile.created_at ? formatDate(profile.created_at) : null} />
        </div>

        {/* ── Dogs ── */}
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Dogs</h2>
        {dogs.length === 0 ? (
          <p className="text-sm text-gray-400 mb-6">No dog on file.</p>
        ) : (
          <div className="space-y-2 mb-6">
            {dogs.map(dog => (
              <div key={dog.id}>
                <div className="rounded-2xl border border-gray-200 p-4">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{dog.name}</p>
                      <DogStatusBadge status={dog.approval_status} />
                    </div>
                    <button
                      onClick={() => {
                        if (editingDogId === dog.id) { setEditingDogId(null) }
                        else { startEditApproval(dog) }
                      }}
                      className="text-xs text-green-600 hover:text-green-700 font-medium flex-shrink-0 ml-2"
                    >
                      {editingDogId === dog.id ? 'Cancel' : 'Edit approval'}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500">
                    {[dog.breed, dog.sex, dog.age_years ? `${dog.age_years}y` : null, dog.weight_kg ? `${dog.weight_kg}kg` : null]
                      .filter(Boolean).join(' · ')}
                  </p>
                  {dog.approval_status === 'approved_with_conditions' && dog.approval_conditions && (
                    <p className="text-xs mt-2 bg-amber-50 border border-amber-100 rounded-lg p-2">
                      <span className="font-medium text-amber-700">Conditions: </span>
                      <span className="text-gray-700">{dog.approval_conditions}</span>
                    </p>
                  )}
                  {dog.approval_status === 'declined' && dog.decline_reason && (
                    <p className="text-xs mt-2 bg-red-50 border border-red-100 rounded-lg p-2">
                      <span className="font-medium text-red-600">Reason: </span>
                      <span className="text-gray-700">{dog.decline_reason}</span>
                    </p>
                  )}
                </div>

                {/* Inline approval editor */}
                {editingDogId === dog.id && (
                  <div className="rounded-2xl border border-green-200 bg-green-50 p-4 mt-1 space-y-3">
                    <p className="text-xs font-semibold text-gray-700">Edit approval — {dog.name}</p>

                    <div className="grid grid-cols-2 gap-2">
                      {APPROVAL_OPTIONS.map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setEditStatus(opt.value)}
                          className={`py-2 px-3 rounded-xl text-xs font-medium border-2 transition-colors text-left ${
                            editStatus === opt.value
                              ? 'border-green-500 bg-white text-green-700'
                              : 'border-gray-200 bg-white text-gray-600'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>

                    {editStatus === 'approved_with_conditions' && (
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Conditions (visible to client)</label>
                        <textarea
                          value={editConditions}
                          onChange={e => setEditConditions(e.target.value)}
                          rows={3}
                          placeholder="e.g. Must remain on leash at all times"
                          className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                        />
                      </div>
                    )}

                    {editStatus === 'declined' && (
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Decline reason / internal notes</label>
                        <textarea
                          value={editDeclineReason}
                          onChange={e => setEditDeclineReason(e.target.value)}
                          rows={3}
                          placeholder="Internal notes on why this dog was declined"
                          className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                        />
                      </div>
                    )}

                    {approvalError && <p className="text-xs text-red-500">{approvalError}</p>}

                    <button
                      onClick={() => saveApproval(dog.id)}
                      disabled={savingApproval}
                      className="w-full bg-green-600 text-white py-2.5 rounded-xl text-sm font-medium disabled:opacity-50 hover:bg-green-700 transition-colors"
                    >
                      {savingApproval ? 'Saving…' : 'Save approval'}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Zone assignment ── */}
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

        {zoneError && <p className="text-red-500 text-sm mb-3">{zoneError}</p>}
        {saved && !zoneChanged && <p className="text-green-600 text-sm mb-3">✓ Zone updated</p>}

        <button
          onClick={saveZone}
          disabled={!selectedZone || !zoneChanged || saving}
          className="w-full bg-green-600 text-white py-3 rounded-xl font-medium text-sm disabled:opacity-50 hover:bg-green-700 transition-colors mb-10"
        >
          {saving ? 'Saving…' : zoneChanged ? 'Save zone change' : 'Zone saved'}
        </button>

        {/* ── Booking history ── */}
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Booking history</h2>
        {bookings.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 p-6 text-center mb-6">
            <p className="text-sm text-gray-400">No bookings yet.</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-gray-200 divide-y divide-gray-100 overflow-hidden mb-6">
            {bookings.map(b => (
              <div key={b.id} className="px-4 py-3">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">{b.date ? formatDateStr(b.date) : '—'}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {b.dogName}{b.destination ? ` · ${b.destination}` : ''}
                    </p>
                    {b.creditUsed > 0 ? (
                      <p className="text-[11px] text-amber-600 mt-0.5">Credit used</p>
                    ) : b.amountCharged > 0 ? (
                      <p className="text-[11px] text-gray-400 mt-0.5">₮{b.amountCharged.toLocaleString()}</p>
                    ) : null}
                  </div>
                  <BookingStatusChip status={b.status} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Trail Pack credits (per pack) ── */}
        {packCredits.length > 0 && (
          <>
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Trail Pack credits</h2>
            <div className="space-y-2 mb-6">
              {packCredits.map(c => (
                <div key={c.id} className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 flex items-center justify-between">
                  <p className="text-sm text-gray-800">
                    {c.creditsRemaining} credit{c.creditsRemaining !== 1 ? 's' : ''} remaining
                  </p>
                  {c.expiresAt && (
                    <p className="text-xs text-gray-500">
                      Expires {new Date(c.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

      </div>
    </main>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

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
    approved:                 { label: 'Approved',    cls: 'bg-green-100 text-green-700' },
    approved_with_conditions: { label: 'Conditions',  cls: 'bg-amber-100 text-amber-700' },
    pending:                  { label: 'Pending',     cls: 'bg-gray-100 text-gray-600' },
    declined:                 { label: 'Declined',    cls: 'bg-red-100 text-red-700' },
  }
  const s = map[status ?? ''] ?? { label: status ?? '—', cls: 'bg-gray-100 text-gray-600' }
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${s.cls}`}>{s.label}</span>
}

function BookingStatusChip({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    confirmed: { label: 'Confirmed', cls: 'bg-green-100 text-green-700' },
    cancelled: { label: 'Cancelled', cls: 'bg-red-100 text-red-600' },
    no_show:   { label: 'No-show',   cls: 'bg-red-100 text-red-600' },
  }
  const s = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600' }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium flex-shrink-0 ml-3 ${s.cls}`}>
      {s.label}
    </span>
  )
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatDateStr(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
