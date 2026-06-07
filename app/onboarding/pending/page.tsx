'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getUserState } from '@/lib/userState'

const FONT = "'Noto Sans', system-ui, sans-serif"

const statusItems = [
  { label: 'Account created', done: true },
  { label: 'Dog profile submitted', done: true },
  { label: 'Agreement accepted', done: true },
]

export default function Pending() {
  const router = useRouter()

  useEffect(() => {
    let active = true

    async function check() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!active) return
      if (!session) return

      const state = await getUserState(session.user.id)
      if (!active) return

      // Approved (with or without conditions) AND placed in a zone → activated.
      const dogApproved = state.dogs.some(
        d => d.approval_status === 'approved' || d.approval_status === 'approved_with_conditions'
      )
      if (dogApproved && state.profile?.zone_id) {
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

        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 80, height: 80, borderRadius: '50%', backgroundColor: '#E8F0E5', marginBottom: 24 }}>
          <span style={{ fontSize: 36 }}>🐾</span>
        </div>

        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#3B2A1F', marginBottom: 12, fontFamily: FONT }}>You&apos;re on the list</h1>
        <p style={{ color: '#8A7E72', fontSize: 14, lineHeight: 1.6, marginBottom: 32, fontFamily: FONT }}>
          Your profile and dog details have been submitted. Our team will review your application and be in touch shortly.
        </p>

        <div style={{ backgroundColor: 'white', border: '1px solid #E8E2D9', borderRadius: 16, padding: 16, textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {statusItems.map(item => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', backgroundColor: '#26452B', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ color: 'white', fontSize: 12, fontWeight: 700 }}>✓</span>
              </div>
              <span style={{ fontSize: 14, color: '#3B2A1F', fontFamily: FONT }}>{item.label}</span>
            </div>
          ))}

          {/* Awaiting review */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 24, height: 24, borderRadius: '50%', backgroundColor: '#F59E0B', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ color: 'white', fontSize: 10 }}>⏳</span>
            </div>
            <span style={{ fontSize: 14, color: '#3B2A1F', fontFamily: FONT }}>Awaiting team review</span>
          </div>

          {/* Future step */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 24, height: 24, borderRadius: '50%', backgroundColor: '#E8E2D9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ color: '#8A7E72', fontSize: 12 }}>5</span>
            </div>
            <span style={{ fontSize: 14, color: '#8A7E72', fontFamily: FONT }}>Book your first hike</span>
          </div>
        </div>

        <button
          onClick={signOut}
          style={{ marginTop: 24, background: 'none', border: 'none', fontSize: 14, color: '#8A7E72', cursor: 'pointer', fontFamily: FONT }}
        >
          Sign out
        </button>

      </div>
    </main>
  )
}
