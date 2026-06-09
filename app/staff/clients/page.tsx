'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { getClients, STATUS_LABEL, type ClientRow, type ClientStatus } from '@/lib/adminData'

const FONT = "'Noto Sans', system-ui, sans-serif"
const forest = '#26452B'
const moss = '#4D6B46'
const brown = '#3B2A1F'
const muted = '#8A7E72'
const cardBorder = '#E8E2D9'
const bg = '#F5F0E8'

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
      <main className="min-h-screen flex items-center justify-center px-6" style={{ backgroundColor: bg, fontFamily: FONT }}>
        <p style={{ fontSize: 14, color: muted }}>Loading…</p>
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

        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: brown, margin: 0 }}>Clients</h1>
          <p style={{ fontSize: 14, color: muted, margin: '4px 0 0' }}>
            {clients.length} client{clients.length !== 1 ? 's' : ''}
          </p>
        </div>

        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by name, dog or zone"
          style={{
            width: '100%',
            borderRadius: 10,
            border: `1px solid ${cardBorder}`,
            padding: '12px',
            fontSize: 14,
            color: '#171717',
            backgroundColor: 'white',
            WebkitTextFillColor: '#171717',
            outline: 'none',
            fontFamily: FONT,
            boxSizing: 'border-box',
            marginBottom: 20,
            display: 'block',
          }}
        />

        {filtered.length === 0 ? (
          <p style={{ fontSize: 14, color: muted }}>No matching clients.</p>
        ) : (
          <div className="space-y-3">
            {filtered.map(c => (
              <button
                key={c.id}
                onClick={() => router.push(`/staff/clients/${c.id}`)}
                style={{
                  backgroundColor: 'white',
                  border: `1px solid ${cardBorder}`,
                  borderRadius: 16,
                  padding: 16,
                  width: '100%',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontFamily: FONT,
                }}
              >
                <div className="flex items-start justify-between" style={{ marginBottom: 8 }}>
                  <div className="min-w-0">
                    <p className="truncate" style={{ fontSize: 14, fontWeight: 700, color: brown, margin: 0 }}>{c.name ?? 'Unnamed'}</p>
                    {c.phone && <p style={{ fontSize: 12, color: muted, margin: '2px 0 0' }}>{c.phone}</p>}
                  </div>
                  <StatusBadge status={c.status} />
                </div>

                <div className="space-y-1">
                  {c.dogs.length === 0 ? (
                    <p style={{ fontSize: 12, color: muted }}>No dog on file</p>
                  ) : (
                    c.dogs.map(d => (
                      <div key={d.id} className="flex items-center" style={{ gap: 6 }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill={moss}>
                          <path d="M4.5 11c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm15 0c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm-1.5 1.5c0-1.1-.9-2-2-2h-1c-.36 0-.69.1-.98.27C13.4 9.7 12.74 9.5 12 9.5s-1.4.2-2.02.77c-.29-.17-.62-.27-.98-.27H8c-1.1 0-2 .9-2 2v1c0 2.21 1.79 4 4 4h4c2.21 0 4-1.79 4-4v-1zm-9.5-5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm5 0c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z" />
                        </svg>
                        <p style={{ fontSize: 13, color: brown, margin: 0 }}>
                          {d.name}{d.breed ? ` · ${d.breed}` : ''}
                        </p>
                      </div>
                    ))
                  )}
                </div>

                <div className="flex items-center justify-between" style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${cardBorder}` }}>
                  <div className="flex items-center" style={{ gap: 4 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill={moss}>
                      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
                    </svg>
                    <span style={{ fontSize: 12, color: muted }}>
                      {c.zoneName ?? <span style={{ color: muted }}>No zone</span>}
                    </span>
                  </div>
                  <span style={{ fontSize: 12, color: muted }}>Last booking: {c.lastBooking ?? '—'}</span>
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
  const map: Record<ClientStatus, { bg: string; color: string }> = {
    active:     { bg: '#E8F0E5', color: '#26452B' },
    pending:    { bg: '#FEF3C7', color: '#B45309' },
    incomplete: { bg: '#EEE9E0', color: '#8A7E72' },
    rejected:   { bg: '#FEE2E2', color: '#B91C1C' },
  }
  const s = map[status]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      borderRadius: 999, padding: '3px 10px',
      fontSize: 12, fontWeight: 600,
      backgroundColor: s.bg, color: s.color,
      flexShrink: 0,
    }}>
      {STATUS_LABEL[status]}
    </span>
  )
}
