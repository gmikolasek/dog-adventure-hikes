'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

const sections = [
  {
    id: 'service',
    title: '1. Service Overview',
    body: 'Dog Adventure Hikes provides supervised hiking experiences for dogs in and around Ulaanbaatar. Hikes operate on scheduled zone days, subject to weather and ground conditions. The Service reserves the right to cancel any hike if conditions fall below safe operating thresholds — typically below –12°C, or at guide discretion. In the event of a Service-initiated cancellation, the full hike fee will be credited to your account.'
  },
  {
    id: 'payment',
    title: '2. Booking and Payment',
    body: 'The hike fee is ₮50,000 per dog per session. Payment is made in full at the time of booking. No booking is confirmed until payment is received. Trail Pack: 4 hikes purchased together save ₮25,000 — credits are added to your account immediately. Outstanding holding fees are added to your next booking total and must be cleared before payment can proceed.'
  },
  {
    id: 'pickup',
    title: '3. Pickup and Drop-off',
    body: 'Pickups occur between 7:00am and 10:00am. Drop-offs are completed by 3:30pm. You must specify your pickup and drop-off method at time of booking: curbside (you meet the van) or home pickup (van comes to your door, someone must be present). If no one is available to receive your dog within 10 minutes of the arrival notification, a holding fee will apply.'
  },
  {
    id: 'cancellation',
    title: '4. Cancellation and No-Show Policy',
    body: 'Cancellation more than 12 hours before the hike: fee held as credit for future use. Cancellation within 12 hours: full fee forfeited. No-show (not present at pickup): full fee forfeited. The Service will attempt one contact before departing. Service-initiated cancellation: full fee credited to your account.'
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

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.push('/')
    })
  }, [router])

  const allChecked = sections.every(s => checked[s.id])

  function toggle(id: string) {
    setChecked(prev => ({ ...prev, [id]: !prev[id] }))
  }

  async function acceptContract() {
    setLoading(true)
    setError('')

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/'); return }

    const { error } = await supabase
      .from('users')
      .update({ approved_at: null })
      .eq('id', session.user.id)

    if (error) {
      setError(error.message)
    } else {
      router.push('/onboarding/pending')
    }
    setLoading(false)
  }

  return (
    <main className="min-h-screen bg-white px-6 py-10">
      <div className="w-full max-w-sm mx-auto">

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
            <span className="text-3xl">📋</span>
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">Service agreement</h1>
          <p className="text-gray-500 mt-1 text-sm">Please read and confirm each section</p>
        </div>

        <div className="space-y-4 mb-8">
          {sections.map(section => (
            <div
              key={section.id}
              className={`rounded-xl border-2 p-4 transition-colors ${
                checked[section.id]
                  ? 'border-green-500 bg-green-50'
                  : 'border-gray-200'
              }`}
            >
              <h3 className="text-sm font-semibold text-gray-900 mb-2">{section.title}</h3>
              <p className="text-xs text-gray-600 leading-relaxed mb-3">{section.body}</p>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checked[section.id] ?? false}
                  onChange={() => toggle(section.id)}
                  className="h-4 w-4 text-green-600 rounded border-gray-300"
                />
                <span className="text-xs font-medium text-gray-700">
                  I have read and agree to this section
                </span>
              </label>
            </div>
          ))}
        </div>

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        <button
          onClick={acceptContract}
          disabled={!allChecked || loading}
          className="w-full bg-green-600 text-white py-3 rounded-xl font-medium text-sm disabled:opacity-50 hover:bg-green-700 transition-colors"
        >
          {loading ? 'Submitting...' : allChecked ? 'Accept and submit profile →' : `${sections.filter(s => !checked[s.id]).length} section${sections.filter(s => !checked[s.id]).length !== 1 ? 's' : ''} remaining`}
        </button>

        <p className="text-xs text-gray-400 text-center mt-4">
          Your profile will be reviewed by our team before your first booking.
        </p>

      </div>
    </main>
  )
}
