'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

const FONT = "'Noto Sans', system-ui, sans-serif"

// ---- Icons ------------------------------------------------------------------

function BackArrow() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#26452B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}

function PawIcon({ size = 24, color = '#8A7E72' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <circle cx="6"    cy="5.5" r="1.8" />
      <circle cx="11"   cy="4"   r="1.8" />
      <circle cx="16"   cy="4"   r="1.8" />
      <circle cx="20.5" cy="7"   r="1.6" />
      <ellipse cx="12.5" cy="15.5" rx="6" ry="5" />
    </svg>
  )
}

// ---- Types ------------------------------------------------------------------

type ExceptionType = 'cancellation' | 'no_show' | 'holding_fee'
type ExceptionRow = {
  id: string
  type: ExceptionType
  clientName: string
  dogName: string
  date: string
  amount: number | null
  note: string | null
}
type Filter = 'all' | ExceptionType

const TABS: { key: Filter; label: string }[] = [
  { key: 'all',         label: 'All' },
  { key: 'cancellation', label: 'Cancellations' },
  { key: 'no_show',     label: 'No-shows' },
  { key: 'holding_fee', label: 'Holding fees' },
]

const EMPTY_TEXT: Record<Filter, string> = {
  all:          'No exceptions logged.',
  cancellation: 'No cancellations yet.',
  no_show:      'No no-shows recorded.',
  holding_fee:  'No holding fees charged.',
}

