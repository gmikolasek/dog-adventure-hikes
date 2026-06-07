'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import { getUserState, landingRoute } from '@/lib/userState'

const FONT = "'Noto Sans', system-ui, sans-serif"

const inputBase: React.CSSProperties = {
  borderRadius: 10,
  border: '1px solid #E8E2D9',
  padding: '12px',
  fontSize: 14,
  color: '#171717',
  backgroundColor: 'white',
  WebkitTextFillColor: '#171717',
  outline: 'none',
  fontFamily: FONT,
  boxSizing: 'border-box',
}

const btnPrimary: React.CSSProperties = {
  width: '100%',
  backgroundColor: '#26452B',
  color: 'white',
  padding: '14px',
  borderRadius: 12,
  fontWeight: 600,
  fontSize: 15,
  border: 'none',
  cursor: 'pointer',
  fontFamily: FONT,
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 14,
  fontWeight: 700,
  color: '#3B2A1F',
  marginBottom: 8,
  fontFamily: FONT,
}

export default function Home() {
  const router = useRouter()
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [step, setStep] = useState<'phone' | 'otp' | 'done'>('phone')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [otpFocused, setOtpFocused] = useState(false)

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
    <main style={{ minHeight: '100vh', backgroundColor: '#F5F0E8', fontFamily: FONT, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 24px' }}>
      <div style={{ width: '100%', maxWidth: 384 }}>

        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <Image src="/images/logo.png" width={160} height={120} alt="Tails to Trails" style={{ objectFit: 'contain' }} />
        </div>

        {step === 'phone' && (
          <div>
            <label style={labelStyle}>Phone number</label>
            <div style={{ display: 'flex', marginBottom: 6 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', padding: '0 14px', border: '1px solid #E8E2D9', borderRight: 'none', borderRadius: '10px 0 0 10px', backgroundColor: '#F0EBE3', color: '#3B2A1F', fontSize: 14, fontFamily: FONT, whiteSpace: 'nowrap', flexShrink: 0 }}>
                +976
              </span>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !loading && phone.length >= 7) sendOtp() }}
                placeholder="8800 0000"
                style={{ ...inputBase, flex: 1, borderRadius: '0 10px 10px 0' }}
              />
            </div>
            <p style={{ color: '#8A7E72', fontSize: 13, marginBottom: 24, fontFamily: FONT }}>
              We&apos;ll send you a verification code
            </p>
            {error && <p style={{ color: '#ef4444', fontSize: 14, marginBottom: 16 }}>{error}</p>}
            <button
              onClick={sendOtp}
              disabled={loading || phone.length < 7}
              style={{ ...btnPrimary, opacity: loading || phone.length < 7 ? 0.5 : 1, cursor: loading || phone.length < 7 ? 'not-allowed' : 'pointer' }}
            >
              {loading ? 'Sending...' : 'Send verification code'}
            </button>
          </div>
        )}

        {step === 'otp' && (
          <div>
            <p style={{ fontSize: 14, color: '#8A7E72', marginBottom: 24, fontFamily: FONT }}>
              Enter the 6-digit code sent to{' '}
              <span style={{ fontWeight: 600, color: '#3B2A1F' }}>+976 {phone}</span>
            </p>
            <label style={labelStyle}>Verification code</label>
            <input
              type="number"
              value={otp}
              onChange={e => setOtp(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !loading && otp.length >= 6) verifyOtp() }}
              onFocus={() => setOtpFocused(true)}
              onBlur={() => setOtpFocused(false)}
              placeholder="000000"
              maxLength={6}
              style={{ ...inputBase, width: '100%', textAlign: 'center', letterSpacing: '0.25em', fontSize: 22, marginBottom: 24, border: otpFocused ? '2px solid #26452B' : '1px solid #E8E2D9' }}
            />
            {error && <p style={{ color: '#ef4444', fontSize: 14, marginBottom: 16 }}>{error}</p>}
            <button
              onClick={verifyOtp}
              disabled={loading || otp.length < 6}
              style={{ ...btnPrimary, marginBottom: 12, opacity: loading || otp.length < 6 ? 0.5 : 1, cursor: loading || otp.length < 6 ? 'not-allowed' : 'pointer' }}
            >
              {loading ? 'Verifying...' : 'Verify code'}
            </button>
            <button
              onClick={() => setStep('phone')}
              style={{ width: '100%', background: 'none', border: 'none', fontSize: 14, color: '#8A7E72', cursor: 'pointer', padding: '8px', fontFamily: FONT }}
            >
              ← Change number
            </button>
          </div>
        )}

        {step === 'done' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 64, height: 64, borderRadius: '50%', backgroundColor: '#E8F0E5', marginBottom: 16 }}>
              <span style={{ fontSize: 28, color: '#26452B', fontWeight: 700 }}>✓</span>
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#3B2A1F', marginBottom: 8, fontFamily: FONT }}>You&apos;re in</h2>
            <p style={{ color: '#8A7E72', fontSize: 14, fontFamily: FONT }}>Setting up your profile...</p>
          </div>
        )}

      </div>
    </main>
  )
}
