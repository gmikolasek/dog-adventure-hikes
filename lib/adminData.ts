import { supabase } from './supabase'
import { isoDate, mondayOf } from './booking'

export type ClientDog = {
  id: string
  name: string
  breed: string | null
  approval_status: string | null
  photo_url: string | null
}

export type ClientStatus = 'active' | 'pending' | 'incomplete' | 'rejected'

export type ClientRow = {
  id: string
  name: string | null
  phone: string | null
  address: string | null
  language: string | null
  approvedAt: string | null
  zoneId: string | null
  zoneName: string | null
  dogs: ClientDog[]
  status: ClientStatus
  lastBooking: string | null
}

export function clientStatus(dogs: ClientDog[]): ClientStatus {
  if (dogs.some(d => d.approval_status === 'approved' || d.approval_status === 'approved_with_conditions')) return 'active'
  if (dogs.some(d => d.approval_status === 'declined')) return 'rejected'
  if (dogs.length > 0) return 'pending'
  return 'incomplete'
}

export const STATUS_LABEL: Record<ClientStatus, string> = {
  active:     'Active',
  pending:    'Pending',
  incomplete: 'Incomplete',
  rejected:   'Rejected',
}

export async function getClients(): Promise<ClientRow[]> {
  const { data: userRows } = await supabase
    .from('users')
    .select('id, name, phone, address, language, approved_at, zone_id, created_at')
    .eq('role', 'client')
    .order('created_at', { ascending: true })

  const users = userRows ?? []
  const ids = users.map(u => u.id)

  // Fetch dogs, zones, and confirmed bookings in parallel.
  const [dogResult, zoneResult, bookingResult] = await Promise.all([
    ids.length
      ? supabase
          .from('dogs')
          .select('id, owner_id, name, breed, approval_status, photo_url, created_at')
          .in('owner_id', ids)
          .order('created_at', { ascending: true })
      : Promise.resolve({ data: [] as Array<{ id: string; owner_id: string; name: string; breed: string | null; approval_status: string | null; photo_url: string | null; created_at: string }> }),
    supabase.from('zones').select('id, name'),
    ids.length
      ? supabase
          .from('bookings')
          .select('owner_id, hike_day_id')
          .eq('status', 'confirmed')
          .in('owner_id', ids)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as Array<{ owner_id: string; hike_day_id: string }> }),
  ])

  const dogsByOwner: Record<string, ClientDog[]> = {}
  for (const d of (dogResult.data ?? [])) {
    ;(dogsByOwner[d.owner_id] ??= []).push({
      id: d.id, name: d.name, breed: d.breed, approval_status: d.approval_status, photo_url: d.photo_url,
    })
  }

  const zoneName: Record<string, string> = {}
  for (const z of (zoneResult.data ?? [])) zoneName[z.id] = z.name

  // Most recent confirmed booking per owner (rows already desc by created_at).
  const latestHikeDayByOwner: Record<string, string> = {}
  for (const b of (bookingResult.data ?? [])) {
    if (!latestHikeDayByOwner[b.owner_id]) latestHikeDayByOwner[b.owner_id] = b.hike_day_id
  }

  // Resolve the distinct hike_day_ids → dates.
  const lastBookingByOwner: Record<string, string> = {}
  const hikeDayIds = [...new Set(Object.values(latestHikeDayByOwner))]
  if (hikeDayIds.length) {
    const { data: hikeDayRows } = await supabase
      .from('hike_days')
      .select('id, date')
      .in('id', hikeDayIds)
    const dateById: Record<string, string> = {}
    for (const h of (hikeDayRows ?? [])) dateById[h.id] = h.date
    for (const [ownerId, hikeDayId] of Object.entries(latestHikeDayByOwner)) {
      if (dateById[hikeDayId]) lastBookingByOwner[ownerId] = dateById[hikeDayId]
    }
  }

  return users.map(u => {
    const dogs = dogsByOwner[u.id] ?? []
    return {
      id: u.id,
      name: u.name,
      phone: u.phone,
      address: u.address,
      language: u.language,
      approvedAt: u.approved_at,
      zoneId: u.zone_id,
      zoneName: u.zone_id ? (zoneName[u.zone_id] ?? null) : null,
      dogs,
      status: clientStatus(dogs),
      lastBooking: lastBookingByOwner[u.id] ?? null,
    }
  })
}

export const PRICE_PER_HIKE = 50000

export type WeeklyMetrics = {
  hikesThisWeek: number
  revenueThisWeek: number
  bookingsCount: number
}

