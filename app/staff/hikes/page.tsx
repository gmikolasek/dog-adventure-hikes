'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { getUpcomingHikeSummaries, type HikeSummary } from '@/lib/adminData'
import { formatFull, todayIso } from '@/lib/booking'

const FONT = "'Noto Sans', system-ui, sans-serif"
const PAST_PAGE_SIZE = 30

async function fetchPhotosByDay(dayIds: string[]): Promise<Record<string, string[]>> {
  if (!dayIds.length) return {}
  const { data: bookingRows } = await supabase
    .from('bookings')
    .select('hike_day_id, dog_id')
    .in('hike_day_id', dayIds)
    .eq('status', 'confirmed')
  const dogIds = [...new Set((bookingRows ?? []).map((b: { dog_id: string }) => b.dog_id))]
  if (!dogIds.length) return {}
  const { data: dogRows } = await supabase
    .from('dogs')
    .select('id, photo_url')
    .in('id', dogIds)
    .not('photo_url', 'is', null)
  const photoByDogId: Record<string, string> = {}
  for (const d of (dogRows ?? []) as { id: string; photo_url: string | null }[]) {
    if (d.photo_url) photoByDogId[d.id] = d.photo_url
  }
  const result: Record<string, string[]> = {}
  for (const b of (bookingRows ?? []) as { hike_day_id: string; dog_id: string }[]) {
    const photo = photoByDogId[b.dog_id]
    if (photo) {
      if (!result[b.hike_day_id]) result[b.hike_day_id] = []
      if (result[b.hike_day_id].length < 3) result[b.hike_day_id].push(photo)
    }
  }
  return result
}

function BackArrow() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#26452B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6"/>
    </svg>
  )
}

function ChevronRight() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#4D6B46" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  )
}

function PawIcon() {
  return (
    <svg width={28} height={28} viewBox="0 0 24 24" fill="#C0B8AE">
      <circle cx="6"  cy="5.5" r="1.8"/>
      <circle cx="11" cy="4"   r="1.8"/>
      <circle cx="16" cy="4"   r="1.8"/>
      <circle cx="20.5" cy="7" r="1.6"/>
      <ellipse cx="12.5" cy="15.5" rx="6" ry="5"/>
    </svg>
  )
}

