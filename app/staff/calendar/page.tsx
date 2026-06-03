'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import {
  twoWeekDates, isoDate, todayIso, formatFull,
  DEFAULT_CAPACITY, type HikeDay, type HikeDayStatus,
} from '@/lib/booking'

type Zone = { id: string; name: string }

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

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

  const dates = twoWeekDates()
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
      <main className="min-h-screen bg-white flex items-center justify-center px-6">
        <p className="text-sm text-gray-400">Loading…</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-white px-6 py-10">
      <div className="w-full max-w-sm mx-auto">

        <button onClick={() => router.push('/staff')} className="text-sm text-gray-500 hover:text-gray-700 mb-6">
          ← Dashboard
        </button>

        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">Calendar</h1>
          <p className="text-gray-500 mt-1 text-sm">Open or block the next two weeks</p>
        </div>

        {/* Weekday header */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEKDAYS.map(w => (
            <div key={w} className="text-center text-[11px] text-gray-400">{w}</div>
          ))}
        </div>

        {/* 2-week grid */}
        <div className="grid grid-cols-7 gap-1 mb-6">
          {dates.map(d => {
            const iso = isoDate(d)
            const day = days[iso]
            const past = iso < today
            const isSel = selected === iso
            const open = day?.status === 'open'
            const blocked = day?.status === 'blocked' || day?.status === 'cancelled'
            return (
              <button
                key={iso}
                type="button"
                disabled={past}
                onClick={() => selectDay(iso)}
                className={[
                  'aspect-square rounded-lg text-sm font-medium flex flex-col items-center justify-center transition-colors',
                  past ? 'text-gray-300 cursor-not-allowed' : 'hover:bg-gray-50',
                  isSel ? 'ring-2 ring-green-500' : '',
                  open ? 'bg-green-100 text-green-800' : blocked ? 'bg-gray-200 text-gray-500' : 'border border-gray-200 text-gray-700',
                ].join(' ')}
              >
                {d.getDate()}
                {open && <span className="w-1 h-1 rounded-full bg-green-600 mt-0.5" />}
                {blocked && <span className="text-[9px] leading-none">blocked</span>}
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-4 mb-6 text-[11px] text-gray-500">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-100 border border-green-200" /> Open</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gray-200" /> Blocked</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded border border-gray-200" /> Unset</span>
        </div>

        {/* Editor */}
        {selected && (
          <div className="rounded-2xl border border-gray-200 p-4">
            <p className="text-sm font-semibold text-gray-900 mb-3">{formatFull(selected)}</p>

            <div className="flex gap-2 mb-4">
              {(['open', 'blocked'] as const).map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                    status === s
                      ? s === 'open' ? 'bg-green-600 text-white' : 'bg-gray-700 text-white'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>

            {status === 'open' && (
              <div className="space-y-4 mb-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">Zones running this day</label>
                  {zones.length === 0 ? (
                    <p className="text-xs text-gray-400">No zones configured.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {zones.map(z => (
                        <button
                          key={z.id}
                          type="button"
                          onClick={() => toggleZone(z.id)}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                            zoneSel.includes(z.id)
                              ? 'bg-green-600 border-green-600 text-white'
                              : 'border-gray-300 text-gray-600 hover:border-green-400'
                          }`}
                        >
                          {z.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Destination (optional)</label>
                  <input
                    type="text" value={destination} onChange={e => setDestination(e.target.value)}
                    placeholder="e.g. Bogd Khan ridge"
                    className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-gray-700">Capacity (dogs)</label>
                  <input
                    type="number" min={1} value={capacity}
                    onChange={e => setCapacity(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-20 rounded-xl border border-gray-300 px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={allowOver} onChange={e => setAllowOver(e.target.checked)}
                    className="h-4 w-4 text-green-600 rounded border-gray-300" />
                  <span className="text-xs text-gray-700">Allow booking over capacity</span>
                </label>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Note to clients (optional)</label>
                  <textarea
                    value={note} onChange={e => setNote(e.target.value)} rows={2}
                    placeholder="e.g. Bring extra water — long route"
                    className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                  />
                </div>
              </div>
            )}

            {error && <p className="text-red-500 text-xs mb-3">{error}</p>}

            <div className="flex gap-2">
              <button
                onClick={() => setSelected(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-300 text-sm font-medium text-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving || (status === 'open' && zoneSel.length === 0)}
                className="flex-1 bg-green-600 text-white py-2.5 rounded-xl font-medium text-sm disabled:opacity-50 hover:bg-green-700 transition-colors"
              >
                {saving ? 'Saving…' : status === 'open' ? 'Open day' : 'Block day'}
              </button>
            </div>
            {status === 'open' && zoneSel.length === 0 && (
              <p className="text-[11px] text-gray-400 mt-2">Select at least one zone to open the day.</p>
            )}
          </div>
        )}

      </div>
    </main>
  )
}