export async function getWeeklyMetrics(): Promise<WeeklyMetrics> {
  const now = new Date()
  const mon = mondayOf(now)
  const sun = new Date(mon)
  sun.setDate(mon.getDate() + 6)
  const monIso = isoDate(mon)
  const sunIso = isoDate(sun)

  const { data: dayRows } = await supabase
    .from('hike_days')
    .select('id')
    .gte('date', monIso)
    .lte('date', sunIso)

  const hikeIds = (dayRows ?? []).map((h: { id: string }) => h.id)
  if (!hikeIds.length) return { hikesThisWeek: 0, revenueThisWeek: 0, bookingsCount: 0 }

  const { data: bRows } = await supabase
    .from('bookings')
    .select('id, hike_day_id, amount_charged')
    .eq('status', 'confirmed')
    .in('hike_day_id', hikeIds)

  const bs = (bRows ?? []) as { id: string; hike_day_id: string; amount_charged: number }[]
  const bookingsCount = bs.length
  const revenueThisWeek = bs.reduce((s, b) => s + (b.amount_charged ?? 0), 0)
  const hikesThisWeek = new Set(bs.map(b => b.hike_day_id)).size

  return { hikesThisWeek, revenueThisWeek, bookingsCount }
}

// ---- Hike operational view --------------------------------------------------

export type HikeBooking = {
  id: string
  dogId: string
  dogName: string
  dogPhotoUrl: string | null
  ownerName: string | null
  ownerPhone: string | null
  ownerAddress: string | null
  pickupMethod: 'curbside' | 'home' | null
  dropoffMethod: 'curbside' | 'home' | null
  status: string
  zoneId: string | null
  zoneName: string | null
  pickupOrder: number | null
}

export type HikeDetail = {
  date: string
  hikeDayId: string
  destination: string | null
  bookings: HikeBooking[]
}

type RawBookingRow = {
  id: string
  dog_id: string
  owner_id: string
  hike_day_id: string
  pickup_method: string | null
  dropoff_method: string | null
  status: string
  pickup_order: number | null
}

async function buildHikeDetails(
  days: Array<{ id: string; date: string; destination_override: string | null }>,
  rawBookings: RawBookingRow[],
): Promise<HikeDetail[]> {
  if (!rawBookings.length) return []

  const dogIds = [...new Set(rawBookings.map(b => b.dog_id))]
  const ownerIds = [...new Set(rawBookings.map(b => b.owner_id))]

  const [{ data: dogRows }, { data: ownerRows }, { data: zoneRows }] = await Promise.all([
    supabase.from('dogs').select('id, name, photo_url').in('id', dogIds),
    supabase.from('users').select('id, name, phone, address, zone_id').in('id', ownerIds),
    supabase.from('zones').select('id, name'),
  ])

  const dogById: Record<string, { name: string; photo_url: string | null }> = {}
  for (const d of (dogRows ?? [])) dogById[d.id] = { name: d.name, photo_url: d.photo_url }

  const ownerById: Record<string, { name: string | null; phone: string | null; address: string | null; zone_id: string | null }> = {}
  for (const u of (ownerRows ?? [])) ownerById[u.id] = { name: u.name, phone: u.phone, address: u.address, zone_id: u.zone_id }

  const zoneNameById: Record<string, string> = {}
  for (const z of (zoneRows ?? [])) zoneNameById[z.id] = z.name

  const byDay: Record<string, RawBookingRow[]> = {}
  for (const b of rawBookings) { (byDay[b.hike_day_id] ??= []).push(b) }

  return days
    .filter(d => (byDay[d.id] ?? []).length > 0)
    .map(day => {
      const bookings: HikeBooking[] = (byDay[day.id] ?? []).map(b => {
        const owner = ownerById[b.owner_id]
        const zoneId = owner?.zone_id ?? null
        return {
          id: b.id,
          dogId: b.dog_id,
          dogName: dogById[b.dog_id]?.name ?? 'Unknown',
          dogPhotoUrl: dogById[b.dog_id]?.photo_url ?? null,
          ownerName: owner?.name ?? null,
          ownerPhone: owner?.phone ?? null,
          ownerAddress: owner?.address ?? null,
          pickupMethod: b.pickup_method as 'curbside' | 'home' | null,
          dropoffMethod: b.dropoff_method as 'curbside' | 'home' | null,
          status: b.status,
          zoneId,
          zoneName: zoneId ? (zoneNameById[zoneId] ?? null) : null,
          pickupOrder: b.pickup_order ?? null,
        }
      }).sort((a, b) => {
        if (a.pickupOrder !== null && b.pickupOrder !== null) return a.pickupOrder - b.pickupOrder
        if (a.pickupOrder !== null) return -1
        if (b.pickupOrder !== null) return 1
        return (a.zoneName ?? '').localeCompare(b.zoneName ?? '')
      })
      return { date: day.date, hikeDayId: day.id, destination: day.destination_override, bookings }
    })
}

