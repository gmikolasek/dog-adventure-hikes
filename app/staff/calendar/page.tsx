'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import {
  twoWeekDates, rollingTwoWeekDates, isoDate, todayIso, formatFull,
  DEFAULT_CAPACITY, type HikeDay, type HikeDayStatus,
} from '@/lib/booking'

type Zone = { id: string; name: string }

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const FONT = "'Noto Sans', system-ui, sans-serif"

function PawIcon({ size = 8, color = '#26452B' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <circle cx="6"  cy="5.5" r="1.8"/>
      <circle cx="11" cy="4"   r="1.8"/>
      <circle cx="16" cy="4"   r="1.8"/>
      <circle cx="20.5" cy="7" r="1.6"/>
      <ellipse cx="12.5" cy="15.5" rx="6" ry="5"/>
    </svg>
  )
}

export default function StaffCalendar() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [staffId, setStaffId] = useState('')
  const [zones, setZones] = useState<Zone[]>([])
  const [days, setDays] = useState<Record<string, HikeDay>>({})
  const [selected, setSelected] = useState<string | null>(null)

  // Editor state
  const [status, setStatus] = useState<HikeDayStatus>('open')
  const [zoneSel, setZoneSel] = useState<string[]>([])
  const [destination, setDestination] = useState('')
  const [capacity, setCapacity] = useState(DEFAULT_CAPACITY)
  const [allowOver, setAllowOver] = useState(false)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const dates = rollingTwoWeekDates()
  const today = todayIso()

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/'); return }
      const { data: profile } = await supabase
        .from('users').select('role').eq('id', session.user.id).maybeSingle()
      if (profile?.role !== 'staff') { router.push('/onboarding'); return }
      setStaffId(session.user.id)

      const { data: zoneRows } = await supabase
        .from('zones').select('id, name').order('name', { ascending: true })
      setZones((zoneRows ?? []) as Zone[])

      const first = isoDate(dates[0])
      const last = isoDate(dates[dates.length - 1])
      const { data: dayRows } = await supabase
        .from('hike_days').select('*').gte('date', first).lte('date', last)
      const map: Record<string, HikeDay> = {}
      for (const d of (dayRows ?? []) as HikeDay[]) map[d.date] = d
      setDays(map)

      setReady(true)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  function selectDay(iso: string) {
    setSelected(iso)
    setError('')
    const existing = days[iso]
    if (existing) {
      setStatus(existing.status === 'blocked' || existing.status === 'cancelled' ? 'blocked' : 'open')
      setZoneSel(existing.zones ?? [])
      setDestination(existing.destination_override ?? '')
      setCapacity(existing.capacity ?? DEFAULT_CAPACITY)
      setAllowOver(existing.allow_over_capacity ?? false)
      setNote(existing.client_note ?? '')
    } else {
      setStatus('open')
      setZoneSel([])
      setDestination('')
      setCapacity(DEFAULT_CAPACITY)
      setAllowOver(false)
      setNote('')
    }
  }

  function toggleZone(id: string) {
    setZoneSel(prev => prev.includes(id) ? prev.filter(z => z !== id) : [...prev, id])
  }

  async function save() {
    if (!selected) return
    setSaving(true)
    setError('')
    const payload = {
      date: selected,
      status,
      capacity,
      allow_over_capacity: allowOver,
      zones: status === 'open' ? zoneSel : [],
      destination_override: destination.trim() || null,
      client_note: note.trim() || null,
      created_by: staffId,
    }
    const { data, error } = await supabase
      .from('hike_days')
      .upsert(payload, { onConflict: 'date' })
      .select()
      .maybeSingle()
    if (error) {
      setError(error.message)
      setSaving(false)
      return
    }
    if (data) setDays(prev => ({ ...prev, [selected]: data as HikeDay }))
    setSaving(false)
    setSelected(null)
  }

  if (!ready) {
    return (
      <main style={{ minHeight: '100vh', backgroundColor: '#F5F0E8', fontFamily: FONT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontSize: 14, color: '#8A7E72' }}>Loading…</p>
      </main>
    )
  }

  return (
    <main style={{ minHeight: '100vh', backgroundColor: '#F5F0E8', fontFamily: FONT, padding: '40px 24px' }}>
      <div style={{ width: '100%', maxWidth: 384, margin: '0 auto' }}>

        {/* Back button */}
        <button
          onClick={() => router.push('/staff')}
          style={{ width: 32, height: 32, borderRadius: '50%', backgroundColor: '#E8E2D9', border: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', marginBottom: 24, flexShrink: 0, padding: 0 }}
        >
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#26452B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>

        {/* Title */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: '#3B2A1F', fontFamily: FONT, margin: 0 }}>Calendar</h1>
          <p style={{ color: '#8A7E72', marginTop: 4, fontSize: 14, fontFamily: FONT, margin: '4px 0 0' }}>Open or block the next two weeks</p>
        </div>

        {/* Weekday headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
          {WEEKDAYS.map(w => (
            <div key={w} style={{ textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#8A7E72', fontFamily: FONT }}>{w}</div>
          ))}
        </div>

        {/* 2-week grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 20 }}>
          {dates.map(d => {
            const iso = isoDate(d)
            const day = days[iso]
            const past = iso < today
            const isSel = selected === iso
            const isToday = iso === today
            const open = day?.status === 'open'
            const blocked = day?.status === 'blocked' || day?.status === 'cancelled'

            let bg = 'white'
            let border = '1px solid #E8E2D9'
            let dateColor = '#8A7E72'
            let dateFontWeight = 400

            if (!past) {
              if (open) {
                bg = '#E8F0E5'
                border = '1px solid #26452B'
                dateColor = '#26452B'
                dateFontWeight = 700
              } else if (blocked) {
                bg = '#EEE9E0'
                border = '1px solid #C0B8AE'
                dateColor = '#8A7E72'
              }
              if (isToday) border = '2px solid #E08A3E'
            }

            return (
              <button
                key={iso}
                type="button"
                disabled={past}
                onClick={() => selectDay(iso)}
                style={{
                  aspectRatio: '1',
                  borderRadius: 12,
                  border,
                  outline: isSel && !isToday ? '2px solid #26452B' : 'none',
                  outlineOffset: 1,
                  backgroundColor: bg,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: past ? 'not-allowed' : 'pointer',
                  padding: 0,
                  fontFamily: FONT,
                  gap: 2,
                  opacity: past ? 0.35 : 1,
                }}
              >
                <span style={{ fontSize: 13, fontWeight: dateFontWeight, color: dateColor, lineHeight: 1 }}>
                  {d.getDate()}
                </span>
                {open && !past && <PawIcon size={8} color="#26452B" />}
                {blocked && !past && <span style={{ fontSize: 10, color: '#8A7E72', lineHeight: 1 }}>blocked</span>}
              </button>
            )
          })}
        </div>

        {/* Legend */}
        <div style={{ backgroundColor: 'white', border: '1px solid #E8E2D9', borderRadius: 12, padding: '12px 16px', display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#E8F0E5', border: '1px solid #26452B', display: 'inline-block', flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: '#3B2A1F', fontFamily: FONT }}>Open</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#EEE9E0', border: '1px solid #C0B8AE', display: 'inline-block', flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: '#3B2A1F', fontFamily: FONT }}>Blocked</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: 'white', border: '1px solid #E8E2D9', display: 'inline-block', flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: '#3B2A1F', fontFamily: FONT }}>Unset</span>
          </span>
        </div>

        {/* Editor */}
        {selected && (
          <div style={{ backgroundColor: 'white', border: '1px solid #E8E2D9', borderRadius: 16, padding: 20 }}>
            <p style={{ fontSize: 18, fontWeight: 700, color: '#3B2A1F', fontFamily: FONT, margin: '0 0 16px' }}>{formatFull(selected)}</p>

            {/* Open / Blocked toggle */}
            <div style={{ display: 'flex', marginBottom: 20 }}>
              {(['open', 'blocked'] as const).map(s => {
                const isSelected = status === s
                const radius = s === 'open' ? '10px 0 0 10px' : '0 10px 10px 0'
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(s)}
                    style={{
                      flex: 1,
                      padding: '10px',
                      borderRadius: radius,
                      border: 'none',
                      backgroundColor: isSelected ? '#26452B' : '#EEE9E0',
                      color: isSelected ? 'white' : '#8A7E72',
                      fontSize: 14,
                      fontWeight: 500,
                      fontFamily: FONT,
                      cursor: 'pointer',
                      textTransform: 'capitalize',
                    }}
                  >
                    {s}
                  </button>
                )
              })}
            </div>

            {status === 'open' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 16 }}>
                {/* Zones */}
                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 700, color: '#3B2A1F', fontFamily: FONT, marginBottom: 10 }}>
                    Zones running this day
                  </label>
                  {zones.length === 0 ? (
                    <p style={{ fontSize: 13, color: '#8A7E72', fontFamily: FONT }}>No zones configured.</p>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {zones.map(z => {
                        const sel = zoneSel.includes(z.id)
                        return (
                          <button
                            key={z.id}
                            type="button"
                            onClick={() => toggleZone(z.id)}
                            style={{
                              padding: '6px 14px',
                              borderRadius: 20,
                              border: sel ? 'none' : '1px solid #E8E2D9',
                              backgroundColor: sel ? '#26452B' : 'white',
                              color: sel ? 'white' : '#3B2A1F',
                              fontSize: 13,
                              fontWeight: 500,
                              fontFamily: FONT,
                              cursor: 'pointer',
                            }}
                          >
                            {z.name}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Destination */}
                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 700, color: '#3B2A1F', fontFamily: FONT, marginBottom: 6 }}>
                    Destination (optional)
                  </label>
                  <input
                    type="text" value={destination} onChange={e => setDestination(e.target.value)}
                    placeholder="e.g. Bogd Khan ridge"
                    style={{ width: '100%', borderRadius: 10, border: '1px solid #E8E2D9', padding: '10px 12px', fontSize: 14, color: '#171717', WebkitTextFillColor: '#171717', backgroundColor: 'white', fontFamily: FONT, boxSizing: 'border-box', outline: 'none' }}
                  />
                </div>

                {/* Capacity */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label style={{ fontSize: 14, fontWeight: 700, color: '#3B2A1F', fontFamily: FONT }}>
                    Capacity (dogs)
                  </label>
                  <input
                    type="number" min={1} value={capacity}
                    onChange={e => setCapacity(Math.max(1, parseInt(e.target.value) || 1))}
                    style={{ width: 72, borderRadius: 10, border: '1px solid #E8E2D9', padding: '8px', fontSize: 14, color: '#171717', WebkitTextFillColor: '#171717', backgroundColor: 'white', fontFamily: FONT, textAlign: 'right', outline: 'none' }}
                  />
                </div>

                {/* Allow over capacity */}
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox" checked={allowOver} onChange={e => setAllowOver(e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: '#26452B', flexShrink: 0 }}
                  />
                  <span style={{ fontSize: 14, color: '#3B2A1F', fontFamily: FONT }}>Allow booking over capacity</span>
                </label>

                {/* Note to clients */}
                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 700, color: '#3B2A1F', fontFamily: FONT, marginBottom: 6 }}>
                    Note to clients (optional)
                  </label>
                  <textarea
                    value={note} onChange={e => setNote(e.target.value)} rows={2}
                    placeholder="e.g. Bring extra water — long route"
                    style={{ width: '100%', borderRadius: 10, border: '1px solid #E8E2D9', padding: '10px 12px', fontSize: 14, color: '#171717', WebkitTextFillColor: '#171717', backgroundColor: 'white', fontFamily: FONT, resize: 'none', boxSizing: 'border-box', outline: 'none' }}
                  />
                </div>
              </div>
            )}

            {error && <p style={{ color: '#ef4444', fontSize: 13, marginBottom: 12, fontFamily: FONT }}>{error}</p>}

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setSelected(null)}
                style={{ flex: 1, padding: '12px 24px', borderRadius: 12, border: '1px solid #E8E2D9', backgroundColor: 'white', color: '#3B2A1F', fontSize: 14, fontWeight: 500, fontFamily: FONT, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving || (status === 'open' && zoneSel.length === 0)}
                style={{ flex: 1, padding: '12px 24px', borderRadius: 12, border: 'none', backgroundColor: '#26452B', color: 'white', fontSize: 14, fontWeight: 600, fontFamily: FONT, cursor: saving || (status === 'open' && zoneSel.length === 0) ? 'not-allowed' : 'pointer', opacity: saving || (status === 'open' && zoneSel.length === 0) ? 0.5 : 1 }}
              >
                {saving ? 'Saving…' : status === 'open' ? 'Open day' : 'Block day'}
              </button>
            </div>
            {status === 'open' && zoneSel.length === 0 && (
              <p style={{ fontSize: 12, color: '#8A7E72', fontFamily: FONT, marginTop: 8 }}>Select at least one zone to open the day.</p>
            )}
          </div>
        )}

      </div>
    </main>
  )
}
