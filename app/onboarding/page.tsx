'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

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

  return (
    <main className="min-h-screen bg-white flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">

        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
            <span className="text-3xl">👋</span>
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">Welcome</h1>
          <p className="text-gray-500 mt-1 text-sm">Tell us a little about yourself</p>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Your name
          </label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !loading && name.trim().length >= 2 && address.trim().length >= 5) saveProfile() }}
            placeholder="e.g. Enkhjargal"
            className="w-full rounded-xl border border-gray-300 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Pickup address
          </label>
          <textarea
            value={address}
            onChange={e => setAddress(e.target.value)}
            placeholder="District, khoroo, building / apartment — where the van should collect your dog"
            rows={3}
            className="w-full rounded-xl border border-gray-300 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
          />
          <p className="text-xs text-gray-400 mt-1">We use this to assign your hiking zone.</p>
        </div>

        <div className="mb-8">
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Preferred language
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setLanguage('en')}
              className={`py-3 rounded-xl border-2 text-sm font-medium transition-colors ${
                language === 'en'
                  ? 'border-green-500 bg-green-50 text-green-700'
                  : 'border-gray-200 text-gray-600'
              }`}
            >
              🇬🇧 English
            </button>
            <button
              onClick={() => setLanguage('mn')}
              className={`py-3 rounded-xl border-2 text-sm font-medium transition-colors ${
                language === 'mn'
                  ? 'border-green-500 bg-green-50 text-green-700'
                  : 'border-gray-200 text-gray-600'
              }`}
            >
              🇲🇳 Mongolian
            </button>
          </div>
        </div>

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        <button
          onClick={saveProfile}
          disabled={loading || name.trim().length < 2 || address.trim().length < 5}
          className="w-full bg-green-600 text-white py-3 rounded-xl font-medium text-sm disabled:opacity-50 hover:bg-green-700 transition-colors"
        >
          {loading ? 'Saving...' : 'Continue →'}
        </button>

      </div>
    </main>
  )
}