'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

const FONT = "'Noto Sans', system-ui, sans-serif"
const forest = '#26452B'
const moss = '#4D6B46'
const brown = '#3B2A1F'
const muted = '#8A7E72'
const cardBorder = '#E8E2D9'
const bg = '#F5F0E8'
const badgeBg = '#EEE9E0'
const completeBg = '#E8F0E5'
const red = '#ef4444'

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
  photo_url: string | null
  approval_status: string
  alreadyApproved: boolean
}

type Owner = {
  id: string
  name: string | null
  phone: string | null
  address: string | null
  zone_id: string | null
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

      // Group 1 — pending dogs
      const { data: pendingRows } = await supabase
        .from('dogs')
        .select('*')
        .eq('approval_status', 'pending')
        .order('created_at', { ascending: true })

      // Group 2 — approved dogs that may still need a zone
      const { data: approvedRows } = await supabase
        .from('dogs')
        .select('*')
        .in('approval_status', ['approved', 'approved_with_conditions'])
        .order('created_at', { ascending: true })

      // Fetch owners for all dogs to check zone_id
      const allOwnerIds = [...new Set([
        ...(pendingRows ?? []).map((d: { owner_id: string }) => d.owner_id),
        ...(approvedRows ?? []).map((d: { owner_id: string }) => d.owner_id),
      ])]

      const map: Record<string, Owner> = {}
      if (allOwnerIds.length) {
        const { data: ownerRows } = await supabase
          .from('users')
          .select('id, name, phone, address, zone_id')
          .in('id', allOwnerIds)
        for (const o of (ownerRows ?? []) as Owner[]) map[o.id] = o
      }
      setOwners(map)

      const group1 = (pendingRows ?? []).map((d: Record<string, unknown>) => ({
        ...(d as Omit<Dog, 'alreadyApproved'>),
        alreadyApproved: false,
      }))

      const group2 = (approvedRows ?? [])
        .filter((d: { owner_id: string }) => map[d.owner_id]?.zone_id == null)
        .map((d: Record<string, unknown>) => ({
          ...(d as Omit<Dog, 'alreadyApproved'>),
          alreadyApproved: true,
        }))

      setDogs([...group1, ...group2] as Dog[])

      setReady(true)
    }
    load()
  }, [router])

  function removeDog(id: string) {
    setDogs(prev => prev.filter(d => d.id !== id))
  }

  if (!ready) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6" style={{ backgroundColor: bg, fontFamily: FONT }}>
        <p style={{ fontSize: 14, color: muted }}>Loading…</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen px-6 py-10" style={{ backgroundColor: bg, fontFamily: FONT }}>
      <div className="w-full max-w-sm mx-auto">

        {/* Back button */}
        <div style={{ marginBottom: 24 }}>
          <button
            onClick={() => router.push('/staff')}
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

        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: brown, margin: 0 }}>Dog approvals</h1>
          <p style={{ fontSize: 14, color: muted, margin: '4px 0 0' }}>
            {dogs.length > 0 && dogs.every(d => d.alreadyApproved)
              ? `${dogs.length} dog${dogs.length !== 1 ? 's' : ''} approved — zone assignment needed`
              : `${dogs.length} dog${dogs.length !== 1 ? 's' : ''} awaiting review`}
          </p>
        </div>

        {dogs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '64px 0' }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 64, height: 64, borderRadius: '50%',
              backgroundColor: completeBg, marginBottom: 16,
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path d="M20 6L9 17l-5-5" stroke={forest} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <p style={{ fontSize: 14, color: muted }}>All caught up — no pending dogs.</p>
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
    <div style={{ backgroundColor: badgeBg, borderRadius: 10, padding: '8px 12px' }}>
      <p style={{ fontSize: 11, color: muted, margin: '0 0 2px', fontFamily: FONT }}>{label}</p>
      <p style={{ fontSize: 14, fontWeight: 600, color: brown, margin: 0, fontFamily: FONT }}>{value}</p>
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
  const [resolvedStatus, setResolvedStatus] = useState<'approved' | 'approved_with_conditions' | null>(
    dog.alreadyApproved ? (dog.approval_status as 'approved' | 'approved_with_conditions') : null
  )

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
    setResolvedStatus(status)
    setBusy(false)
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
    marginBottom: 12,
    display: 'block',
  }

  return (
    <div style={{ backgroundColor: 'white', border: `1px solid ${cardBorder}`, borderRadius: 16, padding: 16 }}>

      {/* Dog header */}
      <div className="flex items-start justify-between" style={{ marginBottom: 12 }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: brown, margin: 0, fontFamily: FONT }}>{dog.name}</h3>
          <p style={{ fontSize: 12, color: muted, margin: '2px 0 0', fontFamily: FONT }}>
            {[dog.breed, dog.sex, dog.age_years ? `${dog.age_years}y` : null, dog.weight_kg ? `${dog.weight_kg}kg` : null]
              .filter(Boolean).join(' · ')}
          </p>
        </div>
        {dog.photo_url ? (
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            backgroundImage: `url(${dog.photo_url})`,
            backgroundSize: 'cover', backgroundPosition: 'center',
            flexShrink: 0,
          }} />
        ) : (
          <svg width="28" height="28" viewBox="0 0 24 24" fill={moss} style={{ flexShrink: 0 }}>
            <path d="M4.5 11c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm15 0c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm-1.5 1.5c0-1.1-.9-2-2-2h-1c-.36 0-.69.1-.98.27C13.4 9.7 12.74 9.5 12 9.5s-1.4.2-2.02.77c-.29-.17-.62-.27-.98-.27H8c-1.1 0-2 .9-2 2v1c0 2.21 1.79 4 4 4h4c2.21 0 4-1.79 4-4v-1zm-9.5-5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm5 0c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z" />
          </svg>
        )}
      </div>

      {/* Owner */}
      <div style={{ backgroundColor: badgeBg, borderRadius: 10, padding: 12, marginBottom: 16 }}>
        <p style={{ fontSize: 11, color: muted, margin: '0 0 2px', fontFamily: FONT }}>Owner</p>
        <p style={{ fontSize: 14, fontWeight: 600, color: brown, margin: 0, fontFamily: FONT }}>{owner?.name ?? 'Unknown'}</p>
        {owner?.phone && <p style={{ fontSize: 12, color: muted, margin: '2px 0 0', fontFamily: FONT }}>{owner.phone}</p>}
        {owner?.address && <p style={{ fontSize: 12, color: muted, margin: '4px 0 0', fontFamily: FONT }}>{owner.address}</p>}
      </div>

      {/* Scores */}
      <div className="grid grid-cols-3 gap-2" style={{ marginBottom: 16 }}>
        <Stat label="Recall" value={dog.recall_score ? `${dog.recall_score}/5` : '—'} />
        <Stat label="Car" value={dog.car_score ? `${dog.car_score}/5` : '—'} />
        <Stat label="Social" value={dog.social_score ? `${dog.social_score}/5` : '—'} />
      </div>

      {/* Flags */}
      <div className="flex flex-wrap gap-1.5" style={{ marginBottom: 16 }}>
        <Flag ok={dog.airtag_confirmed === true} label={dog.airtag_confirmed ? 'AirTag ✓' : 'No AirTag'} />
        {dog.ecollar && <Flag ok label="E-collar" />}
        {dog.neutered && <Flag ok label="Neutered" />}
        {dog.known_aggression && <Flag ok={false} label="⚠ Aggression reported" />}
      </div>

      {/* Notes */}
      {dog.disposition_notes && (
        <p style={{ fontSize: 12, color: brown, lineHeight: 1.5, margin: '0 0 8px', fontFamily: FONT }}>
          <span style={{ color: muted }}>Disposition: </span>{dog.disposition_notes}
        </p>
      )}
      {dog.other_notes && (
        <p style={{ fontSize: 12, color: brown, lineHeight: 1.5, margin: '0 0 16px', fontFamily: FONT }}>
          <span style={{ color: muted }}>Other: </span>{dog.other_notes}
        </p>
      )}

      {error && <p style={{ fontSize: 12, color: red, marginBottom: 12, fontFamily: FONT }}>{error}</p>}

      {/* Resolved state — show badge + zone assignment CTA */}
      {resolvedStatus !== null && (
        <div style={{ paddingTop: 4 }}>
          <div className="flex items-center gap-2" style={{ marginBottom: 12 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center',
              borderRadius: 999, padding: '3px 10px',
              fontSize: 12, fontWeight: 600,
              backgroundColor: resolvedStatus === 'approved' ? completeBg : '#FEF3C7',
              color: resolvedStatus === 'approved' ? forest : '#B45309',
            }}>
              {resolvedStatus === 'approved' ? 'Approved' : 'Approved with conditions'}
            </span>
          </div>
          <button
            onClick={() => router.push(`/staff/zones/${dog.owner_id}?dog=${dog.id}`)}
            style={{
              width: '100%', backgroundColor: forest, color: 'white',
              padding: '12px', borderRadius: 12, border: 'none',
              fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: FONT,
            }}
          >
            Assign zone →
          </button>
        </div>
      )}

      {/* Actions — idle */}
      {resolvedStatus === null && mode === 'idle' && (
        <div className="space-y-2" style={{ paddingTop: 4 }}>
          <button
            onClick={() => approve('approved')}
            disabled={busy}
            style={{
              width: '100%', backgroundColor: forest, color: 'white',
              padding: '12px', borderRadius: 12, border: 'none',
              fontSize: 14, fontWeight: 600,
              cursor: busy ? 'not-allowed' : 'pointer',
              opacity: busy ? 0.5 : 1, fontFamily: FONT,
            }}
          >
            {busy ? 'Working…' : 'Approve'}
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => setMode('conditions')}
              disabled={busy}
              style={{
                flex: 1, padding: '10px', borderRadius: 12,
                border: `1px solid ${cardBorder}`, backgroundColor: 'white',
                fontSize: 13, fontWeight: 600, color: brown,
                cursor: busy ? 'not-allowed' : 'pointer',
                opacity: busy ? 0.5 : 1, fontFamily: FONT,
              }}
            >
              Approve with conditions
            </button>
            <button
              onClick={() => setMode('decline')}
              disabled={busy}
              style={{
                flex: 1, padding: '10px', borderRadius: 12,
                border: `1px solid ${red}`, backgroundColor: 'white',
                fontSize: 13, fontWeight: 600, color: red,
                cursor: busy ? 'not-allowed' : 'pointer',
                opacity: busy ? 0.5 : 1, fontFamily: FONT,
              }}
            >
              Decline
            </button>
          </div>
        </div>
      )}

      {/* Actions — conditions */}
      {resolvedStatus === null && mode === 'conditions' && (
        <div style={{ paddingTop: 4 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: brown, marginBottom: 8, fontFamily: FONT }}>
            Conditions for approval
          </label>
          <textarea
            value={conditions}
            onChange={e => setConditions(e.target.value)}
            placeholder="e.g. Must wear e-collar; keep on lead for first hike; no off-leash until reassessed."
            rows={3}
            style={textareaStyle}
          />
          <div className="flex gap-2">
            <button
              onClick={() => { setMode('idle'); setConditions('') }}
              disabled={busy}
              style={{
                flex: 1, padding: '10px', borderRadius: 12,
                border: `1px solid ${cardBorder}`, backgroundColor: 'white',
                fontSize: 13, fontWeight: 600, color: muted,
                cursor: busy ? 'not-allowed' : 'pointer',
                opacity: busy ? 0.5 : 1, fontFamily: FONT,
              }}
            >
              Cancel
            </button>
            <button
              onClick={() => approve('approved_with_conditions')}
              disabled={busy || conditions.trim().length < 3}
              style={{
                flex: 1, backgroundColor: forest, color: 'white',
                padding: '10px', borderRadius: 12, border: 'none',
                fontSize: 13, fontWeight: 600,
                cursor: (busy || conditions.trim().length < 3) ? 'not-allowed' : 'pointer',
                opacity: (busy || conditions.trim().length < 3) ? 0.5 : 1, fontFamily: FONT,
              }}
            >
              {busy ? 'Working…' : 'Approve & assign zone'}
            </button>
          </div>
        </div>
      )}

      {/* Actions — decline */}
      {resolvedStatus === null && mode === 'decline' && (
        <div style={{ paddingTop: 4 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: brown, marginBottom: 8, fontFamily: FONT }}>
            Reason for declining
          </label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="e.g. No GPS tracker; reported aggression unsuitable for group hikes."
            rows={3}
            style={textareaStyle}
          />
          <div className="flex gap-2">
            <button
              onClick={() => { setMode('idle'); setReason('') }}
              disabled={busy}
              style={{
                flex: 1, padding: '10px', borderRadius: 12,
                border: `1px solid ${cardBorder}`, backgroundColor: 'white',
                fontSize: 13, fontWeight: 600, color: muted,
                cursor: busy ? 'not-allowed' : 'pointer',
                opacity: busy ? 0.5 : 1, fontFamily: FONT,
              }}
            >
              Cancel
            </button>
            <button
              onClick={decline}
              disabled={busy || reason.trim().length < 3}
              style={{
                flex: 1, backgroundColor: red, color: 'white',
                padding: '10px', borderRadius: 12, border: 'none',
                fontSize: 13, fontWeight: 600,
                cursor: (busy || reason.trim().length < 3) ? 'not-allowed' : 'pointer',
                opacity: (busy || reason.trim().length < 3) ? 0.5 : 1, fontFamily: FONT,
              }}
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
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 8px', borderRadius: 999,
      fontSize: 11, fontWeight: 600, fontFamily: FONT,
      backgroundColor: ok ? completeBg : '#FEE2E2',
      color: ok ? forest : '#B91C1C',
    }}>
      {label}
    </span>
  )
}
