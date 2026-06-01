import { supabase } from './supabase'

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

// Placeholder operational metrics. No bookings table yet (Phase 4), so revenue
// and booking counts are zero by definition — surfaced here so every consumer
// uses the same source and the wiring is ready when bookings land.
export const PRICE_PER_HIKE = 50000

export type WeeklyMetrics = {
  hikesThisWeek: number
  revenueThisWeek: number
  bookingsCount: number
}

export function getWeeklyMetrics(): WeeklyMetrics {
  const hikesThisWeek = 0
  return {
    hikesThisWeek,
    revenueThisWeek: hikesThisWeek * PRICE_PER_HIKE,
    bookingsCount: 0,
  }
}
