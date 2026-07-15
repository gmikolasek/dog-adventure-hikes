'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { getUserState, type Dog, type Profile } from '@/lib/userState'
import { formatShort, todayIso } from '@/lib/booking'

// ── Types ─────────────────────────────────────────────────────────────────────

type Zone = { name: string; description: string | null }
type BookingCard = {
  id: string
  hikeDayId: string
  date: string
  destination: string | null
  dogName: string
  pickup: string | null
  dropoff: string | null
  status: string
  droppedOffAt: string | null
}
type DogPackSummary = { dogId: string; dogName: string; total: number; soonestExpiry: string | null }
type NotifItem = { id: string; messageType: string; bookingId: string | null; createdAt: string }

// ── Design tokens ─────────────────────────────────────────────────────────────

const T = {
  bg:         '#F5F0E8',
  forest:     '#26452B',
  moss:       '#4D6B46',
  orange:     '#E08A3E',
  sand:       '#E6C89A',
  brown:      '#3B2A1F',
  cardBorder: '#E8E2D9',
  badgeBg:    '#EEE9E0',
  muted:      '#8A7E72',
  warmSand:   '#F5F0E0',
} as const

const FONT = "'Noto Sans', system-ui, sans-serif"

const NOTIF_MESSAGES: Record<string, string> = {
  pickups_starting: 'Pickups are starting — please be ready outside!',
  dropoffs_starting: 'Your dog is on the way home! 🐾',
  thirty_min: "We're about 30 minutes away 🐾",
  fifteen_min: 'About 15 minutes away 🐾',
  five_min: 'Almost there — 5 minutes! 🐾',
  arrived: "We've arrived! Please come get your dog 🐾",
}

function fmtNotifTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

function playBeep() {
  try {
    const ctx = new AudioContext()
    const beep = (t: number) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.3, t)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15)
      osc.start(t)
      osc.stop(t + 0.15)
    }
    beep(ctx.currentTime)
    beep(ctx.currentTime + 0.2)
  } catch { /* audio not supported */ }
}

function greetingText(firstName: string) {
  const h = new Date().getHours()
  const part = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'
  return firstName ? `Good ${part}, ${firstName}` : `Good ${part}`
}

// ── SVG icons ─────────────────────────────────────────────────────────────────

function IconPaw({ size = 18, color = T.moss }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <circle cx="5.5" cy="5.5" r="2.5" />
      <circle cx="18.5" cy="5.5" r="2.5" />
      <circle cx="3.5" cy="11" r="2" />
      <circle cx="20.5" cy="11" r="2" />
      <path d="M12 13c-2.5 0-6 2.5-6 6 0 1.5 1 2 2 2h8c1 0 2-.5 2-2 0-3.5-3.5-6-6-6z" />
    </svg>
  )
}

function IconCalendar({ size = 18, color = T.moss }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

function IconPin({ size = 18, color = T.moss }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  )
}