export default function HikesPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [hikes, setHikes] = useState<HikeSummary[]>([])
  const [photosByDay, setPhotosByDay] = useState<Record<string, string[]>>({})

  const [pastOpen, setPastOpen] = useState(false)
  const [pastHikes, setPastHikes] = useState<HikeSummary[]>([])
  const [pastPhotosByDay, setPastPhotosByDay] = useState<Record<string, string[]>>({})
  const [pastLoading, setPastLoading] = useState(false)
  const [pastLoaded, setPastLoaded] = useState(false)
  const [pastOffset, setPastOffset] = useState(0)
  const [pastHasMore, setPastHasMore] = useState(false)
  const [pastLoadingMore, setPastLoadingMore] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/'); return }

      const { data: profile } = await supabase
        .from('users').select('role').eq('id', session.user.id).maybeSingle()
      if (profile?.role !== 'staff') { router.push('/onboarding'); return }

      const summaries = await getUpcomingHikeSummaries()
      setHikes(summaries)

      // Fetch up to 3 dog photo URLs per hike day for thumbnails
      if (summaries.length > 0) {
        const dayIds = summaries.map(s => s.hikeDayId)

        const { data: bookingRows } = await supabase
          .from('bookings')
          .select('hike_day_id, dog_id')
          .in('hike_day_id', dayIds)
          .eq('status', 'confirmed')

        const dogIds = [...new Set((bookingRows ?? []).map((b: { dog_id: string }) => b.dog_id))]

        if (dogIds.length > 0) {
          const { data: dogRows } = await supabase
            .from('dogs')
            .select('id, photo_url')
            .in('id', dogIds)
            .not('photo_url', 'is', null)

          const photoByDogId: Record<string, string> = {}
          for (const d of (dogRows ?? []) as { id: string; photo_url: string | null }[]) {
            if (d.photo_url) photoByDogId[d.id] = d.photo_url
          }

          const result: Record<string, string[]> = {}
          for (const b of (bookingRows ?? []) as { hike_day_id: string; dog_id: string }[]) {
            const photo = photoByDogId[b.dog_id]
            if (photo) {
              if (!result[b.hike_day_id]) result[b.hike_day_id] = []
              if (result[b.hike_day_id].length < 3) result[b.hike_day_id].push(photo)
            }
          }
          setPhotosByDay(result)
        }
      }

      setReady(true)
    }
    load()
  }, [router])

  async function loadPastHikes() {
    if (pastLoaded) return
    setPastLoading(true)

    const { data: pastDays } = await supabase
      .from('hike_days')
      .select('id, date, destination_override, status')
      .lt('date', todayIso())
      .order('date', { ascending: false })
      .range(0, PAST_PAGE_SIZE - 1)

    const days = (pastDays ?? []) as Array<{ id: string; date: string; destination_override: string | null; status: string }>

    const { data: countRows } = await supabase.rpc('hike_day_booked_counts')
    const countById: Record<string, number> = {}
    for (const r of (countRows ?? []) as { hike_day_id: string; confirmed: number }[]) {
      countById[r.hike_day_id] = r.confirmed
    }

    setPastHikes(days.map(d => ({
      date: d.date,
      hikeDayId: d.id,
      destination: d.destination_override,
      dogCount: countById[d.id] ?? 0,
    })))
    setPastHasMore(days.length === PAST_PAGE_SIZE)
    setPastOffset(PAST_PAGE_SIZE)

    const photos = await fetchPhotosByDay(days.map(d => d.id))
    setPastPhotosByDay(photos)

    setPastLoaded(true)
    setPastLoading(false)
  }

  async function loadMorePastHikes() {
    if (pastLoadingMore) return
    setPastLoadingMore(true)

    const { data: pastDays } = await supabase
      .from('hike_days')
      .select('id, date, destination_override, status')
      .lt('date', todayIso())
      .order('date', { ascending: false })
      .range(pastOffset, pastOffset + PAST_PAGE_SIZE - 1)

    const days = (pastDays ?? []) as Array<{ id: string; date: string; destination_override: string | null; status: string }>

    if (days.length > 0) {
      const { data: countRows } = await supabase.rpc('hike_day_booked_counts')
      const countById: Record<string, number> = {}
      for (const r of (countRows ?? []) as { hike_day_id: string; confirmed: number }[]) {
        countById[r.hike_day_id] = r.confirmed
      }

      setPastHikes(prev => [...prev, ...days.map(d => ({
        date: d.date,
        hikeDayId: d.id,
        destination: d.destination_override,
        dogCount: countById[d.id] ?? 0,
      }))])
      setPastOffset(prev => prev + PAST_PAGE_SIZE)

      const photos = await fetchPhotosByDay(days.map(d => d.id))
      setPastPhotosByDay(prev => ({ ...prev, ...photos }))
    }

    setPastHasMore(days.length === PAST_PAGE_SIZE)
    setPastLoadingMore(false)
  }

  if (!ready) {
    return (
      <main style={{ minHeight: '100vh', backgroundColor: '#F5F0E8', fontFamily: FONT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontSize: 14, color: '#8A7E72' }}>Loading…</p>
      </main>
    )
  }

  const today = new Date().toISOString().slice(0, 10)

  return (
    <main style={{ minHeight: '100vh', backgroundColor: '#F5F0E8', fontFamily: FONT, padding: '40px 24px' }}>
      <div style={{ width: '100%', maxWidth: 384, margin: '0 auto' }}>

        {/* Back button */}
        <button
          onClick={() => router.push('/staff')}
          style={{ width: 32, height: 32, borderRadius: '50%', backgroundColor: '#E8E2D9', border: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', marginBottom: 24, padding: 0, flexShrink: 0 }}
        >
          <BackArrow />
        </button>

        {/* Title */}
        <h1 style={{ fontSize: 26, fontWeight: 700, color: '#3B2A1F', fontFamily: FONT, margin: '0 0 20px' }}>
          Hikes
        </h1>

        {hikes.length === 0 ? (
          /* Empty state */
          <div style={{ backgroundColor: 'white', borderRadius: 16, padding: 32, textAlign: 'center' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 64, height: 64, borderRadius: '50%', backgroundColor: '#EEE9E0', marginBottom: 16 }}>
              <PawIcon />
            </div>
            <p style={{ fontSize: 16, fontWeight: 700, color: '#3B2A1F', fontFamily: FONT, margin: '0 0 8px' }}>No upcoming hikes</p>
            <p style={{ fontSize: 14, color: '#8A7E72', fontFamily: FONT, margin: 0 }}>Open dates on the calendar to start taking bookings.</p>
          </div>
        ) : (
          <div>
            {hikes.map(hike => {
              const isToday = hike.date === today
              const formattedDate = (() => {
                try { return formatFull(hike.date) } catch { return hike.date }
              })()
              const photos = photosByDay[hike.hikeDayId] ?? []
              const extraCount = hike.dogCount - 3

              return (
                <button
                  key={hike.date}
                  onClick={() => router.push(`/staff/hikes/${hike.date}`)}
                  style={{
                    width: '100%',
                    backgroundColor: 'white',
                    border: '1px solid #E8E2D9',
                    borderRadius: 16,
                    padding: 16,
                    marginBottom: 8,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontFamily: FONT,
                  }}
                >
                  {/* Left: date + destination + dog count */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: hike.destination ? 2 : 6 }}>
                      <span style={{ fontSize: 16, fontWeight: 700, color: '#3B2A1F', fontFamily: FONT }}>{formattedDate}</span>
                      {isToday && (
                        <span style={{ backgroundColor: '#E08A3E', color: 'white', borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 600, fontFamily: FONT, flexShrink: 0 }}>
                          Today
                        </span>
                      )}
                    </div>

                    {hike.destination && (
                      <p style={{ fontSize: 13, color: '#4D6B46', fontFamily: FONT, margin: '0 0 6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {hike.destination}
                      </p>
                    )}

                    {/* Thumbnails + dog count */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {photos.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          {photos.map((url, i) => (
                            <img
                              key={i}
                              src={url}
                              alt=""
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: '50%',
                                objectFit: 'cover',
                                border: '2px solid white',
                                marginLeft: i > 0 ? -8 : 0,
                                position: 'relative',
                                zIndex: 3 - i,
                                display: 'block',
                              }}
                            />
                          ))}
                          {extraCount > 0 && (
                            <span style={{ fontSize: 12, color: '#8A7E72', fontFamily: FONT, marginLeft: 6 }}>
                              +{extraCount}
                            </span>
                          )}
                        </div>
                      )}
                      <span style={{ fontSize: 13, color: '#8A7E72', fontFamily: FONT }}>
                        {hike.dogCount} dog{hike.dogCount !== 1 ? 's' : ''} confirmed
                      </span>
                    </div>
                  </div>

                  {/* Right: chevron */}
                  <div style={{ flexShrink: 0, marginLeft: 12 }}>
                    <ChevronRight />
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {/* Past hikes */}
        <button
          onClick={() => {
            const next = !pastOpen
            setPastOpen(next)
            if (next && !pastLoaded) loadPastHikes()
          }}
          style={{ width: '100%', backgroundColor: 'white', border: '1px solid #E8E2D9', color: '#3B2A1F', borderRadius: 12, padding: '12px 16px', fontSize: 14, fontWeight: 600, fontFamily: FONT, cursor: 'pointer', marginTop: 12 }}
        >
          {pastOpen ? '▲ Hide past hikes' : '▼ Past hikes'}
        </button>

        {pastOpen && (
          <div style={{ marginTop: 12 }}>
            {pastLoading ? (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <p style={{ fontSize: 14, color: '#8A7E72', fontFamily: FONT }}>Loading…</p>
              </div>
            ) : pastHikes.length === 0 ? (
              <p style={{ fontSize: 14, color: '#8A7E72', fontFamily: FONT, textAlign: 'center', padding: '24px 0' }}>No past hikes found.</p>
            ) : (
              <div>
                {pastHikes.map(hike => {
                  const formattedDate = (() => {
                    try { return formatFull(hike.date) } catch { return hike.date }
                  })()
                  const photos = pastPhotosByDay[hike.hikeDayId] ?? []
                  const extraCount = hike.dogCount - 3

                  return (
                    <button
                      key={hike.date}
                      onClick={() => router.push(`/staff/hikes/${hike.date}`)}
                      style={{
                        width: '100%',
                        backgroundColor: 'white',
                        border: '1px solid #E8E2D9',
                        borderRadius: 16,
                        padding: 16,
                        marginBottom: 8,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        textAlign: 'left',
                        cursor: 'pointer',
                        fontFamily: FONT,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: hike.destination ? 2 : 6 }}>
                          <span style={{ fontSize: 16, fontWeight: 700, color: '#3B2A1F', fontFamily: FONT }}>{formattedDate}</span>
                        </div>
                        {hike.destination && (
                          <p style={{ fontSize: 13, color: '#4D6B46', fontFamily: FONT, margin: '0 0 6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {hike.destination}
                          </p>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {photos.length > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                              {photos.map((url, i) => (
                                <img
                                  key={i}
                                  src={url}
                                  alt=""
                                  style={{
                                    width: 28,
                                    height: 28,
                                    borderRadius: '50%',
                                    objectFit: 'cover',
                                    border: '2px solid white',
                                    marginLeft: i > 0 ? -8 : 0,
                                    position: 'relative',
                                    zIndex: 3 - i,
                                    display: 'block',
                                  }}
                                />
                              ))}
                              {extraCount > 0 && (
                                <span style={{ fontSize: 12, color: '#8A7E72', fontFamily: FONT, marginLeft: 6 }}>
                                  +{extraCount}
                                </span>
                              )}
                            </div>
                          )}
                          <span style={{ fontSize: 13, color: '#8A7E72', fontFamily: FONT }}>
                            {hike.dogCount} dog{hike.dogCount !== 1 ? 's' : ''} confirmed
                          </span>
                        </div>
                      </div>
                      <div style={{ flexShrink: 0, marginLeft: 12 }}>
                        <ChevronRight />
                      </div>
                    </button>
                  )
                })}
                {pastHasMore && (
                  <button
                    onClick={loadMorePastHikes}
                    disabled={pastLoadingMore}
                    style={{ width: '100%', backgroundColor: 'white', border: '1px solid #E8E2D9', color: '#3B2A1F', borderRadius: 12, padding: '12px 16px', fontSize: 14, fontWeight: 600, fontFamily: FONT, cursor: pastLoadingMore ? 'not-allowed' : 'pointer', marginTop: 4, opacity: pastLoadingMore ? 0.6 : 1 }}
                  >
                    {pastLoadingMore ? 'Loading…' : 'Load more past hikes'}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

      </div>
    </main>
  )
}