// Next N hike days (from today) that have at least one confirmed booking.
export async function getUpcomingHikes(limit = 2): Promise<HikeDetail[]> {
  const today = isoDate(new Date())

  const { data: dayRows } = await supabase
    .from('hike_days')
    .select('id, date, destination_override')
    .gte('date', today)
    .order('date', { ascending: true })
    .limit(10)

  const days = (dayRows ?? []) as Array<{ id: string; date: string; destination_override: string | null }>
  if (!days.length) return []

  const { data: bRows } = await supabase
    .from('bookings')
    .select('id, dog_id, owner_id, hike_day_id, pickup_method, dropoff_method, status, pickup_order')
    .eq('status', 'confirmed')
    .in('hike_day_id', days.map(d => d.id))

  const allHikes = await buildHikeDetails(days, (bRows ?? []) as RawBookingRow[])
  return allHikes.slice(0, limit)
}

// All confirmed bookings for a specific date (for the detail page).
export async function getHikeForDate(date: string): Promise<HikeDetail | null> {
  const { data: dayRow } = await supabase
    .from('hike_days')
    .select('id, date, destination_override')
    .eq('date', date)
    .maybeSingle()

  if (!dayRow) return null

  const { data: bRows } = await supabase
    .from('bookings')
    .select('id, dog_id, owner_id, hike_day_id, pickup_method, dropoff_method, status, pickup_order')
    .eq('hike_day_id', dayRow.id)
    .eq('status', 'confirmed')

  const days = [{ id: dayRow.id, date: dayRow.date, destination_override: dayRow.destination_override }]
  const hikes = await buildHikeDetails(days, (bRows ?? []) as RawBookingRow[])
  return hikes[0] ?? { date: dayRow.date, hikeDayId: dayRow.id, destination: dayRow.destination_override, bookings: [] }
}

// Lightweight summaries for the /staff/hikes listing page.
export type HikeSummary = {
  date: string
  hikeDayId: string
  destination: string | null
  dogCount: number
}

export async function getUpcomingHikeSummaries(): Promise<HikeSummary[]> {
  const today = isoDate(new Date())
  const { data: dayRows } = await supabase
    .from('hike_days')
    .select('id, date, destination_override, status')
    .gte('date', today)
    .in('status', ['open', 'full'])
    .order('date', { ascending: true })
    .limit(20)

  const days = (dayRows ?? []) as Array<{ id: string; date: string; destination_override: string | null; status: string }>
  if (!days.length) return []

  const { data: countRows } = await supabase.rpc('hike_day_booked_counts')
  const countById: Record<string, number> = {}
  for (const r of (countRows ?? []) as { hike_day_id: string; confirmed: number }[]) {
    countById[r.hike_day_id] = r.confirmed
  }

  return days.map(d => ({
    date: d.date,
    hikeDayId: d.id,
    destination: d.destination_override,
    dogCount: countById[d.id] ?? 0,
  }))
}

// ---- Weekly revenue detail --------------------------------------------------

export type WeeklyBookingRow = {
  id: string
  ownerName: string | null
  dogName: string
  amountCharged: number
  creditUsed: number
  hikeDate: string
  pickupMethod: 'curbside' | 'home' | null
}

export type TrailPackHolder = {
  id: string
  ownerName: string | null
  creditsRemaining: number
  expiresAt: string | null
}

export type WeeklyException = {
  id: string
  ownerName: string | null
  dogName: string
  status: 'cancelled' | 'no_show'
  hikeDate: string
}

export type WeeklyRevenueData = {
  totalRevenue: number
  weekMon: string
  weekSun: string
  bookings: WeeklyBookingRow[]
  trailPackHolders: TrailPackHolder[]
  exceptions: WeeklyException[]
}

