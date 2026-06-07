'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

const FONT = "'Noto Sans', system-ui, sans-serif"

const inputBase: React.CSSProperties = {
  width: '100%',
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

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 14,
  fontWeight: 700,
  color: '#3B2A1F',
  marginBottom: 8,
  fontFamily: FONT,
}

export default function Onboarding() {
  const [name, setName] = useState('')
  const [language, setLanguage] = useState<'en' | 'mn'>('en')
  const [address, setAddress] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  // No auth guard here — unauthenticated users reach this page from the
  // landing page "Get Started" button. The saveProfile handler below checks
  // for a session before writing to the DB.

  async function saveProfile() {
    setLoading(true)
    setError('')

    const { data: { session } } = await supabase.auth.getSession()
    // if (!session) { router.push('/'); return }
    if (!session) return

    const { error } = await supabase
      .from('users')
      .upsert({
        id: session.user.id,
        phone: session.user.phone,
        name,
        language,
        address,
        role: 'client',
      })

    if (error) {
      setError(error.message)
    } else {
      router.push('/onboarding/dog')
    }
    setLoading(false)
  }

  const canSubmit = !loading && name.trim().length >= 2 && address.trim().length >= 5

  return (
    <main style={{ minHeight: '100vh', backgroundColor: '#F5F0E8', fontFamily: FONT, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: 384 }}>

        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <Image src="/images/logo.png" width={160} height={120} alt="Tails to Trails" style={{ objectFit: 'contain' }} />
          <h1 style={{ fontSize: 28, fontWeight: 700, color: '#3B2A1F', marginTop: 16, marginBottom: 6, fontFamily: FONT }}>Welcome</h1>
          <p style={{ color: '#8A7E72', fontSize: 15, fontFamily: FONT }}>Tell us a little about yourself</p>
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={labelStyle}>Your name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && canSubmit) saveProfile() }}
            placeholder="e.g. Enkhjargal"
            style={inputBase}
          />
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={labelStyle}>Pickup address</label>
          <textarea
            value={address}
            onChange={e => setAddress(e.target.value)}
            placeholder="District, khoroo, building / apartment — where the van should collect your dog"
            rows={3}
            style={{ ...inputBase, resize: 'none' }}
          />
          <p style={{ color: '#8A7E72', fontSize: 12, marginTop: 4, fontFamily: FONT }}>We use this to assign your hiking zone.</p>
        </div>

        <div style={{ marginBottom: 32 }}>
          <label style={{ ...labelStyle, marginBottom: 12 }}>Preferred language</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {(['en', 'mn'] as const).map(lang => (
              <button
                key={lang}
                onClick={() => setLanguage(lang)}
                style={{
                  padding: '12px',
                  borderRadius: 10,
                  border: language === lang ? '2px solid #26452B' : '1px solid #E8E2D9',
                  backgroundColor: language === lang ? '#E8F0E5' : 'white',
                  color: language === lang ? '#26452B' : '#8A7E72',
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontFamily: FONT,
                }}
              >
                {lang === 'en' ? '🇬🇧 English' : '🇲🇳 Mongolian'}
              </button>
            ))}
          </div>
        </div>

        {error && <p style={{ color: '#ef4444', fontSize: 14, marginBottom: 16 }}>{error}</p>}

        <button
          onClick={saveProfile}
          disabled={!canSubmit}
          style={{ width: '100%', backgroundColor: '#26452B', color: 'white', padding: '14px', borderRadius: 12, fontWeight: 600, fontSize: 15, border: 'none', cursor: canSubmit ? 'pointer' : 'not-allowed', opacity: canSubmit ? 1 : 0.5, fontFamily: FONT }}
        >
          {loading ? 'Saving...' : 'Continue →'}
        </button>

      </div>
    </main>
  )
}
