'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { exportRevenueReport } from '@/lib/excelExport'

// ── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  bg:         '#F5F0E8',
  forest:     '#26452B',
  moss:       '#4D6B46',
  brown:      '#3B2A1F',
  cardBorder: '#E8E2D9',
  muted:      '#8A7E72',
  badgeBg:    '#EEE9E0',
  completeBg: '#E8F0E5',
} as const
const FONT = "'Noto Sans', system-ui, sans-serif"

// ── Types ────────────────────────────────────────────────────────────────────
type Summary = { total: number; count: number }
type PeriodType = 'month' | 'quarter' | 'year'

// ── Date helpers ──────────────────────────────────────────────────────────────
function localIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function todayIso(): string { return localIso(new Date()) }
function monthRange(): [string, string] {
  const n = new Date(), y = n.getFullYear(), m = n.getMonth() + 1
  return [`${y}-${String(m).padStart(2, '0')}-01`, localIso(new Date(y, m, 0))]
}
function quarterRange(): [string, string] {
  const n = new Date(), y = n.getFullYear(), q = Math.ceil((n.getMonth() + 1) / 3)
  const sm = (q - 1) * 3 + 1, em = q * 3
  return [`${y}-${String(sm).padStart(2, '0')}-01`, localIso(new Date(y, em, 0))]
}
function ytdRange(): [string, string] {
  return [`${new Date().getFullYear()}-01-01`, todayIso()]
}
function fmtMnt(n: number): string { return `₮${n.toLocaleString()}` }
function monthLabel(): string {
  return new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}
function quarterLabel(): string {
  const n = new Date()
  return `Q${Math.ceil((n.getMonth() + 1) / 3)} ${n.getFullYear()}`
}

// ── Period option generators ──────────────────────────────────────────────────
function getMonthOptions() {
  const n = new Date()
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(n.getFullYear(), n.getMonth() - i, 1)
    return {
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    }
  })
}
function getQuarterOptions() {
  const n = new Date()
  const curY = n.getFullYear(), curQ = Math.ceil((n.getMonth() + 1) / 3)
  return Array.from({ length: 6 }, (_, i) => {
    let q = curQ - i, y = curY
    while (q <= 0) { q += 4; y-- }
    const sm = (q - 1) * 3 + 1, em = q * 3
    return {
      label: `Q${q} ${y}`,
      value: `${y}-Q${q}`,
      start: `${y}-${String(sm).padStart(2, '0')}-01`,
      end:   localIso(new Date(y, em, 0)),
    }
  })
}
function getYearOptions() {
  const curY = new Date().getFullYear()
  return Array.from({ length: 4 }, (_, i) => {
    const y = curY - i
    return { label: String(y), value: String(y), start: `${y}-01-01`, end: `${y}-12-31` }
  })
}
function rangeForPeriod(type: PeriodType, value: string): [string, string] | null {
  if (!value) return null
  if (type === 'month') {
    const [ys, ms] = value.split('-')
    const y = parseInt(ys), m = parseInt(ms)
    return [`${y}-${String(m).padStart(2, '0')}-01`, localIso(new Date(y, m, 0))]
  }
  if (type === 'quarter') {
    const opt = getQuarterOptions().find(o => o.value === value)
    return opt ? [opt.start, opt.end] : null
  }
  if (type === 'year') {
    const y = parseInt(value)
    return [`${y}-01-01`, `${y}-12-31`]
  }
  return null
}