function fmtDate(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${months[m - 1]} ${d}, ${y}`
}

// ---- Page -------------------------------------------------------------------

export default function ExceptionsLog() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const [rows, setRows] = useState<ExceptionRow[]>([])

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/'); return }
      const { data: profile } = await supabase
        .from('users').select('role').eq('id', session.user.id).maybeSingle()
      if (profile?.role !== 'staff') { router.push('/onboarding'); return }

      // Fetch all no-shows and cancellations from bookings table
      const { data: bRows } = await supabase
        .from('bookings')
        .select('id, owner_id, dog_id, hike_day_id, status, amount_charged')
        .in('status', ['no_show', 'cancelled'])
        .order('created_at', { ascending: false })
        .limit(200)

      const raw = bRows ?? []

      if (raw.length > 0) {
        const dogIds  = [...new Set(raw.map(b => b.dog_id))]
        const ownerIds = [...new Set(raw.map(b => b.owner_id))]
        const dayIds  = [...new Set(raw.map(b => b.hike_day_id))]

        const [{ data: dogRows }, { data: ownerRows }, { data: dayRows }] = await Promise.all([
          supabase.from('dogs').select('id, name').in('id', dogIds),
          supabase.from('users').select('id, name').in('id', ownerIds),
          supabase.from('hike_days').select('id, date').in('id', dayIds),
        ])

        const dogById: Record<string, string> = {}
        for (const d of dogRows ?? []) dogById[d.id] = d.name

        const ownerById: Record<string, string> = {}
        for (const u of ownerRows ?? []) ownerById[u.id] = u.name ?? 'Unknown'

        const dateById: Record<string, string> = {}
        for (const day of dayRows ?? []) dateById[day.id] = day.date

        setRows(raw.map(b => ({
          id: b.id,
          type: b.status === 'no_show' ? 'no_show' : 'cancellation',
          clientName: ownerById[b.owner_id] ?? 'Unknown',
          dogName: dogById[b.dog_id] ?? 'Unknown',
          date: fmtDate(dateById[b.hike_day_id] ?? ''),
          amount: b.amount_charged ?? null,
          note: null,
        })))
      }

      setReady(true)
    }
    load()
  }, [router])

  if (!ready) {
    return (
      <main style={{ minHeight: '100vh', backgroundColor: '#F5F0E8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT }}>
        <p style={{ fontSize: 14, color: '#8A7E72' }}>Loading…</p>
      </main>
    )
  }

  const visible = filter === 'all' ? rows : rows.filter(r => r.type === filter)
  const cancellationCount = rows.filter(r => r.type === 'cancellation').length
  const noShowCount       = rows.filter(r => r.type === 'no_show').length
  const holdingTotal      = rows.filter(r => r.type === 'holding_fee').reduce((s, r) => s + (r.amount ?? 0), 0)

  return (
    <main style={{ minHeight: '100vh', backgroundColor: '#F5F0E8', fontFamily: FONT, padding: '40px 24px 60px' }}>
      <div style={{ width: '100%', maxWidth: 384, margin: '0 auto' }}>

        {/* Back button */}
        <button
          onClick={() => router.push('/staff')}
          style={{ width: 32, height: 32, borderRadius: '50%', backgroundColor: '#E8E2D9', border: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', marginBottom: 24, padding: 0, flexShrink: 0 }}
        >
          <BackArrow />
        </button>

        {/* Title */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: '#3B2A1F', fontFamily: FONT, margin: 0 }}>Exceptions</h1>
          <p style={{ fontSize: 14, color: '#8A7E72', fontFamily: FONT, margin: '4px 0 0' }}>
            Cancellations, no-shows &amp; holding fees
          </p>
        </div>

        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 24 }}>
          <div style={{ backgroundColor: 'white', border: '1px solid #E8E2D9', borderRadius: 12, padding: '12px 8px', textAlign: 'center' }}>
            <p style={{ fontSize: 28, fontWeight: 700, color: cancellationCount > 0 ? '#E08A3E' : '#26452B', fontFamily: FONT, margin: 0, lineHeight: 1 }}>
              {cancellationCount}
            </p>
            <p style={{ fontSize: 13, color: '#8A7E72', fontFamily: FONT, margin: '4px 0 0' }}>Cancellations</p>
          </div>
          <div style={{ backgroundColor: 'white', border: '1px solid #E8E2D9', borderRadius: 12, padding: '12px 8px', textAlign: 'center' }}>
            <p style={{ fontSize: 28, fontWeight: 700, color: noShowCount > 0 ? '#C1562D' : '#26452B', fontFamily: FONT, margin: 0, lineHeight: 1 }}>
              {noShowCount}
            </p>
            <p style={{ fontSize: 13, color: '#8A7E72', fontFamily: FONT, margin: '4px 0 0' }}>No-shows</p>
          </div>
          <div style={{ backgroundColor: 'white', border: '1px solid #E8E2D9', borderRadius: 12, padding: '12px 8px', textAlign: 'center' }}>
            <p style={{ fontSize: 28, fontWeight: 700, color: '#26452B', fontFamily: FONT, margin: 0, lineHeight: 1 }}>
              {holdingTotal > 0 ? `₮${holdingTotal.toLocaleString()}` : '—'}
            </p>
            <p style={{ fontSize: 13, color: '#8A7E72', fontFamily: FONT, margin: '4px 0 0' }}>Holding ₮</p>
          </div>
        </div>

        {/* Filter pills */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 20, overflowX: 'auto', paddingBottom: 2 }}>
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              style={{
                padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600, fontFamily: FONT,
                whiteSpace: 'nowrap', cursor: 'pointer', flexShrink: 0,
                backgroundColor: filter === t.key ? '#26452B' : 'white',
                color:            filter === t.key ? 'white'   : '#3B2A1F',
                border:           filter === t.key ? 'none'    : '1px solid #E8E2D9',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* List / empty state */}
        {visible.length === 0 ? (
          <div style={{ backgroundColor: 'white', border: '1px solid #E8E2D9', borderRadius: 16, padding: '40px 24px', textAlign: 'center' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, borderRadius: '50%', backgroundColor: '#EEE9E0', marginBottom: 16 }}>
              <PawIcon size={26} color="#8A7E72" />
            </div>
            <p style={{ fontSize: 14, fontWeight: 700, color: '#3B2A1F', fontFamily: FONT, margin: '0 0 4px' }}>
              {EMPTY_TEXT[filter]}
            </p>
            <p style={{ fontSize: 13, color: '#8A7E72', fontFamily: FONT, margin: 0 }}>
              Exceptions will appear here as they are recorded.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {visible.map(row => (
              <ExceptionCard key={row.id} row={row} />
            ))}
          </div>
        )}

      </div>
    </main>
  )
}

// ---- Exception card ---------------------------------------------------------

const TYPE_BADGE: Record<ExceptionType, { label: string; bg: string; color: string }> = {
  no_show:      { label: 'No-show',     bg: '#FBE9E3', color: '#C1562D' },
  cancellation: { label: 'Cancelled',   bg: '#FEF3E2', color: '#E08A3E' },
  holding_fee:  { label: 'Holding fee', bg: '#EEE9E0', color: '#3B2A1F' },
}

function ExceptionCard({ row }: { row: ExceptionRow }) {
  const badge = TYPE_BADGE[row.type]
  return (
    <div style={{ backgroundColor: 'white', border: '1px solid #E8E2D9', borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: '#3B2A1F', fontFamily: FONT, margin: 0 }}>{row.dogName}</p>
        <span style={{ backgroundColor: badge.bg, color: badge.color, borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 600, fontFamily: FONT, flexShrink: 0 }}>
          {badge.label}
        </span>
      </div>
      <p style={{ fontSize: 13, color: '#8A7E72', fontFamily: FONT, margin: 0 }}>
        {row.clientName}{row.date ? ` · ${row.date}` : ''}
      </p>
      {row.amount != null && row.amount > 0 && (
        <p style={{ fontSize: 13, color: '#3B2A1F', fontFamily: FONT, margin: '4px 0 0' }}>₮{row.amount.toLocaleString()}</p>
      )}
      {row.note && (
        <p style={{ fontSize: 12, color: '#8A7E72', fontFamily: FONT, margin: '4px 0 0' }}>{row.note}</p>
      )}
    </div>
  )
}
