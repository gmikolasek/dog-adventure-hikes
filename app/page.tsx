'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import { getUserState, landingRoute } from '@/lib/userState'

const FONT = "'Noto Sans', system-ui, sans-serif"

function IconPaw({ size = 16, color = '#E6C89A' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <circle cx="5.5" cy="5.5" r="2.5" />
      <circle cx="18.5" cy="5.5" r="2.5" />
      <circle cx="3.5" cy="11" r="2" />
      <circle cx="20.5" cy="11" r="2" />
      <path d="M12 13c-2.5 0-6 2.5-6 6 0 1.5 1 2 2 2h8c1 0 2-.5 2-2 0-3.5-3.5-6-6-6z" />
    </svg>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    async function check() {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        const state = await getUserState(session.user.id)
        router.replace(landingRoute(state))
        return
      }
      setChecking(false)
    }
    check()
  }, [router])

  if (checking) {
    return <div style={{ backgroundColor: '#26452B', minHeight: '100vh' }} />
  }

  return (
    <main
      style={{
        minHeight: '100dvh',
        height: '100dvh',
        overflow: 'hidden',
        fontFamily: FONT,
        position: 'relative',
        backgroundColor: '#26452B',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Hero image */}
      <Image
        src="/images/landing-hero.jpg"
        alt="Tails to Trails"
        fill
        priority
        style={{ objectFit: 'cover', objectPosition: '60% center' }}
      />

      {/* Dark gradient overlay */}
      <div
        style={{
          position: 'absolute', inset: 0, zIndex: 1,
          background: 'linear-gradient(to top, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.1) 50%, transparent 100%)',
        }}
      />

      {/* Content — bottom 40% */}
      <div
        style={{
          position: 'relative', zIndex: 2,
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'flex-end',
          paddingBottom: 60,
          paddingLeft: 32, paddingRight: 32,
          maxWidth: 420, width: '100%', margin: '0 auto',
        }}
      >
        {/* Logo */}
        <div style={{ marginBottom: 28 }}>
          <Image src="/images/logo.png" alt="Tails to Trails" width={280} height={200} style={{ objectFit: 'contain' }} />
        </div>

        {/* Tagline */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <p style={{ color: '#fff', fontSize: 20, fontFamily: FONT, marginBottom: 6 }}>
            Adventure. Connection. Freedom.
          </p>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 16, fontFamily: FONT }}>
            For dogs. For people.
          </p>
        </div>

        {/* Buttons */}
        <div style={{ width: '100%', maxWidth: 420, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button
            onClick={() => router.push('/onboarding')}
            style={{
              width: '100%', height: 54, borderRadius: 30, border: 'none',
              backgroundColor: '#E08A3E', color: '#fff',
              fontFamily: FONT, fontWeight: 600, fontSize: 16,
              cursor: 'pointer', display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: 10,
            }}
          >
            Get Started
            <IconPaw size={18} color="#fff" />
          </button>

          <button
            onClick={() => router.push('/login')}
            style={{
              width: '100%', height: 54, borderRadius: 30,
              border: '2px solid #fff', backgroundColor: 'transparent',
              color: '#fff', fontFamily: FONT, fontWeight: 600, fontSize: 16,
              cursor: 'pointer',
            }}
          >
            Log In
          </button>
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          position: 'absolute', bottom: 24, left: 0, right: 0,
          zIndex: 2, display: 'flex', alignItems: 'center',
          justifyContent: 'center', gap: 6,
        }}
      >
        <IconPaw size={13} color="#E6C89A" />
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, fontFamily: FONT }}>
          Trusted by dogs and their humans across Mongolia
        </p>
      </div>
    </main>
  )
}
