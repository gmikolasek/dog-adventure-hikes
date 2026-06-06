'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getUserState, landingRoute } from '@/lib/userState'

const FONT = "'Noto Sans', system-ui, sans-serif"

// ─── Logo mark SVG ────────────────────────────────────────────────────────────

function LogoMark() {
  return (
    <svg width="72" height="60" viewBox="0 0 72 60" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Background mountain */}
      <path d="M8 48 L28 18 L48 48 Z" fill="white" fillOpacity="0.35" />
      {/* Mid mountain */}
      <path d="M22 48 L44 10 L66 48 Z" fill="white" fillOpacity="0.6" />
      {/* Foreground mountain */}
      <path d="M2 48 L18 24 L34 48 Z" fill="white" fillOpacity="0.9" />
      {/* Snow cap */}
      <path d="M18 24 L22 30 L14 30 Z" fill="white" />
      {/* Dog silhouette */}
      <ellipse cx="46" cy="43" rx="7" ry="4" fill="white" />
      <ellipse cx="52" cy="40.5" rx="4.5" ry="3.5" fill="white" />
      <path d="M53 37.5 L56 35 L55 38" fill="white" />
      <line x1="41" y1="47" x2="39" y2="52" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="44" y1="47" x2="43" y2="52" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="48" y1="47" x2="49" y2="52" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="51" y1="47" x2="53" y2="52" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M39 42 C36 39 34 41 36 43" stroke="white" strokeWidth="1.8" strokeLinecap="round" fill="none" />
    </svg>
  )
}

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

  // Set to true once public/images/landing-hero.jpg is added
  const hasHeroImage = false

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
      {hasHeroImage && (
        <div
          style={{
            position: 'absolute', inset: 0,
            backgroundImage: 'url(/images/landing-hero.jpg)',
            backgroundSize: 'cover', backgroundPosition: 'center',
            zIndex: 0,
          }}
        />
      )}

      {/* Fallback mountain landscape */}
      {!hasHeroImage && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 0, lineHeight: 0 }}>
          <svg viewBox="0 0 375 220" width="100%" height="220" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMax slice">
            <path d="M0 140 C60 90,130 110,190 100 C250 90,310 70,375 85 L375 220 L0 220 Z" fill="#1a3020" fillOpacity="0.5" />
            <path d="M0 160 C50 130,110 148,170 140 C230 132,300 118,375 130 L375 220 L0 220 Z" fill="#1a3020" fillOpacity="0.7" />
            <path d="M0 180 C30 168,70 175,110 170 C150 164,185 158,220 165 C260 172,320 165,375 170 L375 220 L0 220 Z" fill="#1a3020" />
          </svg>
        </div>
      )}

      {/* Dark gradient overlay */}
      <div
        style={{
          position: 'absolute', inset: 0, zIndex: 1,
          background: 'linear-gradient(to top, rgba(0,0,0,0.75) 40%, rgba(0,0,0,0.2) 100%)',
        }}
      />

      {/* Content — anchored to bottom third */}
      <div
        style={{
          position: 'relative', zIndex: 2,
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'flex-end',
          paddingBottom: 80,
          paddingLeft: 32, paddingRight: 32,
          maxWidth: 420, width: '100%', margin: '0 auto',
        }}
      >
        {/* Brand block */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 28 }}>
          <LogoMark />

          <h1
            style={{
              color: '#fff', fontWeight: 700, fontSize: 28,
              letterSpacing: '0.15em', fontFamily: FONT,
              marginTop: 16, marginBottom: 10,
              textAlign: 'center', lineHeight: 1,
            }}
          >
            TAILS TO TRAILS
          </h1>

          {/* Ruled subtitle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', maxWidth: 300 }}>
            <div style={{ flex: 1, height: 1, backgroundColor: '#E6C89A', opacity: 0.4 }} />
            <p
              style={{
                color: '#E6C89A', fontSize: 12, letterSpacing: '0.2em',
                fontFamily: FONT, fontWeight: 500, whiteSpace: 'nowrap',
              }}
            >
              ADVENTURE HIKES MONGOLIA
            </p>
            <div style={{ flex: 1, height: 1, backgroundColor: '#E6C89A', opacity: 0.4 }} />
          </div>
        </div>

        {/* Tagline */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <p style={{ color: '#fff', fontSize: 16, fontFamily: FONT, marginBottom: 6 }}>
            Adventure. Connection. Freedom.
          </p>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, fontFamily: FONT }}>
            For dogs. For people.
          </p>
        </div>

        {/* Buttons */}
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
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
