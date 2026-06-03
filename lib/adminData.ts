import { supabase } from './supabase'
import { isoDate, mondayOf } from './booking'

export type ClientDog = {
  id: string
  name: string
  breed: string | null
  approval_status: string | null
}

export type ClientStatus = 'active' | 'pending' | 'incomplete'

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
  lastBooking: string | null // always null until the bookings table exists (Phase 4)
}

export function clientStatus(approvedAt: string | null, zoneId: string | null, dogCount: number): ClientStatus {
  if (approvedAt && zoneId) return 'active'
  if (dogCount > 0) return 'pending'
  return 'incomplete'
}

export const STATUS_LABEL: Record<ClientStatus, string> = {
  active: 'Active',
  pending: 'Pending',
  incomplete: 'Incomplete',
}

// Fetch every client composed with their dogs and assigned zone.
export async function getClients(): Promise<ClientRow[]> {
  const { data: userRows } = await supabase
    .from('users')
    .select('id, name, phone, address, language, approved_at, zone_id, created_at')
    .eq('role', 'client')
    .order('created_at', { ascending: true })

  const users = userRows ?? []
  const ids = users.map(u => u.id)

  // Dogs for these clients.
  const dogsByOwner: Record<string, ClientDog[]> = {}
  if (ids.length) {
    const { data: dogRows } = await supabase
      .from('dogs')
      .select('id, owner_id, name, breed, approval_status, created_at')
      .in('owner_id', ids)
      .order('created_at', { ascending: true })
    for (const d of dogRows ?? []) {
      ;(dogsByOwner[d.owner_id] ??= []).push({
        id: d.id, name: d.name, breed: d.breed, approval_status: d.approval_status,
      })
    }
  }

  // Zone names.
  const { data: zoneRows } = await supabase.from('zones').select('id, name')
  const zoneName: Record<string, string> = {}
  for (const z of zoneRows ?? []) zoneName[z.id] = z.name

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
      status: clientStatus(u.approved_at, u.zone_id, dogs.length),
      lastBooking: null,
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

// ---- Run data (operational view) -------------------------------------------

export type RunBooking = {
  id: string
  dogId: string
  dogName: string
  ownerName: string | null
  ownerPhone: string | null
  ownerAddress: string | null
  pickupMethod: 'curbside' | 'home' | null
  dropoffMethod: 'curbside' | 'home' | null
  status: string
  zoneId: string | null
  zoneName: string | null
}

export type RunDay = {
  date: string
  hikeDayId: string
  destination: string | null
  bookings: RunBooking[]
}

async function buildRunDays(
  days: Array<{ id: string; date: string; destination_override: string | null }>,
  rawBookings: Array<{ id: string; dog_id: string; owner_id: string; hike_day_id: string; pickup_method: string | null; dropoff_method: string | null; status: string }>,
): Promise<RunDay[]> {
  if (!rawBookings.length) return []

  const dogIds = [...new Set(rawBookings.map(b => b.dog_id))]
  const ownerIds = [...new Set(rawBookings.map(b => b.owner_id))]

  const [{ data: dogRows }, { data: ownerRows }, { data: zoneRows }] = await Promise.all([
    supabase.from('dogs').select('id, name').in('id', dogIds),
    supabase.from('users').select('id, name, phone, address, zone_id').in('id', ownerIds),
    supabase.from('zones').select('id, name'),
  ])

  const dogById: Record<string, string> = {}
  for (const d of (dogRows ?? [])) dogById[d.id] = d.name

  const ownerById: Record<string, { name: string | null; phone: string | null; address: string | null; zone_id: string | null }> = {}
  for (const u of (ownerRows ?? [])) ownerById[u.id] = { name: u.name, phone: u.phone, address: u.address, zone_id: u.zone_id }

  const zoneNameById: Record<string, string> = {}
  for (const z of (zoneRows ?? [])) zoneNameById[z.id] = z.name

  const byDay: Record<string, typeof rawBookings> = {}
  for (const b of rawBookings) { (byDay[b.hike_day_id] ??= []).push(b) }

  return days
    .filter(d => (byDay[d.id] ?? []).length > 0)
    .map(day => {
      const bookings: RunBooking[] = (byDay[day.id] ?? []).map(b => {
        const owner = ownerById[b.owner_id]
        const zoneId = owner?.zone_id ?? null
        return {
          id: b.id,
          dogId: b.dog_id,
          dogName: dogById[b.dog_id] ?? 'Unknown',
          ownerName: owner?.name ?? null,
          ownerPhone: owner?.phone ?? null,
          ownerAddress: owner?.address ?? null,
          pickupMethod: b.pickup_method as 'curbside' | 'home' | null,
          dropoffMethod: b.dropoff_method as 'curbside' | 'home' | null,
          status: b.status,
          zoneId,
          zoneName: zoneId ? (zoneNameById[zoneId] ?? null) : null,
        }
      }).sort((a, b) => (a.zoneName ?? '').localeCompare(b.zoneName ?? ''))
      return { date: day.date, hikeDayId: day.id, destination: day.destination_override, bookings }
    })
}

// Next N hike days (from today) that have at least one confirmed booking.
export async function getUpcomingRuns(limit = 2): Promise<RunDay[]> {
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
    .select('id, dog_id, owner_id, hike_day_id, pickup_method, dropoff_method, status')
    .eq('status', 'confirmed')
    .in('hike_day_id', days.map(d => d.id))

  const allRuns = await buildRunDays(days, (bRows ?? []) as Parameters<typeof buildRunDays>[1])
  return allRuns.slice(0, limit)
}

// All confirmed bookings for a specific date (for the detail page).
export async function getRunForDate(date: string): Promise<RunDay | null> {
  const { data: dayRow } = await supabase
    .from('hike_days')
    .select('id, date, destination_override')
    .eq('date', date)
    .maybeSingle()

  if (!dayRow) return null

  const { data: bRows } = await supabase
    .from('bookings')
    .select('id, dog_id, owner_id, hike_day_id, pickup_method, dropoff_method, status')
    .eq('hike_day_id', dayRow.id)
    .eq('status', 'confirmed')

  const days = [{ id: dayRow.id, date: dayRow.date, destination_override: dayRow.destination_override }]
  const runs = await buildRunDays(days, (bRows ?? []) as Parameters<typeof buildRunDays>[1])
  return runs[0] ?? { date: dayRow.date, hikeDayId: dayRow.id, destination: dayRow.destination_override, bookings: [] }
}

// Lightweight summaries for the /staff/runs listing page.
export type RunSummary = {
  date: string
  hikeDayId: string
  destination: string | null
  dogCount: number
}

export async function getUpcomingRunSummaries(): Promise<RunSummary[]> {
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
