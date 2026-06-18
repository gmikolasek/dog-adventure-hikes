'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { getClients, getWeeklyMetrics, type ClientRow, type WeeklyMetrics } from '@/lib/adminData'
import { exportClientsToExcel } from '@/lib/excelExport'

// ── Design tokens ──────────────────────────────────────────────────────────────
const T = {
  bg:          '#F5F0E8',
  forest:      '#26452B',
  moss:        '#4D6B46',
  orange:      '#E08A3E',
  sand:        '#E6C89A',
  brown:       '#3B2A1F',
  cardBorder:  '#E8E2D9',
  badgeBg:     '#EEE9E0',
  muted:       '#8A7E72',
  completeBg:  '#E8F0E5',
} as const
const FONT = "'Noto Sans', system-ui, sans-serif"

// ── SVG icons ──────────────────────────────────────────────────────────────────
function IconPaw({ size = 18, color = 'currentColor' }: { size?: number; color?: string }) {
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
function IconCalendar({ size = 18, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="17" rx="2"/>
      <line x1="3"  y1="9"  x2="21" y2="9"/>
      <line x1="8"  y1="2"  x2="8"  y2="6"/>
      <line x1="16" y1="2"  x2="16" y2="6"/>
    </svg>
  )
}
function IconClock({ size = 18, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9"/>
      <polyline points="12 7 12 12 15 15"/>
    </svg>
  )
}
function IconGroup({ size = 18, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="7" r="3"/>
      <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/>
      <circle cx="17" cy="7" r="2.5"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
    </svg>
  )
}
function IconAlert({ size = 18, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9"  x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  )
}
function IconDownload({ size = 18, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  )
}
function IconChevronRight({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  )
}
function IconMountain({ size = 18, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 20 9 9 13 14 16 11 21 20"/>
      <line x1="3" y1="20" x2="21" y2="20"/>
    </svg>
  )
}

// ── Small icon bubble helper ───────────────────────────────────────────────────
function IconBubble({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: T.badgeBg, flexShrink: 0 }}
      className="inline-flex items-center justify-center">
      {children}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function StaffDashboard() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [staffName, setStaffName] = useState('')
  const [clients, setClients] = useState<ClientRow[]>([])
  const [metrics, setMetrics] = useState<WeeklyMetrics>({ hikesThisWeek: 0, revenueThisWeek: 0, bookingsCount: 0 })
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/'); return }

      const { data: profile } = await supabase
        .from('users')
        .select('name, role')
        .eq('id', session.user.id)
        .maybeSingle()
      if (profile?.role !== 'staff') { router.push('/onboarding'); return }
      setStaffName(profile.name ?? '')

      const [clientsData, metricsData] = await Promise.all([
        getClients(),
        getWeeklyMetrics(),
      ])
      setClients(clientsData)
      setMetrics(metricsData)

      setReady(true)
    }
    load()
  }, [router])

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/')
  }

  async function handleExport() {
    setExporting(true)
    try {
      await exportClientsToExcel(clients)
    } finally {
      setExporting(false)
    }
  }

  if (!ready) {
    return (
      <main style={{ backgroundColor: T.bg, fontFamily: FONT }} className="min-h-screen flex items-center justify-center px-4">
        <p style={{ color: T.muted }} className="text-sm">Loading…</p>
      </main>
    )
  }

  const pendingDogs = clients.flatMap(c => c.dogs).filter(d => d.approval_status === 'pending').length
  const activeClients = clients.filter(c => c.status === 'active').length

  return (
    <main style={{ backgroundColor: T.bg, fontFamily: FONT }} className="min-h-screen px-4 py-10">
      <div className="w-full max-w-sm mx-auto">

        {/* ── Header ── */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            {/* Circular avatar */}
            <div style={{ width: 44, height: 44, borderRadius: '50%', backgroundColor: T.forest, flexShrink: 0 }}
              className="inline-flex items-center justify-center">
              <IconPaw size={20} color="#fff" />
            </div>
            <div>
              <h1 style={{ color: T.brown, fontWeight: 700, fontFamily: FONT }} className="text-lg leading-tight">
                {staffName ? `Hi, ${staffName}` : 'Staff'}
              </h1>
              <p style={{ color: T.muted, fontSize: 13 }}>Dog Adventure Hikes · Staff</p>
            </div>
          </div>
          <button onClick={signOut} style={{ color: T.muted, fontSize: 13, fontFamily: FONT }}>
            Sign out
          </button>
        </div>

        {/* ── Hero revenue card ── */}
        <button
          onClick={() => router.push('/staff/revenue')}
          style={{ backgroundColor: T.forest, borderRadius: 16, width: '100%', textAlign: 'left' }}
          className="p-5 mb-4 block"
        >
          <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, fontFamily: FONT }}>This week&apos;s revenue</p>
          <p style={{ color: '#fff', fontWeight: 700, fontSize: 30, fontFamily: FONT }} className="mt-1">
            ₮{metrics.revenueThisWeek.toLocaleString()}
          </p>
          <p style={{ color: T.sand, fontSize: 12, fontFamily: FONT }} className="mt-1">
            {metrics.hikesThisWeek} hike{metrics.hikesThisWeek !== 1 ? 's' : ''} · ₮50,000 each
          </p>
        </button>

        {/* ── Stat grid ── */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <Stat value={metrics.bookingsCount} label="Bookings this week" icon={<IconCalendar size={16} color={T.moss} />} onClick={() => router.push('/staff/hikes')} />
          <Stat value={activeClients}         label="Active clients"      icon={<IconPaw      size={16} color={T.moss} />} onClick={() => router.push('/staff/clients')} />
          <Stat value={pendingDogs}            label="Pending approvals"   icon={<IconClock    size={16} color={T.moss} />} onClick={() => router.push('/staff/approvals')} />
          <Stat value={clients.length}         label="Total clients"       icon={<IconGroup    size={16} color={T.moss} />} onClick={() => router.push('/staff/clients')} />
        </div>

        {/* ── Quick actions ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 40 }}>
          <ActionRow
            title="Hikes"
            subtitle="Upcoming schedule and past hike history"
            icon={<IconMountain size={16} color={T.moss} />}
            onClick={() => router.push('/staff/hikes')}
          />
          <ActionRow
            title="New dog approvals"
            subtitle="Review, approve and assign zones"
            badge={pendingDogs}
            icon={<IconPaw size={16} color={T.moss} />}
            onClick={() => router.push('/staff/approvals')}
          />
          <ActionRow
            title="Calendar"
            subtitle="Open or block hiking days"
            icon={<IconCalendar size={16} color={T.moss} />}
            onClick={() => router.push('/staff/calendar')}
          />
          <ActionRow
            title="Client management"
            subtitle="View profiles, change zones"
            icon={<IconGroup size={16} color={T.moss} />}
            onClick={() => router.push('/staff/clients')}
          />
          <ActionRow
            title="Exceptions log"
            subtitle="Cancellations, no-shows, holding fees"
            icon={<IconAlert size={16} color={T.moss} />}
            onClick={() => router.push('/staff/exceptions')}
          />
          {/* Export — separate button to carry disabled state */}
          <button
            onClick={handleExport}
            disabled={exporting}
            style={{ backgroundColor: '#fff', border: `1px solid ${T.cardBorder}`, borderRadius: 12, padding: '14px 16px', textAlign: 'left', width: '100%', opacity: exporting ? 0.5 : 1, fontFamily: FONT }}
            className="flex items-center gap-3"
          >
            <IconBubble><IconDownload size={16} color={T.moss} /></IconBubble>
            <div className="flex-1 min-w-0">
              <span style={{ display: 'block', fontWeight: 700, color: T.brown, fontSize: 14 }}>Export to Excel</span>
              <span style={{ display: 'block', color: T.muted, fontSize: 13, marginTop: 2 }}>Download all client &amp; booking data</span>
            </div>
            <IconChevronRight size={16} color={exporting ? T.muted : T.moss} />
          </button>
        </div>

      </div>
    </main>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Stat({ value, label, icon, onClick }: { value: number; label: string; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{ backgroundColor: '#fff', border: `1px solid ${T.cardBorder}`, borderRadius: 12, padding: 16, textAlign: 'left', width: '100%', fontFamily: FONT, color: T.forest }}
    >
      <IconBubble>{icon}</IconBubble>
      <p style={{ color: '#26452B', fontWeight: 700, fontSize: 28, fontFamily: FONT, marginTop: 8, lineHeight: 1 }}>
        {value}
      </p>
      <p style={{ color: T.muted, fontSize: 13, marginTop: 4 }}>{label}</p>
    </button>
  )
}

