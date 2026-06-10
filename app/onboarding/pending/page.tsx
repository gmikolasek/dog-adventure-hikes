'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getUserState } from '@/lib/userState'

const FONT = "'Noto Sans', system-ui, sans-serif"
const forest = '#26452B'
const brown = '#3B2A1F'
const muted = '#8A7E72'
const cardBorder = '#E8E2D9'
const completeBg = '#E8F0E5'
const badgeBg = '#EEE9E0'
const moss = '#4D6B46'

type PendingDog = {
  id: string
  name: string
  breed: string | null
  photo_url: string | null
  approval_status: string
}

function DogStatusBadge({ status }: { status: string }) {
  let bg: string, color: string, label: string
  if (status === 'approved') { bg = completeBg; color = forest; label = 'Approved' }
  else if (status === 'approved_with_conditions') { bg = '#FEF3C7'; color = '#B45309'; label = 'Approved with conditions' }
  else if (status === 'pending') { bg = badgeBg; color = muted; label = 'Pending review' }
  else { bg = '#FEE2E2'; color = '#B91C1C'; label = 'Declined' }
  return (
    <span style={{ backgroundColor: bg, color, borderRadius: 20, padding: '2px 10px', fontSize: 12, fontFamily: FONT, fontWeight: 600, flexShrink: 0 }}>
      {label}
    </span>
  )
}

const statusItems = [
  { label: 'Account created', done: true },
  { label: 'Dog profile submitted', done: true },
  { label: 'Agreement accepted', done: true },
]

export default function Pending() {
  const router = useRouter()
  const [dogs, setDogs] = useState<PendingDog[]>([])

  useEffect(() => {
    let active = true

    async function check() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!active) return
      if (!session) return

      // Fetch all dogs for display
      const { data: dogRows } = await supabase
        .from('dogs')
        .select('id, name, breed, photo_url, approval_status')
        .eq('owner_id', session.user.id)
        .order('created_at', { ascending: true })
      if (active) setDogs((dogRows ?? []) as PendingDog[])

      const state = await getUserState(session.user.id)
      if (!active) return

      const dogApproved = state.dogs.some(
        d => d.approval_status === 'approved' || d.approval_status === 'approved_with_conditions'
      )
      if (dogApproved) {
        router.push('/client/home')
      }
    }

    check() // check immediately, then poll every 10s
    const interval = setInterval(check, 10000)
    return () => { active = false; clearInterval(interval) }
  }, [router])

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/')
  }

  return (
    <main style={{ minHeight: '100vh', backgroundColor: '#F5F0E8', fontFamily: FONT, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: 384, textAlign: 'center' }}>

        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 80, height: 80, borderRadius: '50%', backgroundColor: completeBg, marginBottom: 24 }}>
          <span style={{ fontSize: 36 }}>🐾</span>
        </div>

        <h1 style={{ fontSize: 22, fontWeight: 700, color: brown, marginBottom: 12, fontFamily: FONT }}>You&apos;re on the list</h1>
        <p style={{ color: muted, fontSize: 14, lineHeight: 1.6, marginBottom: 32, fontFamily: FONT }}>
          Your profile and dog details have been submitted. Our team will review your application and be in touch shortly.
        </p>

        {/* Progress checklist */}
        <div style={{ backgroundColor: 'white', border: `1px solid ${cardBorder}`, borderRadius: 16, padding: 16, textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {statusItems.map(item => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', backgroundColor: forest, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ color: 'white', fontSize: 12, fontWeight: 700 }}>✓</span>
              </div>
              <span style={{ fontSize: 14, color: brown, fontFamily: FONT }}>{item.label}</span>
            </div>
          ))}

          {/* Awaiting review */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 24, height: 24, borderRadius: '50%', backgroundColor: '#F59E0B', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ color: 'white', fontSize: 10 }}>⏳</span>
            </div>
            <span style={{ fontSize: 14, color: brown, fontFamily: FONT }}>Awaiting team review</span>
          </div>

          {/* Future step */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 24, height: 24, borderRadius: '50%', backgroundColor: '#E8E2D9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ color: muted, fontSize: 12 }}>5</span>
            </div>
            <span style={{ fontSize: 14, color: muted, fontFamily: FONT }}>Book your first hike</span>
          </div>
        </div>

        {/* Dog status list */}
        {dogs.length > 0 && (
          <div style={{ marginTop: 16, backgroundColor: 'white', border: `1px solid ${cardBorder}`, borderRadius: 16, padding: 16, textAlign: 'left' }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: brown, fontFamily: FONT, margin: '0 0 12px' }}>
              {dogs.length === 1 ? 'Your dog' : 'Your dogs'}
            </p>
            {dogs.map((dog, i) => (
              <div
                key={dog.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  paddingTop: i === 0 ? 0 : 12,
                  marginTop: i === 0 ? 0 : 12,
                  borderTop: i === 0 ? 'none' : `1px solid ${cardBorder}`,
                }}
              >
                {dog.photo_url ? (
                  <img src={dog.photo_url} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: `1px solid ${cardBorder}` }} />
                ) : (
                  <div style={{ width: 40, height: 40, borderRadius: '50%', backgroundColor: badgeBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill={moss}>
                      <circle cx="5.5" cy="5.5" r="2.5" />
                      <circle cx="18.5" cy="5.5" r="2.5" />
                      <circle cx="3.5" cy="11" r="2" />
                      <circle cx="20.5" cy="11" r="2" />
                      <path d="M12 13c-2.5 0-6 2.5-6 6 0 1.5 1 2 2 2h8c1 0 2-.5 2-2 0-3.5-3.5-6-6-6z" />
                    </svg>
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: brown, fontFamily: FONT, margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dog.name}</p>
                  {dog.breed && <p style={{ fontSize: 12, color: muted, fontFamily: FONT, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dog.breed}</p>}
                </div>
                <DogStatusBadge status={dog.approval_status} />
              </div>
            ))}
          </div>
        )}

        <button
          onClick={signOut}
          style={{ marginTop: 24, background: 'none', border: 'none', fontSize: 14, color: muted, cursor: 'pointer', fontFamily: FONT }}
        >
          Sign out
        </button>

      </div>
    </main>
  )
}
