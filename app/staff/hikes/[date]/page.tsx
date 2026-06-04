'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import { getHikeForDate, type HikeDetail, type HikeBooking } from '@/lib/adminData'
import { formatFull } from '@/lib/booking'
import { uploadHikePhoto, getPhotoUrl, type HikePhoto } from '@/lib/photos'

export default function HikeDetailPage() {
  const router = useRouter()
  const params = useParams()
  const date = params.date as string

  const [ready, setReady] = useState(false)
  const [hike, setHike] = useState<HikeDetail | null>(null)
  const [staffUserId, setStaffUserId] = useState('')

  // Photo state
  const [photos, setPhotos] = useState<HikePhoto[]>([])
  const [showUploadForm, setShowUploadForm] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadPreview, setUploadPreview] = useState<string | null>(null)
  const [uploadDogId, setUploadDogId] = useState('')
  const [uploadCaption, setUploadCaption] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

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

      setStaffUserId(session.user.id)

      const hikeData = await getHikeForDate(date)
      setHike(hikeData)

      if (hikeData?.hikeDayId) {
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

  if (!ready) {
    return (
      <main className="min-h-screen bg-white flex items-center justify-center px-6">
        <p className="text-sm text-gray-400">Loading…</p>
      </main>
    )
  }

  const formattedDate = (() => {
    try { return formatFull(date) } catch { return date }
  })()

  const dogById: Record<string, string> = {}
  for (const b of hike?.bookings ?? []) dogById[b.dogId] = b.dogName

  return (
    <main className="min-h-screen bg-white px-6 py-10">
      <div className="w-full max-w-sm mx-auto">

        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => router.push('/staff/hikes')}
            className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 text-lg leading-none"
          >
            ←
          </button>
          <div>
            <h1 className="text-lg font-semibold text-gray-900 leading-tight">Hike · {formattedDate}</h1>
            {hike?.destination && (
              <p className="text-xs text-gray-500 mt-0.5">{hike.destination}</p>
            )}
          </div>
        </div>

        {!hike || hike.bookings.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 px-6 py-10 text-center">
            <p className="text-sm text-gray-400">No confirmed bookings for this date.</p>
          </div>
        ) : (
          <>
            {/* Summary bar */}
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-gray-500">
                {hike.bookings.length} dog{hike.bookings.length !== 1 ? 's' : ''} confirmed
              </p>
              <p className="text-xs text-gray-400">Sorted by zone</p>
            </div>

            {/* Map placeholder */}
            <button
              disabled
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 py-3 mb-4 text-sm text-gray-400 cursor-not-allowed"
            >
              <span>📍</span>
              <span>View pickup map</span>
              <span className="text-[11px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded ml-1">coming soon</span>
            </button>

            {/* Booking list */}
            <div className="rounded-2xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
              {hike.bookings.map((b, i) => (
                <BookingDetailRow key={b.id} booking={b} index={i + 1} />
              ))}
            </div>
          </>
        )}

        {/* ── Photos section ── */}
        {hike && (
          <div className="mt-10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-900">Photos</h2>
              <button
                onClick={() => { setShowUploadForm(!showUploadForm); setUploadError('') }}
                className="text-sm text-green-600 hover:text-green-700 font-medium"
              >
                {showUploadForm ? 'Cancel' : '+ Add photo'}
              </button>
            </div>

            {/* Upload form */}
            {showUploadForm && (
              <div className="rounded-2xl border border-gray-200 p-4 mb-4 space-y-4">
                {/* File picker */}
                <div>
                  <label className="block text-xs text-gray-500 mb-2">Photo</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-green-50 file:text-green-700"
                  />
                  {uploadPreview && (
                    <div
                      className="mt-3 w-full rounded-xl bg-cover bg-center"
                      style={{ backgroundImage: `url(${uploadPreview})`, height: 160 }}
                    />
                  )}
                </div>

                {/* Dog tag */}
                <div>
                  <label className="block text-xs text-gray-500 mb-2">Tag a dog (optional)</label>
                  <select
                    value={uploadDogId}
                    onChange={e => setUploadDogId(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    <option value="">Group photo — no specific dog</option>
                    {(hike.bookings ?? []).map(b => (
                      <option key={b.dogId} value={b.dogId}>{b.dogName}</option>
                    ))}
                  </select>
                </div>

                {/* Caption */}
                <div>
                  <label className="block text-xs text-gray-500 mb-2">Caption (optional)</label>
                  <input
                    type="text"
                    value={uploadCaption}
                    onChange={e => setUploadCaption(e.target.value)}
                    placeholder="What are they up to?"
                    className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>

                {uploadError && <p className="text-xs text-red-500">{uploadError}</p>}

                <button
                  onClick={handleUpload}
                  disabled={!uploadFile || uploading}
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
                  <div key={p.id}>
                    <div
                      className="w-full rounded-xl bg-cover bg-center bg-gray-100"
                      style={{ backgroundImage: `url(${getPhotoUrl(p.storagePath)})`, height: 120 }}
                    />
                    {(p.dogId && dogById[p.dogId]) && (
                      <p className="text-[10px] text-green-700 font-medium mt-1 truncate">{dogById[p.dogId]}</p>
                    )}
                    {p.caption && (
                      <p className="text-[10px] text-gray-500 truncate">{p.caption}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : !showUploadForm ? (
              <div className="rounded-2xl border border-dashed border-gray-200 p-8 text-center">
                <p className="text-sm text-gray-400">No photos yet</p>
                <p className="text-xs text-gray-300 mt-1">Add photos from the hike above</p>
              </div>
            ) : null}
          </div>
        )}

      </div>
    </main>
  )
}

function BookingDetailRow({ booking: b, index }: { booking: HikeBooking; index: number }) {
  return (
    <div className="px-4 py-4">
      <div className="flex items-start gap-3">
        <div className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-green-600 text-white text-xs font-semibold flex-shrink-0 mt-0.5">
          {index}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">{b.dogName}</p>
          <p className="text-xs text-gray-700 mt-0.5">{b.ownerName ?? '—'}</p>
          {b.ownerPhone && (
            <p className="text-xs text-gray-500">{b.ownerPhone}</p>
          )}
          {b.ownerAddress && (
            <p className="text-xs text-gray-500 mt-0.5">{b.ownerAddress}</p>
          )}
          {b.zoneName && (
            <p className="text-[11px] text-gray-400 mt-1">{b.zoneName}</p>
          )}

          <div className="flex flex-wrap gap-1.5 mt-2">
            {b.pickupMethod && (
              <MethodChip label="Pickup" method={b.pickupMethod} />
            )}
            {b.dropoffMethod && (
              <MethodChip label="Drop-off" method={b.dropoffMethod} />
            )}
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-green-100 text-green-700">
              confirmed
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

function MethodChip({ label, method }: { label: string; method: 'curbside' | 'home' }) {
  const cls = method === 'home' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${cls}`}>
      {label}: {method}
    </span>
  )
}
