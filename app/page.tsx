'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getUserState, landingRoute } from '@/lib/userState'

export default function Home() {
  const router = useRouter()
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [step, setStep] = useState<'phone' | 'otp' | 'done'>('phone')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

async function sendOtp() {
  setLoading(true)
  setError('')
  const formatted = phone.startsWith('+') ? phone : `+976${phone}`
  console.log('Attempting OTP send to:', formatted)
  const { data, error } = await supabase.auth.signInWithOtp({ phone: formatted })
  console.log('Response data:', data)
  console.log('Response error:', error)
  if (error) {
    setError(error.message)
  } else {
    setStep('otp')
  }
  setLoading(false)
}

async function verifyOtp() {
  setLoading(true)
  setError('')
  const formatted = phone.startsWith('+') ? phone : `+976${phone}`
  const { data, error } = await supabase.auth.verifyOtp({
    phone: formatted,
    token: otp,
    type: 'sms'
  })
  if (error) {
    setError(error.message)
    setLoading(false)
    return
  }

  // Smart routing: inspect the user's state and send them to the right place.
  const userId = data.session?.user.id
  if (!userId) {
    router.push('/onboarding')
    return
  }
  const state = await getUserState(userId)
  router.push(landingRoute(state))
  setLoading(false)
}

  return (
    <main className="min-h-screen bg-white flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">

        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
            <span className="text-3xl">🐾</span>
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">Dog Adventure Hikes</h1>
          <p className="text-gray-500 mt-1 text-sm">Ulaanbaatar</p>
        </div>

        {step === 'phone' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Phone number
            </label>
            <div className="flex gap-2 mb-1">
              <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">
                +976
              </span>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !loading && phone.length >= 7) sendOtp() }}
                placeholder="8800 0000"
                className="flex-1 rounded-r-lg border border-gray-300 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <p className="text-xs text-gray-400 mb-6">We'll send you a verification code</p>
            {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
            <button
              onClick={sendOtp}
              disabled={loading || phone.length < 7}
              className="w-full bg-green-600 text-white py-3 rounded-xl font-medium text-sm disabled:opacity-50 hover:bg-green-700 transition-colors"
            >
              {loading ? 'Sending...' : 'Send verification code'}
            </button>
          </div>
        )}

        {step === 'otp' && (
          <div>
            <p className="text-sm text-gray-600 mb-6">
              Enter the 6-digit code sent to{' '}
              <span className="font-medium text-gray-900">+976 {phone}</span>
            </p>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Verification code
            </label>
            <input
              type="number"
              value={otp}
              onChange={e => setOtp(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !loading && otp.length >= 6) verifyOtp() }}
              placeholder="000000"
              maxLength={6}
              className="w-full rounded-xl border border-gray-300 px-3 py-3 text-sm text-center tracking-widest text-lg focus:outline-none focus:ring-2 focus:ring-green-500 mb-6"
            />
            {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
            <button
              onClick={verifyOtp}
              disabled={loading || otp.length < 6}
              className="w-full bg-green-600 text-white py-3 rounded-xl font-medium text-sm disabled:opacity-50 hover:bg-green-700 transition-colors"
            >
              {loading ? 'Verifying...' : 'Verify code'}
            </button>
            <button
              onClick={() => setStep('phone')}
              className="w-full mt-3 text-sm text-gray-500 hover:text-gray-700"
            >
              ← Change number
            </button>
          </div>
        )}

        {step === 'done' && (
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
              <span className="text-3xl">✓</span>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">You're in</h2>
            <p className="text-gray-500 text-sm">Setting up your profile...</p>
          </div>
        )}

      </div>
    </main>
  )
}