function IconPerson({ size = 18, color = T.moss }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

function IconSearch({ size = 18, color = T.moss }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

function IconTag({ size = 18, color = T.orange }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ClientHome() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [dogs, setDogs] = useState<Dog[]>([])
  const [zone, setZone] = useState<Zone | null>(null)
  const [upcoming, setUpcoming] = useState<BookingCard[]>([])
  const [past, setPast] = useState<BookingCard[]>([])
  const [pastOpen, setPastOpen] = useState(false)
  const [photoIndicatorDays, setPhotoIndicatorDays] = useState<Set<string>>(new Set())
  const [dogPackCredits, setDogPackCredits] = useState<DogPackSummary[]>([])
  const [todayNotifs, setTodayNotifs] = useState<NotifItem[]>([])
  const [banner, setBanner] = useState<NotifItem | null>(null)
  const [todayHikeDayId, setTodayHikeDayId] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/'); return }

      const state = await getUserState(session.user.id)
      setProfile(state.profile)
      setDogs(state.dogs)

      if (state.profile?.zone_id) {
        const { data: zoneRow } = await supabase
          .from('zones')
          .select('name, description')
          .eq('id', state.profile.zone_id)
          .maybeSingle()
        setZone(zoneRow as Zone | null)
      }

      const { data: bookingRows } = await supabase
        .from('bookings')
        .select('id, dog_id, hike_day_id, pickup_method, dropoff_method, status, dropped_off_at')
        .eq('owner_id', session.user.id)
        .in('status', ['confirmed', 'cancelled', 'no_show'])

      const bookings = bookingRows ?? []
      if (bookings.length) {
        const dayIds = [...new Set(bookings.map(b => b.hike_day_id))]
        const { data: dayRows } = await supabase
          .from('hike_days')
          .select('id, date, destination_override')
          .in('id', dayIds)

        const dayById: Record<string, { date: string; destination_override: string | null }> = {}
        for (const d of dayRows ?? []) dayById[d.id] = d

        const dogNameById: Record<string, string> = {}
        for (const dog of state.dogs) dogNameById[dog.id] = dog.name

        const today = todayIso()
        const upcomingList: BookingCard[] = []
        const pastList: BookingCard[] = []

        for (const b of bookings) {
          const day = dayById[b.hike_day_id]
          if (!day) continue
          const card: BookingCard = {
            id: b.id,
            hikeDayId: b.hike_day_id,
            date: day.date,
            destination: day.destination_override,
            dogName: dogNameById[b.dog_id] ?? 'Your dog',
            pickup: b.pickup_method,
            dropoff: b.dropoff_method,
            status: b.status,
            droppedOffAt: b.dropped_off_at ?? null,
          }
          if (b.status === 'confirmed' && !b.dropped_off_at && day.date >= today) {
            upcomingList.push(card)
          } else {
            pastList.push(card)
          }
        }

        upcomingList.sort((a, b) => a.date.localeCompare(b.date))
        pastList.sort((a, b) => b.date.localeCompare(a.date))

        const todayHikeId = upcomingList.find(u => u.date === today)?.hikeDayId ?? null
        if (todayHikeId) {
          setTodayHikeDayId(todayHikeId)
          const { data: notifRows } = await supabase
            .from('notifications')
            .select('id, message_type, booking_id, created_at')
            .eq('hike_day_id', todayHikeId)
            .order('created_at', { ascending: false })
            .limit(5)
          setTodayNotifs((notifRows ?? []).map((r: { id: string; message_type: string; booking_id: string | null; created_at: string }) => ({
            id: r.id,
            messageType: r.message_type,
            bookingId: r.booking_id,
            createdAt: r.created_at,
          })))
        }

        const pastDayIds = [...new Set(pastList.map(p => p.hikeDayId))]
        const dayIdsWithPhotos = new Set<string>()
        if (pastDayIds.length > 0) {
          const { data: photoRows } = await supabase
            .from('hike_photos')
            .select('hike_day_id')
            .in('hike_day_id', pastDayIds)
          for (const row of photoRows ?? []) {
            dayIdsWithPhotos.add(row.hike_day_id)
          }
        }
        setPhotoIndicatorDays(dayIdsWithPhotos)

        setUpcoming(upcomingList)
        setPast(pastList)
      }

      const nowIso = new Date().toISOString()
      const packList: DogPackSummary[] = []
      for (const dog of state.dogs) {
        const { data: creditRows } = await supabase
          .from('trail_pack_credits')
          .select('credits_remaining, expires_at')
          .eq('owner_id', session.user.id)
          .eq('dog_id', dog.id)
          .gt('credits_remaining', 0)
        const active = ((creditRows ?? []) as Array<{ credits_remaining: number; expires_at: string | null }>)
          .filter(r => !r.expires_at || r.expires_at > nowIso)
        if (active.length > 0) {
          const total = active.reduce((s, r) => s + r.credits_remaining, 0)
          const soonest = active.map(r => r.expires_at).filter(Boolean).sort()[0] ?? null
          packList.push({ dogId: dog.id, dogName: dog.name, total, soonestExpiry: soonest })
        }
      }
      setDogPackCredits(packList)

      setReady(true)
    }
    load()
  }, [router])

  useEffect(() => {
    if (!todayHikeDayId) return
    const channel = supabase
      .channel(`notifs:${todayHikeDayId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `hike_day_id=eq.${todayHikeDayId}`,
        },
        (payload) => {
          const row = payload.new as { id: string; message_type: string; booking_id: string | null; created_at: string }
          const item: NotifItem = {
            id: row.id,
            messageType: row.message_type,
            bookingId: row.booking_id,
            createdAt: row.created_at,
          }
          setTodayNotifs(prev => [item, ...prev].slice(0, 5))
          setBanner(item)
          playBeep()
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [todayHikeDayId])

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/')
  }

  if (!ready) {
    return (
      <main style={{ backgroundColor: T.bg, fontFamily: FONT }} className="min-h-screen flex items-center justify-center px-6">
        <p style={{ color: T.muted }} className="text-sm">Loading…</p>
      </main>
    )
  }

  const primary = dogs[0] as Dog | undefined
  const firstName = profile?.name?.split(' ')[0] ?? ''
  const nextHike = upcoming[0] ?? null
  const sameDateBookings = nextHike ? upcoming.filter(u => u.date === nextHike.date) : []
  const nextHikeDogNames = sameDateBookings.map(u => u.dogName)

  return (
    <main style={{ backgroundColor: T.bg, fontFamily: FONT }} className="min-h-screen px-5 pb-12">

      {/* ── In-app notification banner ── */}
      {banner && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, backgroundColor: T.forest, padding: '48px 16px 16px', boxShadow: '0 4px 20px rgba(0,0,0,0.25)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, maxWidth: 390, margin: '0 auto' }}>
            <p style={{ flex: 1, color: 'white', fontSize: 15, fontWeight: 600, fontFamily: FONT, margin: 0, lineHeight: 1.4 }}>
              {NOTIF_MESSAGES[banner.messageType] ?? banner.messageType}
            </p>
            <button
              onClick={() => setBanner(null)}
              style={{ color: 'rgba(255,255,255,0.6)', background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', lineHeight: 1, padding: 0, flexShrink: 0 }}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <div className="w-full max-w-sm mx-auto">

        {/* ── Greeting header ── */}
        <div className="flex items-start justify-between pt-12 pb-6">
          <div>
            <p style={{ color: T.muted, fontFamily: FONT }} className="text-sm mb-0.5">
              {greetingText(firstName)}
            </p>
            <h1 style={{ color: T.brown, fontWeight: 700, fontSize: 26, fontFamily: FONT }} className="leading-tight">
              {primary?.name ?? firstName ?? 'Hey there'} 🐾
            </h1>
            <p style={{ color: T.muted, fontFamily: FONT }} className="text-sm mt-0.5">
              Ready for an adventure?
            </p>
          </div>
          <button
            onClick={signOut}
            style={{ color: T.muted, fontFamily: FONT }}
            className="text-xs mt-1 flex-shrink-0"
          >
            Sign out
          </button>
        </div>

        {/* ── Next Hike hero card ── */}
        {nextHike ? (
          <div style={{ borderRadius: 16, overflow: 'hidden', minHeight: 200, position: 'relative', marginBottom: 20 }}>
            {/* Background */}
            {primary?.photo_url ? (
              <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${primary.photo_url})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
            ) : (
              <div style={{ position: 'absolute', inset: 0, backgroundColor: T.forest }} />
            )}
            {/* Gradient overlay */}
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.1) 60%, transparent 100%)' }} />
            {/* Content */}
            <div style={{ position: 'relative', padding: 20, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', minHeight: 200 }}>
              <p style={{ color: T.sand, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', fontFamily: FONT, marginBottom: 6 }}>
                NEXT HIKE
              </p>
              <p style={{ color: '#fff', fontWeight: 700, fontSize: 20, fontFamily: FONT, lineHeight: 1.2, marginBottom: 6 }}>
                {nextHike.destination ?? 'Trail run'}
              </p>
              {sameDateBookings.length > 1 && (
                <div className="flex items-center gap-1.5 mb-1">
                  <IconPaw size={13} color="rgba(255,255,255,0.85)" />
                  <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14, fontFamily: FONT }}>
                    {nextHikeDogNames.join(' + ')}
                  </p>
                </div>
              )}
              <div className="flex items-center gap-1.5 mb-1">
                <IconCalendar size={13} color="rgba(255,255,255,0.85)" />
                <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14, fontFamily: FONT }}>
                  {formatShort(nextHike.date)}
                </p>
              </div>
              {zone && (
                <div className="flex items-center gap-1.5 mb-5">
                  <IconPin size={13} color="rgba(255,255,255,0.85)" />
                  <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14, fontFamily: FONT }}>
                    {zone.name}
                  </p>
                </div>
              )}
              {!zone && <div style={{ marginBottom: 20 }} />}
              <div>
                <button
                  onClick={() => router.push(`/client/bookings/${nextHike.id}`)}
                  style={{ backgroundColor: T.orange, color: '#fff', borderRadius: 20, padding: '8px 20px', fontSize: 14, fontWeight: 600, fontFamily: FONT, border: 'none', cursor: 'pointer' }}
                >
                  View Booking
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ borderRadius: 16, overflow: 'hidden', backgroundColor: T.forest, minHeight: 180, position: 'relative', marginBottom: 20, padding: 24, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
            <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', fontFamily: FONT, marginBottom: 8 }}>
              NEXT HIKE
            </p>
            <p style={{ color: '#fff', fontWeight: 600, fontSize: 17, fontFamily: FONT, marginBottom: 16 }}>
              No hikes booked yet
            </p>
            <div>
              <button
                onClick={() => router.push('/client/book')}
                style={{ backgroundColor: T.orange, color: '#fff', borderRadius: 20, padding: '8px 20px', fontSize: 14, fontWeight: 600, fontFamily: FONT, border: 'none', cursor: 'pointer' }}
              >
                Book a Hike
              </button>
            </div>
          </div>
        )}

        {/* ── Quick Actions ── */}
        <div style={{ marginBottom: 20 }}>
          <p style={{ color: T.brown, fontWeight: 700, fontFamily: FONT, fontSize: 14, marginBottom: 10 }}>
            Quick Actions
          </p>
          <div className="grid grid-cols-3 gap-3">
            {([
              { label: 'My Dog',     icon: <IconPaw size={18} />,    href: '/client/profile' },
              { label: 'Find Hikes', icon: <IconSearch size={18} />, href: '/client/book' },
              { label: 'My Account', icon: <IconPerson size={18} />, href: '/client/history' },
            ] as const).map(({ label, icon, href }) => (
              <button
                key={label}
                onClick={() => router.push(href)}
                style={{ backgroundColor: '#fff', border: `1px solid ${T.cardBorder}`, borderRadius: 12, padding: '16px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, cursor: 'pointer' }}
              >
                <div style={{ width: 36, height: 36, borderRadius: '50%', backgroundColor: T.badgeBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {icon}
                </div>
                <p style={{ color: T.brown, fontSize: 12, fontFamily: FONT, lineHeight: 1.2, margin: 0 }}>{label}</p>
              </button>
            ))}
          </div>
        </div>

        {/* ── Hiking zone card ── */}
        <div
          style={{ backgroundColor: '#fff', border: `1px solid ${T.cardBorder}`, borderRadius: 12, padding: '12px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}
        >
          <div style={{ width: 36, height: 36, borderRadius: '50%', backgroundColor: T.badgeBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <IconPin size={18} />
          </div>
          <div className="min-w-0">
            <p style={{ color: T.muted, fontSize: 12, fontFamily: FONT }}>Your hiking zone</p>
            <p style={{ color: T.brown, fontWeight: 700, fontFamily: FONT, fontSize: 14 }} className="truncate">
              {zone?.name ?? 'Not assigned'}
            </p>
            {zone?.description && (
              <p style={{ color: T.muted, fontSize: 13, fontFamily: FONT }} className="truncate">
                {zone.description}
              </p>
            )}
          </div>
        </div>

        {/* ── Trail Pack cards (one per dog with credits) ── */}
        {dogPackCredits.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            {dogPackCredits.map(dp => (
              <button
                key={dp.dogId}
                onClick={() => router.push('/client/history')}
                style={{ backgroundColor: T.warmSand, border: `1px solid ${T.sand}`, borderRadius: 12, padding: '12px 14px', width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
              >
                <div style={{ width: 36, height: 36, borderRadius: '50%', backgroundColor: '#FEF3E2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <IconTag size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <p style={{ color: T.orange, fontSize: 12, fontWeight: 600, fontFamily: FONT }}>Trail Pack · {dp.dogName}</p>
                  <p style={{ color: T.brown, fontWeight: 700, fontSize: 18, fontFamily: FONT }}>
                    {dp.total} credit{dp.total !== 1 ? 's' : ''} remaining
                  </p>
                  {dp.soonestExpiry && (
                    <p style={{ color: T.muted, fontSize: 13, fontFamily: FONT }}>
                      Expires {new Date(dp.soonestExpiry).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  )}
                </div>
                <span style={{ color: T.orange, fontSize: 13, fontFamily: FONT, flexShrink: 0 }}>History →</span>
              </button>
            ))}
          </div>
        )}

        {/* ── Upcoming hikes section ── */}
        {upcoming.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <SectionHeader title="Upcoming hikes" />
            <div className="space-y-2">
              {upcoming.map(u => (
                <button
                  key={u.id}
                  onClick={() => router.push(`/client/bookings/${u.id}`)}
                  style={{ backgroundColor: '#fff', border: `1px solid ${T.cardBorder}`, borderRadius: 16, padding: 16, width: '100%', textAlign: 'left', cursor: 'pointer' }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <p style={{ color: T.brown, fontWeight: 700, fontFamily: FONT }} className="text-sm">
                      {formatShort(u.date)}
                    </p>
                    <span style={{ backgroundColor: '#E8F0E5', color: T.forest, borderRadius: 20, padding: '3px 10px', fontSize: 12, fontFamily: FONT }}>
                      Confirmed
                    </span>
                  </div>
                  <div className="flex items-center gap-1 mb-1">
                    <IconPaw size={13} />
                    <p style={{ color: T.muted, fontSize: 13, fontFamily: FONT }}>
                      {u.dogName}{u.destination ? ` · ${u.destination}` : ''}
                    </p>
                  </div>
                  {(u.pickup || u.dropoff) && (
                    <p style={{ color: T.muted, fontSize: 12, fontFamily: FONT }} className="capitalize">
                      {u.pickup} pickup · {u.dropoff} drop-off
                    </p>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Today's updates ── */}
        {todayNotifs.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <SectionHeader title="Today's updates" />
            <div className="space-y-2">
              {todayNotifs.map(n => (
                <div key={n.id} style={{ backgroundColor: '#fff', border: `1px solid ${T.cardBorder}`, borderRadius: 12, padding: '12px 14px' }}>
                  <p style={{ color: T.brown, fontSize: 14, fontFamily: FONT, margin: '0 0 3px', lineHeight: 1.4 }}>
                    {NOTIF_MESSAGES[n.messageType] ?? n.messageType}
                  </p>
                  <p style={{ color: T.muted, fontSize: 12, fontFamily: FONT, margin: 0 }}>
                    {fmtNotifTime(n.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Past and cancelled section ── */}
        {past.length > 0 && (
          <div style={{ paddingBottom: 16 }}>
            <SectionHeader title={`Past and cancelled (${past.length})`} />
            <button
              onClick={() => setPastOpen(prev => !prev)}
              style={{ width: '100%', backgroundColor: 'white', border: `1px solid ${T.cardBorder}`, color: T.brown, borderRadius: 12, padding: '12px 16px', fontSize: 14, fontWeight: 600, fontFamily: FONT, cursor: 'pointer', marginBottom: pastOpen ? 8 : 0 }}
            >
              {pastOpen ? '▲ Hide past hikes' : '▼ View past hikes'}
            </button>
            {pastOpen && (
              <div className="space-y-2">
                {past.map(u => (
                  <button
                    key={u.id}
                    onClick={() => router.push(`/client/bookings/${u.id}`)}
                    style={{ backgroundColor: '#fff', border: `1px solid ${T.cardBorder}`, borderRadius: 16, padding: 16, width: '100%', textAlign: 'left', cursor: 'pointer' }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <p style={{ color: T.muted, fontFamily: FONT }} className="text-sm">
                          {formatShort(u.date)}
                        </p>
                        {photoIndicatorDays.has(u.hikeDayId) && (
                          <span style={{ backgroundColor: T.badgeBg, color: T.moss, borderRadius: 20, padding: '3px 10px', fontSize: 12, fontFamily: FONT, display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0, whiteSpace: 'nowrap' }}>
                            <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke={T.moss} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                              <circle cx="12" cy="13" r="4"/>
                            </svg>
                            Photos
                          </span>
                        )}
                      </div>
                      <PastBadge status={u.status} />
                    </div>
                    <div className="flex items-center gap-1">
                      <IconPaw size={13} color={T.muted} />
                      <p style={{ color: T.muted, fontSize: 13, fontFamily: FONT }}>
                        {u.dogName}{u.destination ? ` · ${u.destination}` : ''}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </main>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div style={{ width: 3, height: 16, backgroundColor: T.forest, borderRadius: 2, flexShrink: 0 }} />
      <h2 style={{ color: T.brown, fontWeight: 700, fontFamily: FONT }} className="text-sm">{title}</h2>
    </div>
  )
}

function PastBadge({ status }: { status: string }) {
  if (status === 'cancelled') {
    return <span style={{ backgroundColor: '#FEF3E2', color: T.orange, borderRadius: 20, padding: '3px 10px', fontSize: 12, fontFamily: FONT }}>Cancelled</span>
  }
  if (status === 'no_show') {
    return <span style={{ backgroundColor: '#FBE9E3', color: '#C1562D', borderRadius: 20, padding: '3px 10px', fontSize: 12, fontFamily: FONT }}>No-show</span>
  }
  return <span style={{ backgroundColor: T.badgeBg, color: T.muted, borderRadius: 20, padding: '3px 10px', fontSize: 12, fontFamily: FONT }}>Completed</span>
}
