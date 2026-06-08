'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const FONT = "'Noto Sans', system-ui, sans-serif"

// Same contract text as onboarding/contract
const sections = [
  {
    id: 'service',
    title: '1. Service Overview',
    body: 'Dog Adventure Hikes provides supervised hiking experiences for dogs in and around Ulaanbaatar. Hikes operate on scheduled zone days, subject to weather and ground conditions. The Service reserves the right to cancel any hike if conditions fall below safe operating thresholds — typically below –12°C, or at guide discretion. In the event of a Service-initiated cancellation, the full hike fee will be credited to your account.'
  },
  {
    id: 'payment',
    title: '2. Booking and Payment',
    body: 'The hike fee is ₮50,000 per dog per session. Payment is made in full at the time of booking. No booking is confirmed until payment is received. Trail Pack: 4 hikes purchased together save ₮20,000 — credits are added to your account immediately. Outstanding holding fees are added to your next booking total and must be cleared before payment can proceed.'
  },
  {
    id: 'pickup',
    title: '3. Pickup and Drop-off',
    body: 'Pickups occur between 7:00am and 10:00am. Drop-offs are completed by 3:30pm. You must specify your pickup and drop-off method at time of booking: curbside (you meet the van) or home pickup (van comes to your door, someone must be present). If no one is available to receive your dog within 10 minutes of the arrival notification, a holding fee will apply.'
  },
  {
    id: 'cancellation',
    title: '4. Cancellation and No-Show Policy',
    body: 'Cancellation before 5pm the day before the hike (Ulaanbaatar time): fee held as 1 Trail Pack credit, valid 60 days. Cancellation after 5pm the day before, or on the day of the hike: full fee forfeited. No-show (not present at pickup): full fee forfeited. The Service will attempt one contact before departing. Service-initiated cancellation: full fee credited to your account.'
  },
  {
    id: 'equipment',
    title: '5. Dog Eligibility and Equipment',
    body: 'Your dog must be in good health, up to date on vaccinations, and not in heat or visibly injured on the day of the hike. Required: a functioning AirTag collar or equivalent GPS tracker. Dogs without a GPS tracker will not be accepted at pickup and the fee will be forfeited. Strongly recommended: an e-collar for dogs with poor recall.'
  },
  {
    id: 'vet',
    title: '6. Emergency Veterinary Care',
    body: 'In the event of injury or medical emergency, the Service will transport your dog to the nearest appropriate veterinary facility and contact you immediately. You are responsible for all veterinary costs. By accepting this agreement, you authorise the Service to seek emergency veterinary care on your behalf if you cannot be reached.'
  },
  {
    id: 'liability',
    title: '7. Liability',
    body: 'Hiking with dogs involves inherent physical risk including rough terrain, wildlife, weather, and interaction with other dogs. The Service takes all reasonable precautions but cannot guarantee your dog\'s safety in all circumstances. The Service is not liable for injury, illness, or loss that occurs despite reasonable supervision and care.'
  },
  {
    id: 'photos',
    title: '8. Photography and Social Media',
    body: 'The Service may photograph or video dogs during hikes for use on social media and promotional materials. You may opt out at any time by updating your preferences in the app. Opting out does not affect your booking eligibility.'
  },
]

function fmtDate(iso: string): string {
  const d = new Date(iso)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const day = String(d.getDate()).padStart(2, '0')
  return `${day} ${months[d.getMonth()]} ${d.getFullYear()}`
}

function BackArrow() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#26452B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}

export default function ContractView() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [acceptedAt, setAcceptedAt] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }

      const { data } = await supabase
        .from('users')
        .select('contract_accepted_at, contract_version')
        .eq('id', session.user.id)
        .maybeSingle()

      setAcceptedAt(data?.contract_accepted_at ?? null)
      setReady(true)
    }
    load()
  }, [router])

  if (!ready) {
    return (
      <main style={{ minHeight: '100vh', backgroundColor: '#F5F0E8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT }}>
        <p style={{ fontSize: 14, color: '#8A7E72' }}>Loading…</p>
      </main>
    )
  }

  return (
    <main style={{ minHeight: '100vh', backgroundColor: '#F5F0E8', fontFamily: FONT, padding: '40px 24px 60px' }}>
      <div style={{ width: '100%', maxWidth: 384, margin: '0 auto' }}>

        {/* Back button */}
        <button
          onClick={() => router.push('/client/home')}
          style={{ width: 32, height: 32, borderRadius: '50%', backgroundColor: '#E8E2D9', border: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', marginBottom: 24, padding: 0, flexShrink: 0 }}
        >
          <BackArrow />
        </button>

        {/* Title */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: '#3B2A1F', fontFamily: FONT, margin: 0 }}>Service agreement</h1>
          <p style={{ fontSize: 14, color: '#8A7E72', fontFamily: FONT, margin: '4px 0 0' }}>
            Tails to Trails — version 1.0
          </p>
        </div>

        {/* Contract sections (read-only) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 32 }}>
          {sections.map(section => (
            <div
              key={section.id}
              style={{
                backgroundColor: 'white',
                border: '1px solid #E8E2D9',
                borderRadius: 12,
                padding: 16,
              }}
            >
              <h3 style={{ fontSize: 14, fontWeight: 600, color: '#3B2A1F', marginBottom: 8, fontFamily: FONT }}>{section.title}</h3>
              <p style={{ fontSize: 12, color: '#3B2A1F', lineHeight: 1.6, margin: 0, fontFamily: FONT }}>{section.body}</p>
            </div>
          ))}
        </div>

        {/* Acceptance confirmation */}
        <div style={{ backgroundColor: '#E8F0E5', border: '1px solid #C8DBBE', borderRadius: 12, padding: 16, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ width: 20, height: 20, borderRadius: '50%', backgroundColor: '#26452B', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
            <svg width={10} height={10} viewBox="0 0 12 12" fill="none">
              <polyline points="2,6 5,9 10,3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#26452B', fontFamily: FONT, margin: 0 }}>Agreement accepted</p>
            {acceptedAt ? (
              <p style={{ fontSize: 12, color: '#4D6B46', fontFamily: FONT, margin: '2px 0 0' }}>
                You accepted this agreement on {fmtDate(acceptedAt)}
              </p>
            ) : (
              <p style={{ fontSize: 12, color: '#8A7E72', fontFamily: FONT, margin: '2px 0 0' }}>
                Acceptance date unavailable
              </p>
            )}
          </div>
        </div>

      </div>
    </main>
  )
}
