'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const FONT = "'Noto Sans', system-ui, sans-serif"

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

export default function Contract() {
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  const allChecked = sections.every(s => checked[s.id])

  function toggle(id: string) {
    setChecked(prev => ({ ...prev, [id]: !prev[id] }))
  }

  // Contract acceptance is stored in localStorage here. All onboarding
  // data (profile + dog + contract) is written to Supabase after the
  // user completes phone auth on the login page.

  function acceptContract() {
    localStorage.setItem('onboarding_contract', JSON.stringify({ accepted: true }))
    router.push('/login')
  }

  const remaining = sections.filter(s => !checked[s.id]).length

  return (
    <main style={{ minHeight: '100vh', backgroundColor: '#F5F0E8', fontFamily: FONT, padding: '40px 24px' }}>
      <div style={{ width: '100%', maxWidth: 384, margin: '0 auto' }}>

        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 64, height: 64, borderRadius: '50%', backgroundColor: '#E8F0E5', marginBottom: 16 }}>
            <span style={{ fontSize: 28 }}>📋</span>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#3B2A1F', fontFamily: FONT }}>Service agreement</h1>
          <p style={{ color: '#8A7E72', marginTop: 4, fontSize: 14, fontFamily: FONT }}>Please read and confirm each section</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 32 }}>
          {sections.map(section => (
            <div
              key={section.id}
              style={{
                borderRadius: 12,
                border: checked[section.id] ? '2px solid #26452B' : '1px solid #E8E2D9',
                backgroundColor: checked[section.id] ? '#E8F0E5' : 'white',
                padding: 16,
              }}
            >
              <h3 style={{ fontSize: 14, fontWeight: 600, color: '#3B2A1F', marginBottom: 8, fontFamily: FONT }}>{section.title}</h3>
              <p style={{ fontSize: 12, color: '#3B2A1F', lineHeight: 1.6, marginBottom: 12, fontFamily: FONT }}>{section.body}</p>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={checked[section.id] ?? false}
                  onChange={() => toggle(section.id)}
                  style={{ width: 16, height: 16, accentColor: '#26452B', flexShrink: 0 }}
                />
                <span style={{ fontSize: 12, fontWeight: 500, color: '#3B2A1F', fontFamily: FONT }}>
                  I have read and agree to this section
                </span>
              </label>
            </div>
          ))}
        </div>

        {error && <p style={{ color: '#ef4444', fontSize: 14, marginBottom: 16 }}>{error}</p>}

        <button
          onClick={acceptContract}
          disabled={!allChecked || loading}
          style={{ width: '100%', backgroundColor: '#26452B', color: 'white', padding: '14px', borderRadius: 12, fontWeight: 600, fontSize: 15, border: 'none', cursor: allChecked && !loading ? 'pointer' : 'not-allowed', opacity: allChecked && !loading ? 1 : 0.5, fontFamily: FONT }}
        >
          {loading ? 'Submitting...' : allChecked ? 'Accept and submit profile →' : `${remaining} section${remaining !== 1 ? 's' : ''} remaining`}
        </button>

        <p style={{ fontSize: 12, color: '#8A7E72', textAlign: 'center', marginTop: 16, fontFamily: FONT }}>
          Your profile will be reviewed by our team before your first booking.
        </p>

      </div>
    </main>
  )
}
