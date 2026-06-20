import type { ClientRow } from './adminData'
import { STATUS_LABEL } from './adminData'
import { supabase } from './supabase'

// Build and download an .xlsx of all client + booking data.
// exceljs is imported dynamically so it stays out of the main page bundle.
export async function exportClientsToExcel(clients: ClientRow[], filename = 'dog-adventure-hikes-export.xlsx') {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Dog Adventure Hikes'

  // --- Clients sheet ---
  const clientsSheet = wb.addWorksheet('Clients')
  clientsSheet.columns = [
    { header: 'Name', key: 'name', width: 22 },
    { header: 'Phone', key: 'phone', width: 16 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Zone', key: 'zone', width: 18 },
    { header: 'Dogs', key: 'dogs', width: 28 },
    { header: 'Language', key: 'language', width: 10 },
    { header: 'Address', key: 'address', width: 32 },
    { header: 'Last booking', key: 'lastBooking', width: 14 },
  ]
  clientsSheet.getRow(1).font = { bold: true }

  for (const c of clients) {
    clientsSheet.addRow({
      name: c.name ?? '',
      phone: c.phone ?? '',
      status: STATUS_LABEL[c.status],
      zone: c.zoneName ?? '',
      dogs: c.dogs.map(d => d.breed ? `${d.name} (${d.breed})` : d.name).join(', '),
      language: c.language ?? '',
      address: c.address ?? '',
      lastBooking: c.lastBooking ?? '—',
    })
  }

  // --- Bookings sheet (structure ready for Phase 4; no rows yet) ---
  const bookingsSheet = wb.addWorksheet('Bookings')
  bookingsSheet.columns = [
    { header: 'Date', key: 'date', width: 14 },
    { header: 'Client', key: 'client', width: 22 },
    { header: 'Dog', key: 'dog', width: 18 },
    { header: 'Zone', key: 'zone', width: 18 },
    { header: 'Pickup', key: 'pickup', width: 12 },
    { header: 'Amount (₮)', key: 'amount', width: 12 },
    { header: 'Status', key: 'status', width: 14 },
  ]
  bookingsSheet.getRow(1).font = { bold: true }
  bookingsSheet.addRow({ date: 'No bookings yet — booking flow not yet wired (Phase 4).' })

  // --- Trigger download ---
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// ─── Revenue report ─────────────────────────────────────────────────────────

function _isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function _fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function _fmtMnt(n: number): string {
  return `₮${n.toLocaleString()}`
}

const PRICE_PER_DOG = 50000

export async function exportRevenueReport(startDate: string, endDate: string, filename?: string) {
  const now = new Date()
  const curY = now.getFullYear()
  const curM = now.getMonth() + 1
  const curQ = Math.ceil(curM / 3)

  const mStart = `${curY}-${String(curM).padStart(2, '0')}-01`
  const mEnd   = _isoDate(new Date(curY, curM, 0))
  const qsm = (curQ - 1) * 3 + 1
  const qem = curQ * 3
  const qStart = `${curY}-${String(qsm).padStart(2, '0')}-01`
  const qEnd   = _isoDate(new Date(curY, qem, 0))
  const yStart = `${curY}-01-01`
  const yEnd   = _isoDate(now)

  // ── Step 1: hike_days in export range ────────────────────────────────────
  const { data: exportDayRows } = await supabase
    .from('hike_days').select('id, date')
    .gte('date', startDate).lte('date', endDate)
    .order('date', { ascending: true })
  const exportDays = (exportDayRows ?? []) as { id: string; date: string }[]
  const exportDayIds = exportDays.map(d => d.id)
  const dateByDayId: Record<string, string> = {}
  for (const d of exportDays) dateByDayId[d.id] = d.date

  // ── Step 2: confirmed bookings in export range ────────────────────────────
  type BookingRow = { id: string; dog_id: string; owner_id: string; hike_day_id: string; amount_charged: number; credit_used: number }
  let exportBookings: BookingRow[] = []
  if (exportDayIds.length) {
    const { data: bRows } = await supabase
      .from('bookings')
      .select('id, dog_id, owner_id, hike_day_id, amount_charged, credit_used')
      .eq('status', 'confirmed')
      .in('hike_day_id', exportDayIds)
    exportBookings = (bRows ?? []) as BookingRow[]
  }
  exportBookings.sort((a, b) => (dateByDayId[a.hike_day_id] ?? '').localeCompare(dateByDayId[b.hike_day_id] ?? ''))

  const dogIds   = [...new Set(exportBookings.map(b => b.dog_id))]
  const ownerIds = [...new Set(exportBookings.map(b => b.owner_id))]

  // ── Step 3: lookup tables ────────────────────────────────────────────────
  const [dogResult, ownerResult, zoneResult] = await Promise.all([
    dogIds.length   ? supabase.from('dogs').select('id, name').in('id', dogIds)     : Promise.resolve({ data: [] }),
    ownerIds.length ? supabase.from('users').select('id, name, zone_id').in('id', ownerIds) : Promise.resolve({ data: [] }),
    supabase.from('zones').select('id, name'),
  ])
  const dogById: Record<string, string> = {}
  for (const d of (dogResult.data ?? [])) dogById[d.id] = d.name
  const ownerById: Record<string, { name: string | null; zone_id: string | null }> = {}
  for (const u of (ownerResult.data ?? [])) ownerById[u.id] = { name: u.name, zone_id: u.zone_id }
  const zoneById: Record<string, string> = {}
  for (const z of (zoneResult.data ?? [])) zoneById[z.id] = z.name

  // ── Step 4: client YTD summary ───────────────────────────────────────────
  const { data: ytdDayRows } = await supabase
    .from('hike_days').select('id, date').gte('date', yStart).lte('date', yEnd)
  const ytdDays = (ytdDayRows ?? []) as { id: string; date: string }[]
  const ytdDateByDay: Record<string, string> = {}
  for (const d of ytdDays) ytdDateByDay[d.id] = d.date
  const ytdDayIds = ytdDays.map(d => d.id)

  type SumRow = { owner_id: string; hike_day_id: string; amount_charged: number }
  let ytdBookings: SumRow[] = []
  if (ownerIds.length && ytdDayIds.length) {
    const { data: sRows } = await supabase
      .from('bookings').select('owner_id, hike_day_id, amount_charged')
      .eq('status', 'confirmed')
      .in('owner_id', ownerIds).in('hike_day_id', ytdDayIds)
    ytdBookings = (sRows ?? []) as SumRow[]
  }

  const ownerTotals: Record<string, { month: number; quarter: number; ytd: number }> = {}
  for (const oid of ownerIds) ownerTotals[oid] = { month: 0, quarter: 0, ytd: 0 }
  for (const b of ytdBookings) {
    const d = ytdDateByDay[b.hike_day_id]
    if (!d || !ownerTotals[b.owner_id]) continue
    const amt = b.amount_charged ?? 0
    ownerTotals[b.owner_id].ytd += amt
    if (d >= mStart && d <= mEnd)  ownerTotals[b.owner_id].month   += amt
    if (d >= qStart && d <= qEnd)  ownerTotals[b.owner_id].quarter += amt
  }

  // ── Build workbook ────────────────────────────────────────────────────────
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Tails to Trails'

  const FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEE9E0' } } as any

  // Tab 1: Transactions
  const tx = wb.addWorksheet('Transactions')
  tx.columns = [
    { header: 'Date',               key: 'date',    width: 16 },
    { header: 'Client',             key: 'client',  width: 22 },
    { header: 'Dog',                key: 'dog',     width: 18 },
    { header: 'Amount Charged (₮)', key: 'amount',  width: 18 },
    { header: 'Credit Used',        key: 'credit',  width: 14 },
    { header: 'Payment Type',       key: 'payType', width: 16 },
    { header: 'Zone',               key: 'zone',    width: 18 },
  ]
  const txH = tx.getRow(1)
  txH.font = { bold: true }
  txH.fill = FILL

  for (const b of exportBookings) {
    const owner   = ownerById[b.owner_id]
    const zoneId  = owner?.zone_id
    let payType: string
    if (b.amount_charged > PRICE_PER_DOG)  payType = 'Trail Pack'
    else if (b.credit_used > 0)            payType = 'Credit'
    else                                   payType = 'Single hike'
    tx.addRow({
      date:    _fmtDate(dateByDayId[b.hike_day_id] ?? ''),
      client:  owner?.name ?? '',
      dog:     dogById[b.dog_id] ?? '',
      amount:  _fmtMnt(b.amount_charged ?? 0),
      credit:  b.credit_used ?? 0,
      payType,
      zone:    zoneId ? (zoneById[zoneId] ?? '') : '',
    })
  }

  // Tab 2: Client Summary
  const cs = wb.addWorksheet('Client Summary')
  cs.columns = [
    { header: 'Client',           key: 'client',   width: 22 },
    { header: 'This Month (₮)',   key: 'month',    width: 18 },
    { header: 'This Quarter (₮)', key: 'quarter',  width: 18 },
    { header: 'Year to Date (₮)', key: 'ytd',      width: 18 },
  ]
  const csH = cs.getRow(1)
  csH.font = { bold: true }
  csH.fill = FILL

  const sortedOwners = [...ownerIds].sort((a, b) =>
    (ownerById[a]?.name ?? '').localeCompare(ownerById[b]?.name ?? '')
  )

  let totMonth = 0, totQtr = 0, totYtd = 0
  for (const oid of sortedOwners) {
    const s = ownerTotals[oid]
    totMonth += s.month; totQtr += s.quarter; totYtd += s.ytd
    cs.addRow({
      client:  ownerById[oid]?.name ?? '',
      month:   s.month   ? _fmtMnt(s.month)   : '—',
      quarter: s.quarter ? _fmtMnt(s.quarter) : '—',
      ytd:     s.ytd     ? _fmtMnt(s.ytd)     : '—',
    })
  }
  const totalRow = cs.addRow({
    client:  'TOTAL',
    month:   totMonth ? _fmtMnt(totMonth) : '—',
    quarter: totQtr   ? _fmtMnt(totQtr)   : '—',
    ytd:     totYtd   ? _fmtMnt(totYtd)   : '—',
  })
  totalRow.font = { bold: true }

  // Download
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename ?? `tails-to-trails-${startDate}-to-${endDate}.xlsx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
