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

// suppress unused-variable warnings for tokens not used directly in JSX
void badgeBg

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
            onClick={() => router.push('/staff/approvals')}
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
        <div className="text-center" style={{ marginBottom: 24 }}>
          <div
            className="inline-flex items-center justify-center"
            style={{ width: 64, height: 64, borderRadius: '50%', backgroundColor: completeBg, marginBottom: 16 }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="#4D6B46">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
            </svg>
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: brown, fontFamily: FONT, margin: '0 0 6px' }}>Assign a zone</h1>
          <p style={{ fontSize: 14, color: muted, fontFamily: FONT, margin: 0 }}>
            Dog approved — now place {client?.name ?? 'this client'} in a hiking zone
          </p>
        </div>

        {/* Client card */}
        <div style={{ backgroundColor: 'white', border: `1px solid ${cardBorder}`, borderRadius: 16, padding: 16, marginBottom: 24 }}>
          <p style={{ fontSize: 11, color: muted, fontFamily: FONT, margin: '0 0 4px' }}>Client</p>
          <p style={{ fontSize: 14, fontWeight: 600, color: brown, fontFamily: FONT, margin: 0 }}>{client?.name ?? 'Unknown'}</p>
          {client?.phone && (
            <p style={{ fontSize: 12, color: muted, fontFamily: FONT, margin: '2px 0 0' }}>{client.phone}</p>
          )}
          <p style={{ fontSize: 11, color: muted, fontFamily: FONT, margin: '12px 0 4px' }}>Pickup address</p>
          <p style={{ fontSize: 14, color: brown, fontFamily: FONT, margin: 0, lineHeight: 1.5 }}>
            {client?.address || <span style={{ color: muted }}>No address on file</span>}
          </p>
        </div>

        {/* Zone picker */}
        <label style={{ fontSize: 13, fontWeight: 600, color: brown, fontFamily: FONT, display: 'block', marginBottom: 12 }}>
          Hiking zone
        </label>
        {zones.length === 0 ? (
          <p style={{ fontSize: 14, color: muted, fontFamily: FONT, marginBottom: 24 }}>
            No zones configured yet. Add zones in Supabase before assigning.
          </p>
        ) : (
          <div className="space-y-2" style={{ marginBottom: 24 }}>
            {zones.map(zone => (
              <button
                key={zone.id}
                type="button"
                onClick={() => setSelected(zone.id)}
                style={{
                  width: '100%', textAlign: 'left', borderRadius: 12, padding: 12, cursor: 'pointer',
                  backgroundColor: selected === zone.id ? completeBg : 'white',
                  border: selected === zone.id ? `2px solid ${forest}` : `1px solid ${cardBorder}`,
                }}
              >
                <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: brown, fontFamily: FONT }}>{zone.name}</span>
                {zone.description && (
                  <span style={{ display: 'block', fontSize: 12, color: muted, fontFamily: FONT, marginTop: 2 }}>{zone.description}</span>
                )}
              </button>
            ))}
          </div>
        )}

        {error && (
          <p style={{ fontSize: 14, color: red, fontFamily: FONT, marginBottom: 16 }}>{error}</p>
        )}

        <button
          onClick={confirm}
          disabled={!selected || saving}
          style={{
            width: '100%', backgroundColor: forest, color: 'white', borderRadius: 12,
            fontWeight: 600, border: 'none', padding: '14px', fontSize: 14,
            fontFamily: FONT, cursor: (!selected || saving) ? 'not-allowed' : 'pointer',
            opacity: (!selected || saving) ? 0.5 : 1,
          }}
        >
          {saving ? 'Saving…' : 'Confirm zone & activate client →'}
        </button>

      </div>
    </main>
  )
}