// ── Supabase fetcher ──────────────────────────────────────────────────────────
async function fetchSummary(start: string, end: string): Promise<Summary> {
  const { data: dayRows } = await supabase.from('hike_days').select('id').gte('date', start).lte('date', end)
  const dayIds = (dayRows ?? []).map((d: { id: string }) => d.id)
  if (!dayIds.length) return { total: 0, count: 0 }
  const { data: bRows } = await supabase.from('bookings').select('amount_charged')
    .eq('status', 'confirmed').in('hike_day_id', dayIds)
  const rows = (bRows ?? []) as { amount_charged: number }[]
  return { total: rows.reduce((s, r) => s + (r.amount_charged ?? 0), 0), count: rows.length }
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function RevenuePage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)

  const [monthSumm,   setMonthSumm]   = useState<Summary | null>(null)
  const [quarterSumm, setQuarterSumm] = useState<Summary | null>(null)
  const [ytdSumm,     setYtdSumm]     = useState<Summary | null>(null)

  const [periodType,    setPeriodType]    = useState<PeriodType>('month')
  const [periodValue,   setPeriodValue]   = useState('')
  const [periodRange,   setPeriodRange]   = useState<[string, string] | null>(null)
  const [periodResult,  setPeriodResult]  = useState<Summary | null>(null)
  const [periodLoading, setPeriodLoading] = useState(false)

  const [customFrom,    setCustomFrom]    = useState('')
  const [customTo,      setCustomTo]      = useState('')
  const [customResult,  setCustomResult]  = useState<Summary | null>(null)
  const [customLoading, setCustomLoading] = useState(false)

  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/'); return }
      const { data: profile } = await supabase.from('users').select('role').eq('id', session.user.id).maybeSingle()
      if (profile?.role !== 'staff') { router.push('/onboarding'); return }

      // Fetch YTD hike_days once, compute month/quarter/YTD in JS
      const [yStart, yEnd] = ytdRange()
      const [mStart, mEnd] = monthRange()
      const [qStart, qEnd] = quarterRange()

      const { data: dayRows } = await supabase.from('hike_days').select('id, date').gte('date', yStart).lte('date', yEnd)
      const days = (dayRows ?? []) as { id: string; date: string }[]
      const dateById: Record<string, string> = {}
      for (const d of days) dateById[d.id] = d.date
      const dayIds = days.map(d => d.id)

      if (!dayIds.length) {
        setMonthSumm({ total: 0, count: 0 })
        setQuarterSumm({ total: 0, count: 0 })
        setYtdSumm({ total: 0, count: 0 })
      } else {
        const { data: bRows } = await supabase.from('bookings').select('hike_day_id, amount_charged')
          .eq('status', 'confirmed').in('hike_day_id', dayIds)
        const bookings = (bRows ?? []) as { hike_day_id: string; amount_charged: number }[]

        const ms: Summary = { total: 0, count: 0 }
        const qs: Summary = { total: 0, count: 0 }
        const ys: Summary = { total: 0, count: 0 }
        for (const b of bookings) {
          const d = dateById[b.hike_day_id]
          if (!d) continue
          const amt = b.amount_charged ?? 0
          ys.total += amt; ys.count++
          if (d >= mStart && d <= mEnd) { ms.total += amt; ms.count++ }
          if (d >= qStart && d <= qEnd) { qs.total += amt; qs.count++ }
        }
        setMonthSumm(ms)
        setQuarterSumm(qs)
        setYtdSumm(ys)
      }

      setReady(true)
    }
    load()
  }, [router])

  function changePeriodType(t: PeriodType) {
    setPeriodType(t)
    setPeriodValue('')
    setPeriodResult(null)
    setPeriodRange(null)
  }

  async function handlePeriodSelect(val: string) {
    setPeriodValue(val)
    setPeriodResult(null)
    setPeriodRange(null)
    if (!val) return
    const range = rangeForPeriod(periodType, val)
    if (!range) return
    setPeriodRange(range)
    setPeriodLoading(true)
    const result = await fetchSummary(range[0], range[1])
    setPeriodResult(result)
    setPeriodLoading(false)
  }

  async function handleCustomFetch() {
    if (!customFrom || !customTo || customFrom > customTo) return
    setCustomResult(null)
    setCustomLoading(true)
    const result = await fetchSummary(customFrom, customTo)
    setCustomResult(result)
    setCustomLoading(false)
  }

  async function handleExport() {
    let start: string, end: string
    if (customFrom && customTo && customFrom <= customTo) {
      [start, end] = [customFrom, customTo]
    } else if (periodRange) {
      [start, end] = periodRange
    } else {
      [start, end] = ytdRange()
    }
    setExporting(true)
    try { await exportRevenueReport(start, end) } finally { setExporting(false) }
  }

  if (!ready) {
    return (
      <main style={{ backgroundColor: T.bg, fontFamily: FONT, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: T.muted, fontSize: 14 }}>Loading…</p>
      </main>
    )
  }

  // Derive export range label
  let exportLabel = `Year to date (${new Date().getFullYear()})`
  if (customFrom && customTo && customFrom <= customTo) {
    exportLabel = `${customFrom} → ${customTo}`
  } else if (periodRange && periodValue) {
    exportLabel = periodValue
  }

  const periodOpts = periodType === 'month' ? getMonthOptions()
    : periodType === 'quarter' ? getQuarterOptions()
    : getYearOptions()

  const today = new Date()
  const ytdSubLabel = `Jan 1 – ${today.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`

  return (
    <main style={{ backgroundColor: T.bg, fontFamily: FONT, minHeight: '100vh', padding: '40px 20px 60px' }}>
      <div style={{ width: '100%', maxWidth: 384, margin: '0 auto' }}>

        {/* Back + title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button
            onClick={() => router.push('/staff')}
            style={{ width: 32, height: 32, borderRadius: '50%', backgroundColor: T.cardBorder, border: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, padding: 0 }}
          >
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={T.forest} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
          </button>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: T.brown, fontFamily: FONT, margin: 0 }}>Revenue</h1>
        </div>

        {/* ── Summary cards ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 28 }}>
          <SummaryCard label="This Month"    sub={monthLabel()}    summary={monthSumm} />
          <SummaryCard label="This Quarter"  sub={quarterLabel()}  summary={quarterSumm} />
          <SummaryCard label="Year to Date"  sub={ytdSubLabel}     summary={ytdSumm} />
        </div>

        {/* ── View other periods ── */}
        <div style={{ marginBottom: 24 }}>
          <SectionBar title="View other periods" />

          {/* Period type toggle */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            {(['month', 'quarter', 'year'] as PeriodType[]).map(t => (
              <button
                key={t}
                onClick={() => changePeriodType(t)}
                style={{
                  flex: 1,
                  padding: '8px 0',
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: FONT,
                  border: periodType === t ? `2px solid ${T.forest}` : `1px solid ${T.cardBorder}`,
                  backgroundColor: periodType === t ? T.completeBg : 'white',
                  color: periodType === t ? T.forest : T.muted,
                  cursor: 'pointer',
                }}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          <select
            value={periodValue}
            onChange={e => handlePeriodSelect(e.target.value)}
            style={{ width: '100%', borderRadius: 10, border: `1px solid ${T.cardBorder}`, padding: '12px', fontSize: 14, color: '#171717', WebkitTextFillColor: '#171717', backgroundColor: 'white', outline: 'none', fontFamily: FONT, boxSizing: 'border-box' } as React.CSSProperties}
          >
            <option value="">Select a {periodType}…</option>
            {periodOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>

          {periodLoading && <p style={{ fontSize: 13, color: T.muted, fontFamily: FONT, marginTop: 8 }}>Loading…</p>}
          {periodResult && !periodLoading && <ResultDisplay summary={periodResult} />}
        </div>

        {/* ── Custom date range ── */}
        <div style={{ marginBottom: 28 }}>
          <SectionBar title="Custom range" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: T.muted, fontFamily: FONT, marginBottom: 6 }}>From</label>
              <input
                type="date" value={customFrom}
                onChange={e => { setCustomFrom(e.target.value); setCustomResult(null) }}
                style={{ width: '100%', borderRadius: 10, border: `1px solid ${T.cardBorder}`, padding: '10px 12px', fontSize: 14, color: '#171717', WebkitTextFillColor: '#171717', backgroundColor: 'white', outline: 'none', fontFamily: FONT, boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: T.muted, fontFamily: FONT, marginBottom: 6 }}>To</label>
              <input
                type="date" value={customTo}
                onChange={e => { setCustomTo(e.target.value); setCustomResult(null) }}
                style={{ width: '100%', borderRadius: 10, border: `1px solid ${T.cardBorder}`, padding: '10px 12px', fontSize: 14, color: '#171717', WebkitTextFillColor: '#171717', backgroundColor: 'white', outline: 'none', fontFamily: FONT, boxSizing: 'border-box' }}
              />
            </div>
          </div>
          <button
            onClick={handleCustomFetch}
            disabled={!customFrom || !customTo || customLoading}
            style={{ width: '100%', backgroundColor: T.badgeBg, color: T.forest, borderRadius: 10, padding: '10px', fontSize: 13, fontWeight: 600, fontFamily: FONT, border: 'none', cursor: !customFrom || !customTo ? 'not-allowed' : 'pointer', opacity: !customFrom || !customTo ? 0.5 : 1 }}
          >
            {customLoading ? 'Loading…' : 'View'}
          </button>
          {customResult && !customLoading && <ResultDisplay summary={customResult} />}
        </div>

        {/* ── Export ── */}
        <div style={{ backgroundColor: 'white', border: `1px solid ${T.cardBorder}`, borderRadius: 16, padding: 16 }}>
          <SectionBar title="Export to Excel" />
          <p style={{ fontSize: 12, color: T.muted, fontFamily: FONT, marginBottom: 12 }}>
            Range: <strong style={{ color: T.brown }}>{exportLabel}</strong>
          </p>
          <button
            onClick={handleExport}
            disabled={exporting}
            style={{ width: '100%', backgroundColor: T.forest, color: 'white', borderRadius: 12, padding: '14px', fontFamily: FONT, fontWeight: 600, fontSize: 14, border: 'none', cursor: exporting ? 'not-allowed' : 'pointer', opacity: exporting ? 0.6 : 1, marginBottom: 8 }}
          >
            {exporting ? 'Generating…' : 'Download .xlsx'}
          </button>
          <p style={{ fontSize: 11, color: T.muted, fontFamily: FONT, textAlign: 'center', margin: 0 }}>
            2 tabs: Transactions · Client Summary
          </p>
        </div>

      </div>
    </main>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionBar({ title }: { title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <div style={{ width: 3, height: 16, backgroundColor: T.forest, borderRadius: 2, flexShrink: 0 }} />
      <h2 style={{ fontSize: 14, fontWeight: 700, color: T.brown, fontFamily: FONT, margin: 0 }}>{title}</h2>
    </div>
  )
}

function SummaryCard({ label, sub, summary }: { label: string; sub: string; summary: Summary | null }) {
  return (
    <div style={{ backgroundColor: 'white', border: `1px solid ${T.cardBorder}`, borderRadius: 16, padding: 16, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
      <div>
        <p style={{ fontSize: 12, color: T.muted, fontFamily: FONT, margin: '0 0 4px' }}>{label}</p>
        <p style={{ fontSize: 24, fontWeight: 700, color: T.brown, fontFamily: FONT, margin: '0 0 4px' }}>
          {summary ? fmtMnt(summary.total) : '—'}
        </p>
        {summary && (
          <p style={{ fontSize: 12, color: T.moss, fontFamily: FONT, margin: 0 }}>
            {summary.count} booking{summary.count !== 1 ? 's' : ''}
          </p>
        )}
      </div>
      <p style={{ fontSize: 12, color: T.muted, fontFamily: FONT, margin: 0, textAlign: 'right', flexShrink: 0 }}>{sub}</p>
    </div>
  )
}

function ResultDisplay({ summary }: { summary: Summary }) {
  return (
    <div style={{ backgroundColor: T.completeBg, border: `1px solid ${T.cardBorder}`, borderRadius: 12, padding: '12px 16px', marginTop: 10 }}>
      <p style={{ fontSize: 22, fontWeight: 700, color: T.forest, fontFamily: FONT, margin: '0 0 2px' }}>
        {fmtMnt(summary.total)}
      </p>
      <p style={{ fontSize: 12, color: T.moss, fontFamily: FONT, margin: 0 }}>
        {summary.count} booking{summary.count !== 1 ? 's' : ''}
      </p>
    </div>
  )
}
