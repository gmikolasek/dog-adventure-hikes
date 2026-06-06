'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { getWeeklyRevenue, PRICE_PER_HIKE, type WeeklyRevenueData } from '@/lib/adminData'
import { formatShort } from '@/lib/booking'

// ── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  bg:          '#F5F0E8',
  forestGreen: '#26452B',
  moss:        '#4D6B46',
  orange:      '#E08A3E',
  rust:        '#C1562D',
  sand:        '#E6C89A',
  brown:       '#3B2A1F',
  cardBorder:  '#E8E2D9',
  divider:     '#F0EBE3',
  muted:       '#8A7E72',
  badgeBg:     '#EEE9E0',
} as const

const FONT = "'Noto Sans', system-ui, sans-serif"

export default function RevenuePage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [data, setData] = useState<WeeklyRevenueData | null>(null)

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

      setData(await getWeeklyRevenue())
      setReady(true)
    }
    load()
  }, [router])

  if (!ready) {
    return (
      <main style={{ backgroundColor: T.bg, fontFamily: FONT }} className="min-h-screen flex items-center justify-center px-4">
        <p style={{ color: T.muted }} className="text-sm">Loading…</p>
      </main>
    )
  }

  const d = data!
  const weekLabel = `${formatShort(d.weekMon)} – ${formatShort(d.weekSun)}`

  return (
    <main style={{ backgroundColor: T.bg, fontFamily: FONT }} className="min-h-screen px-4 py-10">
      <div className="w-full max-w-sm mx-auto">

        {/* ── Header ── */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.push('/staff')}
            style={{ backgroundColor: T.cardBorder, color: T.forestGreen }}
            className="inline-flex items-center justify-center w-9 h-9 rounded-full text-lg leading-none flex-shrink-0"
          >
            ←
          </button>
          <div
            style={{ backgroundColor: `${T.forestGreen}18` }}
            className="inline-flex items-center justify-center w-10 h-10 rounded-full flex-shrink-0"
          >
            <span className="text-xl">💰</span>
          </div>
          <h1 style={{ color: T.brown, fontWeight: 700, fontFamily: FONT }} className="text-lg leading-tight">
            Revenue
          </h1>
        </div>

        {/* ── Hero revenue card ── */}
        <div
          style={{ backgroundColor: T.forestGreen, borderRadius: 16 }}
          className="p-5 mb-4"
        >
          <p style={{ color: T.sand, fontFamily: FONT }} className="text-xs">This week&apos;s revenue</p>
          <p style={{ fontFamily: FONT, fontWeight: 700 }} className="text-3xl text-white mt-1">
            ₮{d.totalRevenue.toLocaleString()}
          </p>
          <p style={{ color: 'rgba(255,255,255,0.65)', fontFamily: FONT }} className="text-xs mt-1">
            {weekLabel}
          </p>
        </div>

        {/* ── Bookings this week ── */}
        <section className="mb-4">
          <SectionHeader title="Bookings this week" count={d.bookings.length} countLabel="total" />
          {d.bookings.length === 0 ? (
            <p style={{ color: T.muted }} className="text-sm px-1">No confirmed bookings this week.</p>
          ) : (
            <div style={{ backgroundColor: '#fff', borderRadius: 16, border: `1px solid ${T.cardBorder}`, overflow: 'hidden' }}>
              {d.bookings.map((b, i) => {
                const isTrailPack = b.amountCharged > PRICE_PER_HIKE
                const isCredit = b.creditUsed > 0
                return (
                  <div
                    key={b.id}
                    style={i > 0 ? { borderTop: `1px solid ${T.divider}` } : undefined}
                    className="px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p style={{ color: T.brown, fontWeight: 700, fontFamily: FONT }} className="text-sm">
                          {b.dogName}
                        </p>
                        <p style={{ color: T.moss, fontWeight: 500 }} className="text-xs mt-0.5">
                          {b.ownerName ?? '—'}
                        </p>
                        <p style={{ color: T.muted }} className="text-xs mt-0.5">
                          {formatShort(b.hikeDate)}
                          {b.pickupMethod && <span> · {b.pickupMethod}</span>}
                        </p>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        {isCredit ? (
                          <span
                            style={{ backgroundColor: `${T.moss}18`, color: T.moss, borderRadius: 20, fontFamily: FONT }}
                            className="inline-flex items-center px-2.5 py-0.5 text-xs font-medium"
                          >
                            Credit used
                          </span>
                        ) : isTrailPack ? (
                          <>
                            <p style={{ color: T.brown, fontWeight: 700 }} className="text-sm">
                              ₮{b.amountCharged.toLocaleString()}
                            </p>
                            <p style={{ color: T.orange }} className="text-[11px] mt-0.5">Trail Pack · 4 hikes</p>
                          </>
                        ) : (
                          <p style={{ color: T.brown, fontWeight: 700 }} className="text-sm">
                            ₮{b.amountCharged.toLocaleString()}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* ── Trail Pack holders ── */}
        <section className="mb-4">
          <SectionHeader title="Trail Pack holders" count={d.trailPackHolders.length} countLabel="active" />
          {d.trailPackHolders.length === 0 ? (
            <p style={{ color: T.muted }} className="text-sm px-1">No active Trail Pack credits.</p>
          ) : (
            <div style={{ backgroundColor: '#fff', borderRadius: 16, border: `1px solid ${T.cardBorder}`, overflow: 'hidden' }}>
              {d.trailPackHolders.map((tp, i) => (
                <div
                  key={tp.id}
                  style={i > 0 ? { borderTop: `1px solid ${T.divider}` } : undefined}
                  className="px-4 py-3 flex items-center justify-between"
                >
                  <div className="min-w-0">
                    <p style={{ color: T.brown, fontWeight: 700 }} className="text-sm">
                      {tp.ownerName ?? '—'}
                    </p>
                    {tp.expiresAt && (
                      <p style={{ color: T.muted }} className="text-xs mt-0.5">
                        Expires {formatShort(tp.expiresAt.slice(0, 10))}
                      </p>
                    )}
                  </div>
                  <span
                    style={{ backgroundColor: T.forestGreen, color: '#fff', borderRadius: 20, fontFamily: FONT, fontWeight: 600, padding: '4px 12px', whiteSpace: 'nowrap' }}
                    className="text-xs flex-shrink-0 ml-3"
                  >
                    {tp.creditsRemaining} credit{tp.creditsRemaining !== 1 ? 's' : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Exceptions this week ── */}
        <section className="pb-10">
          <SectionHeader title="Exceptions this week" count={d.exceptions.length} countLabel="total" />
          {d.exceptions.length === 0 ? (
            <p style={{ color: T.muted }} className="text-sm px-1">No cancellations or no-shows this week.</p>
          ) : (
            <div style={{ backgroundColor: '#fff', borderRadius: 16, border: `1px solid ${T.cardBorder}`, overflow: 'hidden' }}>
              {d.exceptions.map((ex, i) => (
                <div
                  key={ex.id}
                  style={i > 0 ? { borderTop: `1px solid ${T.divider}` } : undefined}
                  className="px-4 py-3 flex items-start justify-between gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <p style={{ color: T.brown, fontWeight: 700 }} className="text-sm">{ex.dogName}</p>
                    <p style={{ color: T.moss, fontWeight: 500 }} className="text-xs mt-0.5">{ex.ownerName ?? '—'}</p>
                    <p style={{ color: T.muted }} className="text-xs mt-0.5">{formatShort(ex.hikeDate)}</p>
                  </div>
                  <span
                    style={ex.status === 'no_show'
                      ? { backgroundColor: '#FBE9E3', color: T.rust, borderRadius: 20, fontFamily: FONT }
                      : { backgroundColor: '#FEF3E2', color: T.orange, borderRadius: 20, fontFamily: FONT }
                    }
                    className="inline-flex items-center px-2.5 py-1 text-xs font-medium flex-shrink-0"
                  >
                    {ex.status === 'no_show' ? 'No-show' : 'Cancelled'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

      </div>
    </main>
  )
}

function SectionHeader({ title, count, countLabel }: { title: string; count: number; countLabel: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div style={{ width: 3, height: 16, backgroundColor: T.forestGreen, borderRadius: 2, flexShrink: 0 }} />
      <h2 style={{ color: T.brown, fontWeight: 700, fontFamily: FONT }} className="text-sm">
        {title}
      </h2>
      {count > 0 && (
        <span
          style={{ backgroundColor: T.badgeBg, color: T.moss, borderRadius: 20, fontFamily: FONT }}
          className="px-2 py-0.5 text-[12px] font-medium"
        >
          {count} {countLabel}
        </span>
      )}
    </div>
  )
}