export async function getWeeklyRevenue(): Promise<WeeklyRevenueData> {
  const now = new Date()
  const mon = mondayOf(now)
  const sun = new Date(mon)
  sun.setDate(mon.getDate() + 6)
  const monIso = isoDate(mon)
  const sunIso = isoDate(sun)

  // Get hike day IDs for this week
  const { data: dayRows } = await supabase
    .from('hike_days')
    .select('id, date')
    .gte('date', monIso)
    .lte('date', sunIso)

  const days = (dayRows ?? []) as { id: string; date: string }[]
  const dayIds = days.map(d => d.id)
  const dateById: Record<string, string> = {}
  for (const d of days) dateById[d.id] = d.date

  const empty: WeeklyRevenueData = {
    totalRevenue: 0,
    weekMon: monIso,
    weekSun: sunIso,
    bookings: [],
    trailPackHolders: [],
    exceptions: [],
  }

  // Fetch confirmed + exception bookings for this week, and trail pack credits — in parallel
  const [confirmedResult, exceptionResult, creditsResult] = await Promise.all([
    dayIds.length
      ? supabase
          .from('bookings')
          .select('id, dog_id, owner_id, hike_day_id, amount_charged, credit_used, pickup_method')
          .eq('status', 'confirmed')
          .in('hike_day_id', dayIds)
      : Promise.resolve({ data: [] }),
    dayIds.length
      ? supabase
          .from('bookings')
          .select('id, dog_id, owner_id, hike_day_id, status')
          .in('status', ['cancelled', 'no_show'])
          .in('hike_day_id', dayIds)
      : Promise.resolve({ data: [] }),
    supabase
      .from('trail_pack_credits')
      .select('id, owner_id, credits_remaining, expires_at')
      .gt('credits_remaining', 0),
  ])

  const confirmedBookings = (confirmedResult.data ?? []) as Array<{
    id: string; dog_id: string; owner_id: string; hike_day_id: string; amount_charged: number; credit_used: number; pickup_method: string | null
  }>
  const exceptionBookings = (exceptionResult.data ?? []) as Array<{
    id: string; dog_id: string; owner_id: string; hike_day_id: string; status: string
  }>
  const creditRows = (creditsResult.data ?? []) as Array<{
    id: string; owner_id: string; credits_remaining: number; expires_at: string | null
  }>

  // Filter out expired credits in JS (expires_at null = no expiry)
  const nowIso = now.toISOString()
  const activeCredits = creditRows.filter(r => !r.expires_at || r.expires_at > nowIso)

  // Collect all owner IDs and dog IDs we need to look up
  const allOwnerIds = [...new Set([
    ...confirmedBookings.map(b => b.owner_id),
    ...exceptionBookings.map(b => b.owner_id),
    ...activeCredits.map(r => r.owner_id),
  ])]
  const allDogIds = [...new Set([
    ...confirmedBookings.map(b => b.dog_id),
    ...exceptionBookings.map(b => b.dog_id),
  ])]

  const [dogResult, ownerResult] = await Promise.all([
    allDogIds.length
      ? supabase.from('dogs').select('id, name').in('id', allDogIds)
      : Promise.resolve({ data: [] }),
    allOwnerIds.length
      ? supabase.from('users').select('id, name').in('id', allOwnerIds)
      : Promise.resolve({ data: [] }),
  ])

  const dogById: Record<string, string> = {}
  for (const d of (dogResult.data ?? [])) dogById[d.id] = d.name

  const ownerById: Record<string, string | null> = {}
  for (const u of (ownerResult.data ?? [])) ownerById[u.id] = u.name

  const bookings: WeeklyBookingRow[] = confirmedBookings
    .map(b => ({
      id: b.id,
      ownerName: ownerById[b.owner_id] ?? null,
      dogName: dogById[b.dog_id] ?? 'Unknown',
      amountCharged: b.amount_charged ?? 0,
      creditUsed: b.credit_used ?? 0,
      hikeDate: dateById[b.hike_day_id] ?? '',
      pickupMethod: b.pickup_method as 'curbside' | 'home' | null,
    }))
    .sort((a, b) => a.hikeDate.localeCompare(b.hikeDate))

  const totalRevenue = bookings.reduce((s, b) => s + b.amountCharged, 0)

  const exceptions: WeeklyException[] = exceptionBookings.map(b => ({
    id: b.id,
    ownerName: ownerById[b.owner_id] ?? null,
    dogName: dogById[b.dog_id] ?? 'Unknown',
    status: b.status as 'cancelled' | 'no_show',
    hikeDate: dateById[b.hike_day_id] ?? '',
  }))

  const trailPackHolders: TrailPackHolder[] = activeCredits
    .map(r => ({
      id: r.id,
      ownerName: ownerById[r.owner_id] ?? null,
      creditsRemaining: r.credits_remaining,
      expiresAt: r.expires_at,
    }))
    .sort((a, b) => (a.ownerName ?? '').localeCompare(b.ownerName ?? ''))

  return { totalRevenue, weekMon: monIso, weekSun: sunIso, bookings, trailPackHolders, exceptions }
}
