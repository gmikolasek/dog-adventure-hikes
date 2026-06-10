'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'

const FONT = "'Noto Sans', system-ui, sans-serif"
const forest = '#26452B'
const brown = '#3B2A1F'
const muted = '#8A7E72'
const cardBorder = '#E8E2D9'
const bg = '#F5F0E8'
const badgeBg = '#EEE9E0'
const completeBg = '#E8F0E5'
const red = '#ef4444'
const orange = '#E08A3E'

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
  dogName: string | null
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

      const dogNameById: Record<string, string> = {}
      for (const dog of dogList) dogNameById[dog.id] = dog.name

      const { data: z } = await supabase
        .from('zones').select('id, name, description').order('name', { ascending: true })
      setZones((z ?? []) as Zone[])

      // Trail Pack credits — per row, not just total
      const nowIso = new Date().toISOString()
      const { data: creditRows } = await supabase
        .from('trail_pack_credits')
        .select('id, credits_remaining, expires_at, dog_id')
        .eq('owner_id', userId)
        .gt('credits_remaining', 0)
        .order('created_at', { ascending: false })
      const validCredits = (creditRows ?? []).filter((r: { expires_at: string | null }) => !r.expires_at || r.expires_at > nowIso)
      setCredits(validCredits.reduce((s: number, r: { credits_remaining: number }) => s + r.credits_remaining, 0))
      setPackCredits(validCredits.map((r: { id: string; credits_remaining: number; expires_at: string | null; dog_id: string | null }) => ({
        id: r.id,
        creditsRemaining: r.credits_remaining,
        expiresAt: r.expires_at,
        dogName: r.dog_id ? (dogNameById[r.dog_id] ?? null) : null,
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
      <main className="min-h-screen flex items-center justify-center px-6" style={{ backgroundColor: bg, fontFamily: FONT }}>
        <p style={{ fontSize: 14, color: muted }}>Loading…</p>
      </main>
    )
  }

  if (!profile) {
    return (
      <main className="min-h-screen px-6 py-10" style={{ backgroundColor: bg, fontFamily: FONT }}>
        <div className="w-full max-w-sm mx-auto">
          <div style={{ marginBottom: 24 }}>
            <button
              onClick={() => router.push('/staff/clients')}
              style={{
                width: 32, height: 32, borderRadius: '50%',
                backgroundColor: cardBorder, border: 'none',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M10 12L6 8l4-4" stroke={forest} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
          <p style={{ fontSize: 14, color: muted }}>Client not found.</p>
        </div>
      </main>
    )
  }

  const isActive = !!(profile.approved_at && profile.zone_id)
  const zoneChanged = selectedZone !== profile.zone_id

  const textareaStyle = {
    width: '100%',
    borderRadius: 10,
    border: `1px solid ${cardBorder}`,
    padding: '12px',
    fontSize: 14,
    color: '#171717',
    backgroundColor: 'white',
    WebkitTextFillColor: '#171717' as const,
    outline: 'none',
    fontFamily: FONT,
    boxSizing: 'border-box' as const,
    resize: 'none' as const,
    display: 'block',
  }

  return (
    <main className="min-h-screen px-6 py-10" style={{ backgroundColor: bg, fontFamily: FONT }}>
      <div className="w-full max-w-sm mx-auto">

        {/* Back button */}
        <div style={{ marginBottom: 24 }}>
          <button
            onClick={() => router.push('/staff/clients')}
            style={{
              width: 32, height: 32, borderRadius: '50%',
              backgroundColor: cardBorder, border: 'none',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 12L6 8l4-4" stroke={forest} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        {/* Header */}
        <div className="flex items-start justify-between" style={{ marginBottom: 20 }}>
          <div className="min-w-0">
            <h1 className="truncate" style={{ fontSize: 26, fontWeight: 700, color: brown, margin: 0, fontFamily: FONT }}>{profile.name ?? 'Unnamed'}</h1>
            {profile.phone && <p style={{ fontSize: 14, color: muted, margin: '4px 0 0', fontFamily: FONT }}>{profile.phone}</p>}
          </div>
          <span style={{
            display: 'inline-flex', alignItems: 'center',
            borderRadius: 999, padding: '3px 10px',
            fontSize: 12, fontWeight: 600, flexShrink: 0, marginLeft: 12,
            backgroundColor: isActive ? completeBg : '#FEF3C7',
            color: isActive ? forest : '#B45309',
            fontFamily: FONT,
          }}>
            {isActive ? 'Active' : 'Pending'}
          </span>
        </div>

        {/* Profile details card */}
        <div style={{ backgroundColor: 'white', border: `1px solid ${cardBorder}`, borderRadius: 16, padding: 16, marginBottom: 16 }}>
          <div className="space-y-3">
            <Field label="Pickup address" value={profile.address} />
            <Field label="Language" value={profile.language === 'mn' ? 'Mongolian' : profile.language === 'en' ? 'English' : profile.language} />
            <Field label="Training interest" value={profile.training_interest ? 'Yes' : 'No'} />
            <Field label="Trail Pack credits" value={`${credits} credit${credits !== 1 ? 's' : ''}`} />
            <Field label="Member since" value={profile.created_at ? formatDate(profile.created_at) : null} />
          </div>
        </div>

        {/* ── Dogs ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <div style={{ width: 3, height: 16, backgroundColor: forest, borderRadius: 2 }} />
          <h2 style={{ fontSize: 14, fontWeight: 700, color: brown, margin: 0, fontFamily: FONT }}>Dogs</h2>
        </div>
        {dogs.length === 0 ? (
          <p style={{ fontSize: 14, color: muted, marginBottom: 24, fontFamily: FONT }}>No dog on file.</p>
        ) : (
          <div className="space-y-2" style={{ marginBottom: 24 }}>
            {dogs.map(dog => (
              <div key={dog.id}>
                <div style={{ backgroundColor: 'white', border: `1px solid ${cardBorder}`, borderRadius: 16, padding: 16 }}>
                  <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
                    <div className="flex items-center gap-2 min-w-0">
                      <p style={{ fontSize: 14, fontWeight: 700, color: brown, margin: 0, fontFamily: FONT }}>{dog.name}</p>
                      <DogStatusBadge status={dog.approval_status} />
                    </div>
                    <button
                      onClick={() => {
                        if (editingDogId === dog.id) { setEditingDogId(null) }
                        else { startEditApproval(dog) }
                      }}
                      style={{
                        fontSize: 12, color: forest, fontWeight: 600,
                        background: 'none', border: 'none', cursor: 'pointer',
                        flexShrink: 0, marginLeft: 8, fontFamily: FONT,
                      }}
                    >
                      {editingDogId === dog.id ? 'Cancel' : 'Edit approval'}
                    </button>
                  </div>
                  <p style={{ fontSize: 12, color: muted, margin: 0, fontFamily: FONT }}>
                    {[dog.breed, dog.sex, dog.age_years ? `${dog.age_years}y` : null, dog.weight_kg ? `${dog.weight_kg}kg` : null]
                      .filter(Boolean).join(' · ')}
                  </p>
                  {dog.approval_status === 'approved_with_conditions' && dog.approval_conditions && (
                    <div style={{ marginTop: 8, backgroundColor: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 10, padding: 10 }}>
                      <p style={{ fontSize: 12, color: brown, margin: 0, fontFamily: FONT }}>
                        <span style={{ fontWeight: 700, color: '#B45309' }}>Conditions: </span>
                        {dog.approval_conditions}
                      </p>
                    </div>
                  )}
                  {dog.approval_status === 'declined' && dog.decline_reason && (
                    <div style={{ marginTop: 8, backgroundColor: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 10, padding: 10 }}>
                      <p style={{ fontSize: 12, color: brown, margin: 0, fontFamily: FONT }}>
                        <span style={{ fontWeight: 700, color: '#B91C1C' }}>Reason: </span>
                        {dog.decline_reason}
                      </p>
                    </div>
                  )}
                </div>

                {/* Inline approval editor */}
                {editingDogId === dog.id && (
                  <div style={{ backgroundColor: completeBg, border: `1px solid ${cardBorder}`, borderRadius: 16, padding: 16, marginTop: 4 }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: brown, margin: '0 0 12px', fontFamily: FONT }}>
                      Edit approval — {dog.name}
                    </p>

                    <div className="grid grid-cols-2 gap-2" style={{ marginBottom: 12 }}>
                      {APPROVAL_OPTIONS.map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setEditStatus(opt.value)}
                          style={{
                            padding: '10px 12px', borderRadius: 12,
                            fontSize: 12, fontWeight: 600,
                            textAlign: 'left', cursor: 'pointer',
                            fontFamily: FONT, backgroundColor: 'white',
                            border: editStatus === opt.value ? `2px solid ${forest}` : `1px solid ${cardBorder}`,
                            color: editStatus === opt.value ? forest : muted,
                          }}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>

                    {editStatus === 'approved_with_conditions' && (
                      <div style={{ marginBottom: 12 }}>
                        <label style={{ display: 'block', fontSize: 12, color: muted, marginBottom: 6, fontFamily: FONT }}>
                          Conditions (visible to client)
                        </label>
                        <textarea
                          value={editConditions}
                          onChange={e => setEditConditions(e.target.value)}
                          rows={3}
                          placeholder="e.g. Must remain on leash at all times"
                          style={textareaStyle}
                        />
                      </div>
                    )}

                    {editStatus === 'declined' && (
                      <div style={{ marginBottom: 12 }}>
                        <label style={{ display: 'block', fontSize: 12, color: muted, marginBottom: 6, fontFamily: FONT }}>
                          Decline reason / internal notes
                        </label>
                        <textarea
                          value={editDeclineReason}
                          onChange={e => setEditDeclineReason(e.target.value)}
                          rows={3}
                          placeholder="Internal notes on why this dog was declined"
                          style={textareaStyle}
                        />
                      </div>
                    )}

                    {approvalError && <p style={{ fontSize: 12, color: red, marginBottom: 8, fontFamily: FONT }}>{approvalError}</p>}

                    <button
                      onClick={() => saveApproval(dog.id)}
                      disabled={savingApproval}
                      style={{
                        width: '100%', backgroundColor: forest, color: 'white',
                        padding: '14px', borderRadius: 12, border: 'none',
                        fontSize: 14, fontWeight: 600,
                        cursor: savingApproval ? 'not-allowed' : 'pointer',
                        opacity: savingApproval ? 0.5 : 1, fontFamily: FONT,
                      }}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <div style={{ width: 3, height: 16, backgroundColor: forest, borderRadius: 2 }} />
          <h2 style={{ fontSize: 14, fontWeight: 700, color: brown, margin: 0, fontFamily: FONT }}>Zone assignment</h2>
        </div>
        {zones.length === 0 ? (
          <p style={{ fontSize: 14, color: muted, marginBottom: 24, fontFamily: FONT }}>No zones configured.</p>
        ) : (
          <div className="space-y-2" style={{ marginBottom: 12 }}>
            {zones.map(zone => (
              <button
                key={zone.id}
                type="button"
                onClick={() => { setSelectedZone(zone.id); setSaved(false) }}
                style={{
                  width: '100%', textAlign: 'left', borderRadius: 12, padding: 12,
                  cursor: 'pointer', fontFamily: FONT,
                  border: selectedZone === zone.id ? `2px solid ${forest}` : `1px solid ${cardBorder}`,
                  backgroundColor: selectedZone === zone.id ? completeBg : 'white',
                }}
              >
                <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: brown, fontFamily: FONT }}>{zone.name}</span>
                {zone.description && (
                  <span style={{ display: 'block', fontSize: 12, color: muted, marginTop: 2, fontFamily: FONT }}>{zone.description}</span>
                )}
              </button>
            ))}
          </div>
        )}

        {zoneError && <p style={{ fontSize: 14, color: red, marginBottom: 12, fontFamily: FONT }}>{zoneError}</p>}
        {saved && !zoneChanged && <p style={{ fontSize: 14, color: forest, marginBottom: 12, fontFamily: FONT }}>✓ Zone updated</p>}

        <button
          onClick={saveZone}
          disabled={!selectedZone || !zoneChanged || saving}
          style={{
            width: '100%', backgroundColor: forest, color: 'white',
            padding: '14px', borderRadius: 12, border: 'none',
            fontSize: 14, fontWeight: 600, marginBottom: 32,
            cursor: (!selectedZone || !zoneChanged || saving) ? 'not-allowed' : 'pointer',
            opacity: (!selectedZone || !zoneChanged || saving) ? 0.5 : 1,
            fontFamily: FONT,
          }}
        >
          {saving ? 'Saving…' : zoneChanged ? 'Save zone change' : 'Zone saved'}
        </button>

        {/* ── Booking history ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <div style={{ width: 3, height: 16, backgroundColor: forest, borderRadius: 2 }} />
          <h2 style={{ fontSize: 14, fontWeight: 700, color: brown, margin: 0, fontFamily: FONT }}>Booking history</h2>
        </div>
        {bookings.length === 0 ? (
          <div style={{ border: `1px dashed ${cardBorder}`, borderRadius: 16, padding: 24, textAlign: 'center', marginBottom: 24 }}>
            <p style={{ fontSize: 14, color: muted, margin: 0, fontFamily: FONT }}>No bookings yet.</p>
          </div>
        ) : (
          <div style={{ backgroundColor: 'white', border: `1px solid ${cardBorder}`, borderRadius: 16, overflow: 'hidden', marginBottom: 24 }}>
            {bookings.map((b, i) => (
              <div key={b.id} style={{ padding: '12px 16px', borderTop: i === 0 ? 'none' : `1px solid ${cardBorder}` }}>
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <p style={{ fontSize: 14, fontWeight: 600, color: brown, margin: 0, fontFamily: FONT }}>
                      {b.date ? formatDateStr(b.date) : '—'}
                    </p>
                    <p style={{ fontSize: 12, color: muted, margin: '2px 0 0', fontFamily: FONT }}>
                      {b.dogName}{b.destination ? ` · ${b.destination}` : ''}
                    </p>
                    {b.creditUsed > 0 ? (
                      <p style={{ fontSize: 11, color: orange, margin: '2px 0 0', fontFamily: FONT }}>Credit used</p>
                    ) : b.amountCharged > 0 ? (
                      <p style={{ fontSize: 11, color: muted, margin: '2px 0 0', fontFamily: FONT }}>₮{b.amountCharged.toLocaleString()}</p>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div style={{ width: 3, height: 16, backgroundColor: forest, borderRadius: 2 }} />
              <h2 style={{ fontSize: 14, fontWeight: 700, color: brown, margin: 0, fontFamily: FONT }}>Trail Pack credits</h2>
            </div>
            <div className="space-y-2" style={{ marginBottom: 24 }}>
              {packCredits.map(c => (
                <div
                  key={c.id}
                  className="flex items-center justify-between"
                  style={{ backgroundColor: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 12, padding: '12px 16px' }}
                >
                  <p style={{ fontSize: 14, color: brown, margin: 0, fontFamily: FONT }}>
                    {c.dogName ? `${c.dogName} — ` : ''}{c.creditsRemaining} credit{c.creditsRemaining !== 1 ? 's' : ''} remaining
                  </p>
                  {c.expiresAt && (
                    <p style={{ fontSize: 12, color: muted, margin: 0, fontFamily: FONT }}>
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
      <p style={{ fontSize: 11, color: muted, margin: '0 0 2px', fontFamily: FONT }}>{label}</p>
      <p style={{ fontSize: 14, color: brown, margin: 0, fontFamily: FONT }}>
        {value || <span style={{ color: muted }}>—</span>}
      </p>
    </div>
  )
}

function DogStatusBadge({ status }: { status: string | null }) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    approved:                 { label: 'Approved',   bg: completeBg,  color: forest },
    approved_with_conditions: { label: 'Conditions', bg: '#FEF3C7',   color: '#B45309' },
    pending:                  { label: 'Pending',    bg: badgeBg,     color: muted },
    declined:                 { label: 'Declined',   bg: '#FEE2E2',   color: '#B91C1C' },
  }
  const s = map[status ?? ''] ?? { label: status ?? '—', bg: badgeBg, color: muted }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      borderRadius: 999, padding: '2px 8px',
      fontSize: 11, fontWeight: 600, fontFamily: FONT,
      backgroundColor: s.bg, color: s.color,
    }}>
      {s.label}
    </span>
  )
}

function BookingStatusChip({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    confirmed: { label: 'Confirmed', bg: completeBg,  color: forest },
    cancelled: { label: 'Cancelled', bg: '#FEE2E2',   color: '#B91C1C' },
    no_show:   { label: 'No-show',   bg: '#FEE2E2',   color: '#B91C1C' },
  }
  const s = map[status] ?? { label: status, bg: badgeBg, color: muted }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      borderRadius: 999, padding: '2px 8px',
      fontSize: 11, fontWeight: 600, flexShrink: 0, marginLeft: 12, fontFamily: FONT,
      backgroundColor: s.bg, color: s.color,
    }}>
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
