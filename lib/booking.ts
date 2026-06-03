import { supabase } from './supabase'

// ---- Pricing / pack constants ----------------------------------------------
export const PRICE_PER_DOG = 50000
export const DEFAULT_CAPACITY = 10
export const TRAIL_PACK_HIKES = 4
export const TRAIL_PACK_SAVING = 20000 // 10% off 4 hikes
export const TRAIL_PACK_PRICE = TRAIL_PACK_HIKES * PRICE_PER_DOG - TRAIL_PACK_SAVING // ₮180,000 (₮45,000/hike)
export const TRAIL_PACK_CREDITS = 3 // 4 hikes = 1 today + 3 banked credits
export const CREDIT_VALIDITY_MONTHS = 6

// ---- Row types --------------------------------------------------------------
export type HikeDayStatus = 'open' | 'full' | 'blocked' | 'cancelled'
export type Method = 'curbside' | 'home'
export type BookingStatus = 'pending_payment' | 'confirmed' | 'cancelled' | 'no_show'

export type HikeDay = {
  id: string
  date: string // YYYY-MM-DD
  status: HikeDayStatus
  capacity: number
  allow_over_capacity: boolean
  zones: string[]
  destination_override: string | null
  client_note: string | null
}

export type Booking = {
  id: string
  dog_id: string
  owner_id: string
  hike_day_id: string
  status: BookingStatus
  pickup_method: Method | null
  dropoff_method: Method | null
  amount_charged: number
  credit_used: number
  created_at: string
}

// ---- Date helpers (local time, day-granularity) -----------------------------
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function todayIso(): string {
  return isoDate(new Date())
}

// Monday at the start of the given date's week (Mon-first calendar).
export function mondayOf(d: Date): Date {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  const offset = (out.getDay() + 6) % 7 // Sun=0 -> 6, Mon=1 -> 0, ...
  out.setDate(out.getDate() - offset)
  return out
}

// 14 consecutive dates (two Mon-Sun weeks) starting this week's Monday.
export function twoWeekDates(): Date[] {
  const start = mondayOf(new Date())
  return Array.from({ length: 14 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
}

export function formatFull(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })
}

export function formatShort(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

// ---- Capacity ---------------------------------------------------------------
// Per-day confirmed booking counts, via the SECURITY DEFINER RPC (clients can't
// read other people's bookings directly).
export async function getBookedCounts(): Promise<Record<string, number>> {
  const { data } = await supabase.rpc('hike_day_booked_counts')
  const out: Record<string, number> = {}
  for (const row of (data ?? []) as { hike_day_id: string; confirmed: number }[]) {
    out[row.hike_day_id] = row.confirmed
  }
  return out
}

export function spotsLeft(day: HikeDay, bookedCounts: Record<string, number>): number {
  return Math.max(0, day.capacity - (bookedCounts[day.id] ?? 0))
}

// ---- Trail Pack credits -----------------------------------------------------
export type CreditRow = { id: string; credits_remaining: number; expires_at: string | null }

export async function getAvailableCredits(ownerId: string): Promise<{ total: number; rows: CreditRow[] }> {
  const nowIso = new Date().toISOString()
  const { data } = await supabase
    .from('trail_pack_credits')
    .select('id, credits_remaining, expires_at')
    .eq('owner_id', ownerId)
    .gt('credits_remaining', 0)
  const rows = ((data ?? []) as CreditRow[])
    .filter(r => !r.expires_at || r.expires_at > nowIso)
    .sort((a, b) => (a.expires_at ?? '9999').localeCompare(b.expires_at ?? '9999'))
  return { total: rows.reduce((s, r) => s + r.credits_remaining, 0), rows }
}

// Decrement `n` credits across the owner's rows, soonest-to-expire first.
export async function deductCredits(rows: CreditRow[], n: number): Promise<void> {
  let remaining = n
  for (const row of rows) {
    if (remaining <= 0) break
    const take = Math.min(remaining, row.credits_remaining)
    await supabase
      .from('trail_pack_credits')
      .update({ credits_remaining: row.credits_remaining - take })
      .eq('id', row.id)
    remaining -= take
  }
}

// Add a freshly purchased Trail Pack (3 banked credits) to the account.
export async function addTrailPack(ownerId: string): Promise<void> {
  const expires = new Date()
  expires.setMonth(expires.getMonth() + CREDIT_VALIDITY_MONTHS)
  await supabase.from('trail_pack_credits').insert({
    owner_id: ownerId,
    credits_remaining: TRAIL_PACK_CREDITS,
    purchase_amount: TRAIL_PACK_PRICE,
    expires_at: expires.toISOString(),
  })
}
