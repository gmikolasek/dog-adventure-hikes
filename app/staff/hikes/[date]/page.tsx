'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import { getHikeForDate, type HikeDetail, type HikeBooking } from '@/lib/adminData'
import { formatFull, todayIso } from '@/lib/booking'
import { uploadHikePhoto, getPhotoUrl, type HikePhoto } from '@/lib/photos'

const FONT = "'Noto Sans', system-ui, sans-serif"

// ── Icons ────────────────────────────────────────────────────────────────────

function BackArrow() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#26452B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6"/>
    </svg>
  )
}

function MountainIcon({ color = 'white' }: { color?: string }) {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 20 9 9 13 14 16 11 21 20"/>
      <line x1="3" y1="20" x2="21" y2="20"/>
    </svg>
  )
}

function PawIcon({ size = 20, color = '#4D6B46' }: { size?: number; color?: string }) {
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

function DragHandleIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 20 20" fill="#C0B8AE">
      <rect x="3" y="4"  width="14" height="2" rx="1"/>
      <rect x="3" y="9"  width="14" height="2" rx="1"/>
      <rect x="3" y="14" width="14" height="2" rx="1"/>
    </svg>
  )
}

function BellIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#4D6B46" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function HikeDetailPage() {
  const router = useRouter()
  const params = useParams()
  const date = params.date as string

  const [ready, setReady] = useState(false)
  const [hike, setHike] = useState<HikeDetail | null>(null)
  const [staffUserId, setStaffUserId] = useState('')
  const [dropoffStats, setDropoffStats] = useState<{ total: number; complete: number } | null>(null)
  const [orderedBookings, setOrderedBookings] = useState<HikeBooking[]>([])
  const [savingOrder, setSavingOrder] = useState(false)

  // Photo state
  const [photos, setPhotos] = useState<HikePhoto[]>([])
  const [showUploadForm, setShowUploadForm] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadPreview, setUploadPreview] = useState<string | null>(null)
  const [uploadDogId, setUploadDogId] = useState('')
  const [uploadCaption, setUploadCaption] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/'); return }

      const { data: profile } = await supabase
        .from('users').select('role').eq('id', session.user.id).maybeSingle()
      if (profile?.role !== 'staff') { router.push('/onboarding'); return }
      setStaffUserId(session.user.id)

      const hikeData = await getHikeForDate(date)
      setHike(hikeData)
      if (hikeData) setOrderedBookings(hikeData.bookings)

      if (hikeData?.hikeDayId) {
        const { data: dropoffRows } = await supabase
          .from('bookings')
          .select('dropped_off_at')
          .eq('hike_day_id', hikeData.hikeDayId)
          .eq('status', 'confirmed')
        if (dropoffRows) {
          setDropoffStats({
            total: dropoffRows.length,
            complete: dropoffRows.filter(r => r.dropped_off_at).length,
          })
        }

        const { data: photoRows } = await supabase
          .from('hike_photos')
          .select('id, dog_id, storage_path, caption, taken_at')
          .eq('hike_day_id', hikeData.hikeDayId)
          .order('created_at', { ascending: true })
        setPhotos(
          (photoRows ?? []).map(r => ({
            id: r.id,
            dogId: r.dog_id,
            storagePath: r.storage_path,
            caption: r.caption,
            takenAt: r.taken_at,
          }))
        )
      }

      setReady(true)
    }
    load()
  }, [router, date])

  async function onDragEnd(result: DropResult) {
    if (!result.destination || result.destination.index === result.source.index) return
    const items = Array.from(orderedBookings)
    const [moved] = items.splice(result.source.index, 1)
    items.splice(result.destination.index, 0, moved)
    setOrderedBookings(items)
    setSavingOrder(true)
    await Promise.all(
      items.map((b, i) => supabase.from('bookings').update({ pickup_order: i }).eq('id', b.id))
    )
    setSavingOrder(false)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    setUploadFile(file)
    if (file) {
      const reader = new FileReader()
      reader.onload = ev => setUploadPreview(ev.target?.result as string)
      reader.readAsDataURL(file)
    } else {
      setUploadPreview(null)
    }
  }

  async function handleUpload() {
    if (!uploadFile || !hike) return
    setUploading(true)
    setUploadError('')
    const result = await uploadHikePhoto(uploadFile, hike.hikeDayId)
    if (!result) {
      setUploadError('Upload failed — please try again.')
      setUploading(false)
      return
    }
    const { data: newRow, error: dbErr } = await supabase
      .from('hike_photos')
      .insert({
        hike_day_id: hike.hikeDayId,
        dog_id: uploadDogId || null,
        uploaded_by: staffUserId,
        storage_path: result.storagePath,
        caption: uploadCaption || null,
        taken_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    if (dbErr || !newRow) {
      setUploadError('Photo uploaded but record save failed.')
      setUploading(false)
      return
    }
    setPhotos(prev => [...prev, {
      id: newRow.id,
      dogId: uploadDogId || null,
      storagePath: result.storagePath,
      caption: uploadCaption || null,
      takenAt: new Date().toISOString(),
    }])
    setUploadFile(null)
    setUploadPreview(null)
    setUploadCaption('')
    setUploadDogId('')
    setShowUploadForm(false)
    setUploading(false)
  }

  async function handleDeletePhoto(photoId: string) {
    const photo = photos.find(p => p.id === photoId)
    if (!photo) return
    setDeleting(true)
    setDeleteError('')
    const { error: storageErr } = await supabase.storage.from('dog-photos').remove([photo.storagePath])
    if (storageErr) console.error('Storage delete failed', storageErr)
    const { error: dbErr } = await supabase.from('hike_photos').delete().eq('id', photoId)
    if (dbErr) {
      setDeleteError('Delete failed — ' + dbErr.message)
      setDeleting(false)
      return
    }
    setPhotos(prev => prev.filter(p => p.id !== photoId))
    setConfirmDeleteId(null)
    setDeleting(false)
  }

  if (!ready) {
    return (
      <main style={{ minHeight: '100vh', backgroundColor: '#F5F0E8', fontFamily: FONT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontSize: 14, color: '#8A7E72' }}>Loading…</p>
      </main>
    )
  }

  const formattedDate = (() => {
    try { return formatFull(date) } catch { return date }
  })()

  const dogById: Record<string, string> = {}
  for (const b of hike?.bookings ?? []) dogById[b.dogId] = b.dogName

  const isRunDay = date >= todayIso()

  return (
    <main style={{ minHeight: '100vh', backgroundColor: '#F5F0E8', fontFamily: FONT, padding: '40px 24px 60px' }}>
      <div style={{ width: '100%', maxWidth: 384, margin: '0 auto' }}>

        {/* Back button */}
        <button
          onClick={() => router.push('/staff/hikes')}
          style={{ width: 32, height: 32, borderRadius: '50%', backgroundColor: '#E8E2D9', border: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', marginBottom: 20, padding: 0, flexShrink: 0 }}
        >
          <BackArrow />
        </button>

        {/* Title */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#3B2A1F', fontFamily: FONT, margin: 0 }}>
            Hike · {formattedDate}
          </h1>
          {hike?.destination && (
            <p style={{ color: '#8A7E72', fontSize: 14, marginTop: 4, fontFamily: FONT }}>{hike.destination}</p>
          )}
        </div>

        {/* Start hike / in-progress / complete button */}
        {hike && hike.bookings.length > 0 && isRunDay && dropoffStats && (
          dropoffStats.complete === dropoffStats.total ? (
            <div style={{ width: '100%', backgroundColor: '#E8F0E5', border: '1px solid #26452B', borderRadius: 12, padding: '14px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#26452B', fontFamily: FONT }}>Hike complete ✓</span>
            </div>
          ) : dropoffStats.complete > 0 ? (
            <button
              onClick={() => router.push(`/staff/hikes/${date}/run`)}
              style={{ width: '100%', backgroundColor: '#2B5BA8', color: 'white', borderRadius: 12, padding: '14px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: FONT }}
            >
              <MountainIcon />
              <span>Hike in progress · {dropoffStats.complete} of {dropoffStats.total} dropped off</span>
            </button>
          ) : (
            <button
              onClick={() => router.push(`/staff/hikes/${date}/run`)}
              style={{ width: '100%', backgroundColor: '#26452B', color: 'white', borderRadius: 12, padding: '14px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: FONT }}
            >
              <MountainIcon />
              <span>Start hike</span>
            </button>
          )
        )}

        {!hike || hike.bookings.length === 0 ? (
          <div style={{ backgroundColor: 'white', border: '1px solid #E8E2D9', borderRadius: 16, padding: '40px 24px', textAlign: 'center' }}>
            <p style={{ fontSize: 14, color: '#8A7E72', fontFamily: FONT }}>No confirmed bookings for this date.</p>
          </div>
        ) : (
          <>
            {/* Summary bar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: '#3B2A1F', fontFamily: FONT }}>
                {orderedBookings.length} dog{orderedBookings.length !== 1 ? 's' : ''} confirmed
              </p>
              <p style={{ fontSize: 12, color: '#8A7E72', fontStyle: 'italic', fontFamily: FONT }}>
                {savingOrder ? 'Saving…' : 'Hold to reorder'}
              </p>
            </div>

            {/* Draggable booking list */}
            <DragDropContext onDragEnd={onDragEnd}>
              <Droppable droppableId="booking-list">
                {(provided) => (
                  <div ref={provided.innerRef} {...provided.droppableProps}>
                    {orderedBookings.map((b, i) => (
                      <Draggable key={b.id} draggableId={b.id} index={i}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            style={{
                              ...provided.draggableProps.style,
                              marginBottom: 8,
                              boxShadow: snapshot.isDragging ? '0 4px 16px rgba(0,0,0,0.12)' : 'none',
                            }}
                          >
                            <DogCard booking={b} dragHandleProps={provided.dragHandleProps} />
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>

            {/* Notification placeholder */}
            <div style={{ backgroundColor: 'white', border: '1px solid #E8E2D9', borderRadius: 16, padding: 16, marginTop: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <BellIcon />
                <span style={{ fontWeight: 700, color: '#3B2A1F', fontSize: 14, fontFamily: FONT }}>Notify clients</span>
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <button
                  onClick={() => alert('Coming soon')}
                  style={{ flex: 1, backgroundColor: '#EEE9E0', color: '#3B2A1F', borderRadius: 10, fontSize: 13, padding: '10px 8px', border: 'none', cursor: 'pointer', fontFamily: FONT, fontWeight: 500 }}
                >
                  ETA for pickup
                </button>
                <button
                  onClick={() => alert('Coming soon')}
                  style={{ flex: 1, backgroundColor: '#EEE9E0', color: '#3B2A1F', borderRadius: 10, fontSize: 13, padding: '10px 8px', border: 'none', cursor: 'pointer', fontFamily: FONT, fontWeight: 500 }}
                >
                  ETA for drop-off
                </button>
              </div>
              <p style={{ fontSize: 12, color: '#8A7E72', fontStyle: 'italic', fontFamily: FONT, margin: 0 }}>Notification sending coming soon</p>
            </div>
          </>
        )}

        {/* Photos section */}
        {hike && (
          <div style={{ marginTop: 32 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 3, height: 16, backgroundColor: '#26452B', borderRadius: 2, flexShrink: 0 }} />
                <h2 style={{ fontSize: 14, fontWeight: 700, color: '#3B2A1F', fontFamily: FONT, margin: 0 }}>Photos</h2>
              </div>
              <button
                onClick={() => { setShowUploadForm(!showUploadForm); setUploadError('') }}
                style={{ fontSize: 14, color: '#E08A3E', background: 'none', border: 'none', cursor: 'pointer', fontFamily: FONT, fontWeight: 500 }}
              >
                {showUploadForm ? 'Cancel' : '+ Add photo'}
              </button>
            </div>

            {/* Upload form */}
            {showUploadForm && (
              <div className="rounded-2xl border border-gray-200 p-4 mb-4 space-y-4" style={{ backgroundColor: 'white' }}>
                <div>
                  <label className="block text-xs text-gray-500 mb-2">Photo</label>
                  <input
                    type="file" accept="image/*" onChange={handleFileChange}
                    className="w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-green-50 file:text-green-700"
                  />
                  {uploadPreview && (
                    <div className="mt-3 w-full rounded-xl bg-cover bg-center" style={{ backgroundImage: `url(${uploadPreview})`, height: 160 }} />
                  )}
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-2">Tag a dog (optional)</label>
                  <select
                    value={uploadDogId} onChange={e => setUploadDogId(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    style={{ color: '#171717', backgroundColor: 'white' }}
                  >
                    <option value="">Group photo — no specific dog</option>
                    {(hike.bookings ?? []).map(b => (
                      <option key={b.dogId} value={b.dogId}>{b.dogName}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-2">Caption (optional)</label>
                  <input
                    type="text" value={uploadCaption} onChange={e => setUploadCaption(e.target.value)}
                    placeholder="What are they up to?"
                    className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    style={{ color: '#171717', WebkitTextFillColor: '#171717', backgroundColor: 'white' }}
                  />
                </div>
                {uploadError && <p className="text-xs text-red-500">{uploadError}</p>}
                <button
                  onClick={handleUpload} disabled={!uploadFile || uploading}
                  className="w-full bg-green-600 text-white py-3 rounded-xl text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
                >
                  {uploading ? 'Uploading…' : 'Upload photo'}
                </button>
              </div>
            )}

            {/* Photo grid */}
            {photos.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {photos.map(p => (
                  <div key={p.id} className="relative">
                    <div className="w-full rounded-xl bg-cover bg-center bg-gray-100" style={{ backgroundImage: `url(${getPhotoUrl(p.storagePath)})`, height: 120 }} />
                    <button
                      onClick={() => setConfirmDeleteId(p.id)}
                      className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/50 flex items-center justify-center text-white text-xs hover:bg-black/70"
                      aria-label="Delete photo"
                    >
                      🗑
                    </button>
                    {(p.dogId && dogById[p.dogId]) && (
                      <p className="text-[10px] text-green-700 font-medium mt-1 truncate">{dogById[p.dogId]}</p>
                    )}
                    {p.caption && <p className="text-[10px] text-gray-500 truncate">{p.caption}</p>}
                  </div>
                ))}
              </div>
            ) : !showUploadForm ? (
              <div style={{ border: '1px dashed #E8E2D9', borderRadius: 16, padding: '32px 24px', textAlign: 'center' }}>
                <p style={{ fontSize: 14, color: '#8A7E72', fontFamily: FONT }}>No photos yet</p>
              </div>
            ) : null}
          </div>
        )}

      </div>

      {/* Delete confirmation overlay */}
      {confirmDeleteId && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end">
          <div className="w-full bg-white rounded-t-3xl p-6 max-w-sm mx-auto">
            <p className="text-base font-semibold text-gray-900 mb-2">Delete this photo?</p>
            <p className="text-sm text-gray-500 mb-6">This will permanently remove the photo from storage and cannot be undone.</p>
            {deleteError && <p className="text-xs text-red-500 mb-4">{deleteError}</p>}
            <button
              onClick={() => handleDeletePhoto(confirmDeleteId)} disabled={deleting}
              className="w-full bg-red-600 text-white py-4 rounded-2xl text-base font-semibold mb-3 disabled:opacity-50"
            >
              {deleting ? 'Deleting…' : 'Delete photo'}
            </button>
            <button onClick={() => setConfirmDeleteId(null)} className="w-full py-4 rounded-2xl text-base font-medium text-gray-600">
              Cancel
            </button>
          </div>
        </div>
      )}
    </main>
  )
}

// ── Dog card ─────────────────────────────────────────────────────────────────

function DogCard({
  booking: b,
  dragHandleProps,
}: {
  booking: HikeBooking
  dragHandleProps: React.HTMLAttributes<HTMLDivElement> | null | undefined
}) {
  return (
    <div style={{ backgroundColor: 'white', border: '1px solid #E8E2D9', borderRadius: 16, padding: 16, display: 'flex', alignItems: 'flex-start', gap: 12 }}>

      {/* Dog photo */}
      <div style={{ flexShrink: 0 }}>
        {b.dogPhotoUrl ? (
          <img
            src={b.dogPhotoUrl}
            alt={b.dogName}
            style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', border: '2px solid #26452B', display: 'block' }}
          />
        ) : (
          <div style={{ width: 56, height: 56, borderRadius: '50%', backgroundColor: '#EEE9E0', border: '2px solid #E8E2D9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <PawIcon size={22} color="#4D6B46" />
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 16, fontWeight: 700, color: '#3B2A1F', fontFamily: "'Noto Sans', system-ui, sans-serif", margin: 0 }}>{b.dogName}</p>
        {b.ownerName && (
          <p style={{ fontSize: 13, color: '#8A7E72', fontFamily: "'Noto Sans', system-ui, sans-serif", margin: '2px 0 0' }}>{b.ownerName}</p>
        )}
        {b.ownerAddress && (
          <p style={{ fontSize: 12, color: '#8A7E72', fontFamily: "'Noto Sans', system-ui, sans-serif", margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.ownerAddress}</p>
        )}
        {b.zoneName && (
          <p style={{ fontSize: 12, color: '#4D6B46', fontFamily: "'Noto Sans', system-ui, sans-serif", margin: '2px 0 0' }}>{b.zoneName}</p>
        )}

        {/* Pickup / drop-off pills */}
        {(b.pickupMethod || b.dropoffMethod) && (
          <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {b.pickupMethod && (
              <span style={{ backgroundColor: '#EEE9E0', color: '#3B2A1F', fontSize: 12, borderRadius: 20, padding: '3px 10px', fontFamily: "'Noto Sans', system-ui, sans-serif" }}>
                Pickup: {b.pickupMethod}
              </span>
            )}
            {b.dropoffMethod && (
              <span style={{ backgroundColor: '#EEE9E0', color: '#3B2A1F', fontSize: 12, borderRadius: 20, padding: '3px 10px', fontFamily: "'Noto Sans', system-ui, sans-serif" }}>
                Drop-off: {b.dropoffMethod}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Drag handle — 44px touch target */}
      <div
        {...(dragHandleProps ?? {})}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, flexShrink: 0, marginRight: -8, cursor: 'grab' }}
      >
        <DragHandleIcon />
      </div>

    </div>
  )
}
