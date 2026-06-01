import type { ClientRow } from './adminData'
import { STATUS_LABEL } from './adminData'

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