function ActionRow({ title, subtitle, badge, icon, onClick }: {
  title: string; subtitle: string; badge?: number; icon: React.ReactNode; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{ backgroundColor: '#fff', border: `1px solid ${T.cardBorder}`, borderRadius: 12, padding: '14px 16px', textAlign: 'left', width: '100%', fontFamily: FONT }}
      className="flex items-center gap-3"
    >
      <IconBubble>{icon}</IconBubble>
      <div className="flex-1 min-w-0">
        <span style={{ display: 'block', fontWeight: 700, color: T.brown, fontSize: 14 }}>{title}</span>
        <span style={{ display: 'block', color: T.muted, fontSize: 13, marginTop: 2 }}>{subtitle}</span>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {badge !== undefined && badge > 0 && (
          <span style={{ backgroundColor: T.forest, color: '#fff', borderRadius: 20, fontSize: 12, fontWeight: 600, padding: '2px 8px', fontFamily: FONT }}>
            {badge}
          </span>
        )}
        <IconChevronRight size={16} color={T.moss} />
      </div>
    </button>
  )
}

export function ClientStatusBadge({ status }: { status: 'active' | 'pending' | 'incomplete' | 'rejected' }) {
  const map = {
    active:     { label: 'Active',     cls: 'bg-green-100 text-green-700' },
    pending:    { label: 'Pending',    cls: 'bg-amber-100 text-amber-700' },
    incomplete: { label: 'Incomplete', cls: 'bg-gray-100 text-gray-500' },
    rejected:   { label: 'Rejected',   cls: 'bg-red-100 text-red-700' },
  }
  const s = map[status]
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium flex-shrink-0 ${s.cls}`}>
      {s.label}
    </span>
  )
}
